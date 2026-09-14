-- 0001_initial_schema.sql
-- Core schema for Finanzas SaaS: workspaces, accounts, categories, transactions,
-- recurring rules, subscriptions, exchange rates, notifications, audit log.
-- Source of truth: .docs/ARCHITECTURE.md section 4.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;

-- Private schema for internal helper functions (never exposed via Data API)
create schema if not exists private;

-- ============================================================================
-- Enums
-- ============================================================================
create type public.workspace_plan as enum ('free', 'pro', 'family');
create type public.workspace_plan_status as enum ('active', 'trialing', 'canceled', 'past_due');
create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.transaction_type as enum ('income', 'expense', 'transfer');
create type public.recurring_frequency as enum ('daily', 'weekly', 'monthly', 'yearly');
create type public.subscription_billing_cycle as enum ('monthly', 'quarterly', 'yearly');
create type public.subscription_status as enum ('active', 'canceled', 'paused');

-- ============================================================================
-- profiles (mirrors auth.users; holds app-specific columns Supabase Auth doesn't)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Mirrors auth.users. Populated by handle_new_user() trigger on signup.';

-- ============================================================================
-- workspaces
-- ============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles (id),
  plan public.workspace_plan not null default 'free',
  plan_status public.workspace_plan_status not null default 'trialing',
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'member',
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- currencies (reference catalog, not tenant-scoped)
-- ============================================================================
create table public.currencies (
  code text primary key,
  symbol text not null,
  name text not null
);

insert into public.currencies (code, symbol, name) values
  ('USD', '$', 'US Dollar'),
  ('EUR', '€', 'Euro'),
  ('COP', '$', 'Colombian Peso'),
  ('MXN', '$', 'Mexican Peso'),
  ('ARS', '$', 'Argentine Peso'),
  ('GBP', '£', 'British Pound'),
  ('BRL', 'R$', 'Brazilian Real'),
  ('CLP', '$', 'Chilean Peso'),
  ('PEN', 'S/', 'Peruvian Sol'),
  ('CAD', '$', 'Canadian Dollar');

-- ============================================================================
-- accounts
-- ============================================================================
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  currency_code text not null references public.currencies (code),
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================================
-- categories
-- ============================================================================
create table public.income_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  budget_monthly numeric(15, 2) check (budget_monthly is null or budget_monthly > 0),
  icon text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================================
-- recurring_rules (created before transactions: transactions.recurring_rule_id -> here)
-- ============================================================================
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.transaction_type not null,
  account_id uuid not null references public.accounts (id),
  category_id uuid,
  amount numeric(15, 2) not null check (amount > 0),
  currency_code text not null references public.currencies (code),
  frequency public.recurring_frequency not null,
  next_occurrence date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recurring_rules_category_null_for_transfer check (
    (type = 'transfer' and category_id is null) or (type <> 'transfer')
  )
);

-- ============================================================================
-- transactions
-- amount sign convention (documented, not just implementation detail):
--   income/expense  -> amount is always POSITIVE; `type` carries the meaning.
--   transfer        -> amount is SIGNED: negative on the leg that debits
--                       account_id (source), positive on the leg that credits
--                       account_id (destination). Both legs share transfer_pair_id.
-- This lets balance = sum(case when type='expense' then -amount else amount end)
-- work uniformly across all three types without a separate direction column.
-- ============================================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.transaction_type not null,
  account_id uuid not null references public.accounts (id),
  category_id uuid,
  transfer_pair_id uuid,
  amount numeric(15, 2) not null,
  currency_code text not null references public.currencies (code),
  occurred_at timestamptz not null default now(),
  note text,
  user_id uuid not null references public.profiles (id),
  is_auto_generated boolean not null default false,
  recurring_rule_id uuid references public.recurring_rules (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint transactions_amount_sign_check check (
    (type in ('income', 'expense') and amount > 0) or
    (type = 'transfer' and amount <> 0)
  ),
  constraint transactions_transfer_pair_check check (
    (type = 'transfer' and transfer_pair_id is not null) or
    (type <> 'transfer' and transfer_pair_id is null)
  ),
  constraint transactions_category_null_for_transfer check (
    (type = 'transfer' and category_id is null) or (type <> 'transfer')
  )
);

