-- 0002_advisor_fixes.sql
-- Fixes from get_advisors(security) / get_advisors(performance) after 0001.

-- 1) Lock down SECURITY DEFINER trigger functions: Postgres grants EXECUTE to
--    PUBLIC by default, which exposes them as callable RPC endpoints via
--    PostgREST (/rest/v1/rpc/handle_new_user, /rest/v1/rpc/check_budget_alert).
--    They only need to fire as triggers, which does not require EXECUTE grants.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_budget_alert() from public, anon, authenticated;

-- 2) Merge the two invitations SELECT policies into one. Two permissive
--    policies for the same role+action both get evaluated per query; a
--    single OR'd policy is equivalent and cheaper.
drop policy invitations_select_workspace on public.invitations;
drop policy invitations_select_own_invite on public.invitations;

create policy invitations_select on public.invitations
  for select to authenticated
  using (
    private.is_workspace_member(workspace_id)
    or email = (select auth.jwt()) ->> 'email'
  );

-- 3) auth.jwt() ->> 'email' wasn't being hoisted into an init plan with the
--    previous wrapping order. Apply the extraction outside the select instead
--    of inside it, and redo the accept-own-invite policy the same way.
drop policy invitations_accept_own_invite on public.invitations;

create policy invitations_accept_own_invite on public.invitations
  for update to authenticated
  using (email = (select auth.jwt()) ->> 'email' and accepted_at is null)
  with check (email = (select auth.jwt()) ->> 'email');

-- 4) Missing FK-column indexes flagged by the linter.
create index idx_accounts_currency_code on public.accounts (currency_code);
create index idx_audit_log_actor on public.audit_log (actor_id);
create index idx_notifications_workspace on public.notifications (workspace_id);
create index idx_recurring_rules_account on public.recurring_rules (account_id);
create index idx_recurring_rules_currency_code on public.recurring_rules (currency_code);
create index idx_subscriptions_currency_code on public.subscriptions (currency_code);
create index idx_transactions_account on public.transactions (account_id);
create index idx_transactions_currency_code on public.transactions (currency_code);
create index idx_transactions_user on public.transactions (user_id);
