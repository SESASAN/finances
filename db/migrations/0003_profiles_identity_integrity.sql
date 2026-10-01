-- 0003_profiles_identity_integrity.sql
-- profiles.email is a MIRROR of auth.users.email (the verified one). profiles_update_self does
-- not restrict columns, so an authenticated user could rewrite it via a direct PostgREST call
-- that never touches the Next.js layer. Shape mirrors prevent_self_admin_escalation (0001) and
-- the review that produced 0002_workspace_members_role_gating.sql.

-- 0) Repair any row that already diverged, before the guard makes it impossible.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- 1) Guard: reject direct changes to profiles.email.
create function public.prevent_profile_email_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.email is distinct from old.email
     and coalesce(current_setting('app.profile_email_sync', true), 'off') <> 'on'
     and current_user <> 'service_role' then
    raise exception 'profiles.email mirrors auth.users.email and cannot be changed directly';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_profile_email_change() from public, anon, authenticated;

create trigger trg_prevent_profile_email_change
  before update on public.profiles
  for each row execute function public.prevent_profile_email_change();

-- 2) Sanctioned sync path: Supabase's own verified email-change flow updates auth.users.email;
--    mirror it into profiles. Lives in `private` (not `public`) because a SECURITY DEFINER
--    function in an exposed schema is a public RPC endpoint by default -- exactly what
--    0002_advisor_fixes.sql had to retroactively revoke for handle_new_user(). Don't repeat it.
create function private.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    -- Transaction-local (3rd arg = true), so it cannot leak across requests on a pooled
    -- connection. `authenticated` cannot set this: PostgREST exposes no way to set an
    -- arbitrary GUC, and pg_catalog.set_config is not in an exposed schema.
    perform set_config('app.profile_email_sync', 'on', true);
    update public.profiles set email = new.email where id = new.id;
    perform set_config('app.profile_email_sync', 'off', true);
  end if;
  return new;
end;
$$;

revoke execute on function private.sync_profile_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_profile_email();

-- Rollback:
--   drop trigger on_auth_user_email_changed on auth.users;
--   drop function private.sync_profile_email();
--   drop trigger trg_prevent_profile_email_change on public.profiles;
--   drop function public.prevent_profile_email_change();
-- No data change -- the migration only forbids writes.