-- ============================================================================
-- subscriptions
-- ============================================================================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  service text not null,
  cost numeric(15, 2) not null check (cost > 0),
  currency_code text not null references public.currencies (code),
  billing_cycle public.subscription_billing_cycle not null,
  renewal_date date not null,
  remind_days_before integer not null default 3 check (remind_days_before >= 0),
  status public.subscription_status not null default 'active',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================================
-- exchange_rates (reference data, not tenant-scoped)
-- ============================================================================
create table public.exchange_rates (
  from_currency text not null references public.currencies (code),
  to_currency text not null references public.currencies (code),
  rate numeric(20, 10) not null check (rate > 0),
  fetched_at timestamptz not null default now(),
  primary key (from_currency, to_currency)
);

-- ============================================================================
-- notifications
-- ============================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  type text not null,
  message text not null,
  payload jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- audit_log
-- ============================================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- processed_webhook_events (idempotency guard for Stripe webhooks)
-- ============================================================================
create table public.processed_webhook_events (
  event_id text primary key,
  source text not null,
  processed_at timestamptz not null default now()
);

-- ============================================================================
-- transfers: derived view over transactions (Architecture 4: "vista derivada")
-- security_invoker so it respects the querying user's RLS on transactions,
-- not the view creator's.
-- ============================================================================
create view public.transfers
with (security_invoker = true) as
select
  t_from.transfer_pair_id as id,
  t_from.workspace_id,
  t_from.account_id as from_account_id,
  t_to.account_id as to_account_id,
  t_to.amount as amount,
  t_from.currency_code,
  t_from.occurred_at,
  t_from.note,
  t_from.user_id,
  t_from.created_at,
  t_from.deleted_at
from public.transactions t_from
join public.transactions t_to
  on t_to.transfer_pair_id = t_from.transfer_pair_id
  and t_to.id <> t_from.id
where t_from.type = 'transfer'
  and t_from.amount < 0;

-- ============================================================================
-- Indexes
-- Architecture 4 lists the tenant/date/account/category composite indexes
-- explicitly. FK-column indexes below are added on top per Postgres best
-- practice (FKs are not auto-indexed and RLS subqueries hit these paths).
-- ============================================================================

-- Explicit indexes from ARCHITECTURE.md
create index idx_transactions_workspace_date
  on public.transactions (workspace_id, occurred_at desc) where deleted_at is null;

create index idx_transactions_workspace_account
  on public.transactions (workspace_id, account_id, occurred_at desc) where deleted_at is null;

create index idx_transactions_workspace_category
  on public.transactions (workspace_id, category_id, occurred_at desc) where deleted_at is null;

create index idx_accounts_workspace_active
  on public.accounts (workspace_id) where deleted_at is null and is_active = true;

create index idx_audit_workspace_recent
  on public.audit_log (workspace_id, created_at desc);

create index idx_notifications_user_unread
  on public.notifications (user_id, created_at desc) where read_at is null;

create index idx_recurring_rules_active
  on public.recurring_rules (next_occurrence) where is_active = true and deleted_at is null;

create index idx_subscriptions_renewal
  on public.subscriptions (workspace_id, renewal_date) where status = 'active' and deleted_at is null;

