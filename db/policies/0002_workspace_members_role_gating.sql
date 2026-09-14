-- 0002_workspace_members_role_gating.sql
-- Fixes privilege-escalation gap found in security review of 0001_rls_policies.sql:
-- workspace_members INSERT/UPDATE/DELETE policies only checked workspace membership,
-- not role, letting any 'member' self-promote to owner/admin, grant owner to anyone,
-- or remove any other member (including the real owner) via direct PostgREST calls
-- that bypass the Next.js Server Action layer entirely.
--
-- Verified against a live (empty) dev database inside a rolled-back transaction:
-- member self-promote, member->owner insert, and admin->owner grant are all blocked;
-- self-removal (leave workspace) and owner/admin managing non-owner members still work.

create function private.get_workspace_role(p_workspace_id uuid)
returns public.workspace_role
language sql
security definer
stable
set search_path = ''
as $$
  select role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = (select auth.uid())
$$;

revoke execute on function private.get_workspace_role(uuid) from public, anon;
grant execute on function private.get_workspace_role(uuid) to authenticated;

drop policy workspace_members_insert on public.workspace_members;

create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    -- Bootstrap: the workspace owner creating their own first membership row.
    (
      role = 'owner'
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = (select auth.uid())
      )
    )
    or
    -- Adding another member: caller must already be owner/admin, and cannot grant 'owner'.
    (
      private.get_workspace_role(workspace_id) in ('owner', 'admin')
      and role <> 'owner'
    )
  );

drop policy workspace_members_update on public.workspace_members;

create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (
    -- Only the owner may touch an 'owner' row; admins may manage non-owner rows only.
    case private.get_workspace_role(workspace_id)
      when 'owner' then true
      when 'admin' then role <> 'owner'
      else false
    end
  );

drop policy workspace_members_delete on public.workspace_members;

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    -- Anyone may remove their own membership (leave workspace)...
    user_id = (select auth.uid())
    -- ...or an owner/admin may remove a non-owner member.
    or (
      private.get_workspace_role(workspace_id) in ('owner', 'admin')
      and role <> 'owner'
    )
  );
