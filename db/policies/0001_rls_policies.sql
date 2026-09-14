-- 0001_rls_policies.sql
-- Row Level Security for all tenant-scoped tables. Source of truth:
-- .docs/ARCHITECTURE.md section 5 (RLS + scopedTo, defense in depth).
--
-- Patterns applied throughout (per Supabase RLS performance guidance):
--   * (select auth.uid()) instead of bare auth.uid() — evaluated once per
--     statement instead of once per row.
--   * TO authenticated always paired with an ownership/membership predicate
--     (TO authenticated alone is authentication, not authorization).
--   * UPDATE policies always carry both USING and WITH CHECK.
--   * Membership checks go through private.is_workspace_member(), a
--     SECURITY DEFINER helper — avoids the recursive-RLS cost of a bare
--     subquery on workspace_members referencing itself.

-- ============================================================================
-- Helper: is the current user a member of this workspace?
-- SECURITY DEFINER bypasses RLS internally, so this does not recurse through
-- workspace_members' own policies.
-- ============================================================================
create function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- ============================================================================
-- profiles
-- ============================================================================
alter table public.profiles enable row level security;

create policy profiles_select_self_or_workspace_mates on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select wm2.user_id
      from public.workspace_members wm1
      join public.workspace_members wm2 on wm2.workspace_id = wm1.workspace_id
      where wm1.user_id = (select auth.uid())
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- is_admin is protected separately by trg_prevent_self_admin_escalation.
-- No INSERT/DELETE policy: rows are created by handle_new_user() (SECURITY
-- DEFINER) and deleted via the auth.users cascade.

-- ============================================================================
-- workspaces
-- ============================================================================
alter table public.workspaces enable row level security;

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (private.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (private.is_workspace_member(id))
  with check (private.is_workspace_member(id));

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ============================================================================
-- workspace_members
-- Note: baseline is "any member can manage members." Finer role gating
-- (owner/admin-only invite or removal) is left to withPlanGuard / Server
-- Action authorization per ARCHITECTURE.md section 7 — not encoded in RLS.
-- ============================================================================
alter table public.workspace_members enable row level security;

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = (select auth.uid())
    )
  );
-- The OR branch is the bootstrap path: a freshly created workspace has zero
-- membership rows, so is_workspace_member() is false until the owner's own
-- row is inserted. Without it, nobody could ever join their own workspace.

create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- invitations
-- Two actor types: existing workspace members (create/list/revoke invites)
-- and the invitee (reads and accepts their own pending invite by email —
-- they are not a workspace member yet, so is_workspace_member() is false).
-- ============================================================================
alter table public.invitations enable row level security;

create policy invitations_select_workspace on public.invitations
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy invitations_select_own_invite on public.invitations
  for select to authenticated
  using (email = (select auth.jwt() ->> 'email'));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy invitations_accept_own_invite on public.invitations
  for update to authenticated
  using (email = (select auth.jwt() ->> 'email') and accepted_at is null)
  with check (email = (select auth.jwt() ->> 'email'));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- accounts
-- ============================================================================
alter table public.accounts enable row level security;

create policy accounts_select on public.accounts
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy accounts_insert on public.accounts
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy accounts_update on public.accounts
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy accounts_delete on public.accounts
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- income_categories
-- ============================================================================
alter table public.income_categories enable row level security;

create policy income_categories_select on public.income_categories
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy income_categories_insert on public.income_categories
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy income_categories_update on public.income_categories
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy income_categories_delete on public.income_categories
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- expense_categories
-- ============================================================================
alter table public.expense_categories enable row level security;

create policy expense_categories_select on public.expense_categories
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy expense_categories_insert on public.expense_categories
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy expense_categories_update on public.expense_categories
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy expense_categories_delete on public.expense_categories
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- recurring_rules
-- ============================================================================
alter table public.recurring_rules enable row level security;

create policy recurring_rules_select on public.recurring_rules
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy recurring_rules_insert on public.recurring_rules
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy recurring_rules_update on public.recurring_rules
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy recurring_rules_delete on public.recurring_rules
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- transactions
-- INSERT additionally pins user_id to the caller — you cannot log a
-- transaction as registered by someone else.
-- ============================================================================
alter table public.transactions enable row level security;

create policy transactions_select on public.transactions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and user_id = (select auth.uid())
  );

create policy transactions_update on public.transactions
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy transactions_delete on public.transactions
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- subscriptions
-- ============================================================================
alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy subscriptions_insert on public.subscriptions
  for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

create policy subscriptions_delete on public.subscriptions
  for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- ============================================================================
-- notifications
-- Personal, not workspace-shared: a user only sees their own. Rows are
-- written by triggers (SECURITY DEFINER) or backend jobs — no INSERT/DELETE
-- policy for authenticated.
-- ============================================================================
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- audit_log
-- Append-only from the app layer (logAudit() per ARCHITECTURE.md section
-- 10). No UPDATE/DELETE policy anywhere — an audit trail that can be edited
-- is not an audit trail.
-- ============================================================================
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and actor_id = (select auth.uid())
  );

-- ============================================================================
-- currencies / exchange_rates: shared reference data, public read.
-- Writes come only from service-role jobs (pg_cron / Edge Functions), which
-- bypass RLS entirely — no write policy needed or wanted for authenticated.
-- ============================================================================
alter table public.currencies enable row level security;

create policy currencies_select on public.currencies
  for select to authenticated
  using (true);

alter table public.exchange_rates enable row level security;

create policy exchange_rates_select on public.exchange_rates
  for select to authenticated
  using (true);

-- ============================================================================
-- processed_webhook_events: service-role only, no policies for anon/authenticated.
-- RLS enabled with zero policies means the table is fully inaccessible to
-- both roles; only service_role (which bypasses RLS) can read or write it.
-- ============================================================================
alter table public.processed_webhook_events enable row level security;