-- FK / RLS lookup indexes (not listed in ARCHITECTURE.md, added for correctness)
create index idx_workspace_members_user on public.workspace_members (user_id);
create index idx_workspaces_owner on public.workspaces (owner_id);
create index idx_invitations_workspace on public.invitations (workspace_id);
create index idx_invitations_email on public.invitations (email) where accepted_at is null;
create index idx_income_categories_workspace on public.income_categories (workspace_id) where deleted_at is null;
create index idx_expense_categories_workspace on public.expense_categories (workspace_id) where deleted_at is null;
create index idx_recurring_rules_workspace on public.recurring_rules (workspace_id) where deleted_at is null;
create index idx_transactions_transfer_pair on public.transactions (transfer_pair_id) where transfer_pair_id is not null;
create index idx_transactions_recurring_rule on public.transactions (recurring_rule_id) where recurring_rule_id is not null;
create index idx_subscriptions_workspace on public.subscriptions (workspace_id) where deleted_at is null;
create index idx_exchange_rates_to_currency on public.exchange_rates (to_currency);

-- ============================================================================
-- Trigger: sync auth.users -> public.profiles on signup
-- ============================================================================
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Trigger: prevent a user from granting themselves admin via a normal update
-- ============================================================================
create function public.prevent_self_admin_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user <> 'service_role' then
    raise exception 'is_admin can only be changed by a service-role process';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_admin_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_admin_escalation();

-- ============================================================================
-- Trigger: validate polymorphic category_id (Postgres can't FK to two tables)
-- Applies to both transactions and recurring_rules (same column shape).
-- ============================================================================
create function public.validate_category_for_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'income' then
    if new.category_id is null then
      raise exception 'category_id is required for type=income';
    end if;
    if not exists (
      select 1 from public.income_categories
      where id = new.category_id and workspace_id = new.workspace_id
    ) then
      raise exception 'category_id % is not a valid income_categories row for this workspace', new.category_id;
    end if;
  elsif new.type = 'expense' then
    if new.category_id is null then
      raise exception 'category_id is required for type=expense';
    end if;
    if not exists (
      select 1 from public.expense_categories
      where id = new.category_id and workspace_id = new.workspace_id
    ) then
      raise exception 'category_id % is not a valid expense_categories row for this workspace', new.category_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_transaction_category
  before insert or update on public.transactions
  for each row execute function public.validate_category_for_workspace();

create trigger trg_validate_recurring_rule_category
  before insert or update on public.recurring_rules
  for each row execute function public.validate_category_for_workspace();

-- ============================================================================
-- Trigger: budget alert (Architecture 9: "En cada INSERT de expense")
-- Fires a notification when accumulated spend for the month crosses 80% of
-- the category's monthly budget. Known v1 limitation: re-fires on every
-- subsequent expense past the threshold (no dedupe) — acceptable for now,
-- not specified in ARCHITECTURE.md.
-- SECURITY DEFINER: writes to notifications on behalf of the inserting user,
-- who has no INSERT policy on that table (system-generated rows only).
-- ============================================================================
create function public.check_budget_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget numeric(15, 2);
  v_spent numeric(15, 2);
begin
  if new.type <> 'expense' or new.category_id is null then
    return new;
  end if;

  select budget_monthly into v_budget
  from public.expense_categories
  where id = new.category_id;

  if v_budget is null or v_budget <= 0 then
    return new;
  end if;

  select coalesce(sum(amount), 0) into v_spent
  from public.transactions
  where category_id = new.category_id
    and type = 'expense'
    and deleted_at is null
    and date_trunc('month', occurred_at) = date_trunc('month', new.occurred_at);

  if v_spent >= v_budget * 0.8 then
    insert into public.notifications (workspace_id, user_id, type, message, payload)
    values (
      new.workspace_id,
      new.user_id,
      'budget_alert',
      format('Category budget at %s%% of monthly limit', round((v_spent / v_budget) * 100)),
      jsonb_build_object('category_id', new.category_id, 'spent', v_spent, 'budget', v_budget)
    );
  end if;

  return new;
end;
$$;

create trigger trg_check_budget_alert
  after insert on public.transactions
  for each row execute function public.check_budget_alert();
