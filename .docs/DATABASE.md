# Database

Applied to Supabase via MCP (`apply_migration`). Source of truth for structure
is `ARCHITECTURE.md` section 4 — this document explains *how* it was built and
the decisions ARCHITECTURE.md doesn't spell out. SQL lives in the repo at:

```
db/migrations/0001_initial_schema.sql   -- tables, enums, indexes, triggers, view
db/migrations/0002_advisor_fixes.sql    -- fixes from get_advisors() after 0001
db/policies/0001_rls_policies.sql       -- RLS, applied as migration "rls_policies"
```

Live migration history (`list_migrations`): `initial_schema` → `rls_policies` →
`advisor_fixes`.

Drizzle is in `package.json` but the schema was **not** written Drizzle-first —
SQL was applied directly via MCP for speed. `db/schema/*.ts` is still empty;
generating Drizzle types from the live DB (`drizzle-kit introspect` / hand-written
to match) is a separate follow-up task.

---

## 1. Naming resolution: workspaces, not households

`plan-app-finanzas.md` (the product-context doc) uses `households`. This schema
uses `workspaces` / `workspace_members`, matching `ARCHITECTURE.md`, because that
file states explicitly it's the technical source of truth. Same entity, different
name — no functional gap.

## 2. transactions is unified, transfers is a view

`ARCHITECTURE.md` merges `incomes`/`expenses`/`transfers` into one `transactions`
table with a `type` discriminator, and says `transfers` is *"vista derivada"*.
That's implemented literally:

- `transactions.type` is `'income' | 'expense' | 'transfer'`.
- A transfer is **two** `transactions` rows sharing one `transfer_pair_id` — one
  per account leg.
- `public.transfers` is a `VIEW` (`WITH (security_invoker = true)`) that joins
  those two rows back into a single from/to row. It carries no RLS of its own;
  `security_invoker` makes it enforce the *querying user's* RLS on the
  underlying `transactions` table instead of the view owner's — without that
  flag, views bypass RLS by default in Postgres.

### Amount sign convention (not in ARCHITECTURE.md — filled in here)

The doc lists `amount NUMERIC(15,2)` for `transactions` without specifying sign.
Since a transfer's two legs need to be told apart with only the columns
ARCHITECTURE.md lists (no extra `direction` column), the convention is:

| type | amount |
|---|---|
| `income` / `expense` | always **positive**; `type` carries the meaning |
| `transfer` | **signed** — negative on the leg that debits `account_id` (source), positive on the leg that credits it (destination) |

This makes account balance a single uniform formula:
`sum(case when type = 'expense' then -amount else amount end)`. Enforced by
`transactions_amount_sign_check`.

## 3. category_id has no FK — it's trigger-validated

`income_categories` and `expense_categories` are two separate tables (per
ARCHITECTURE.md, not merged), but `transactions.category_id` /
`recurring_rules.category_id` is a single column. Postgres can't `REFERENCES`
two tables from one column, so there's no FK on `category_id` — instead,
`validate_category_for_workspace()` (`BEFORE INSERT OR UPDATE` trigger on both
tables) checks the row exists in the *matching* categories table for that
`workspace_id`, and that `category_id` is required for income/expense and
`NULL` for transfers (also backed by a `CHECK` constraint at the DB level).

## 4. profiles mirrors auth.users

ARCHITECTURE.md lists `users (id, email, name, created_at) -- managed by
Supabase Auth`. Supabase Auth owns `auth.users`, which the app schema can't add
columns to (e.g. `is_admin`, needed for the `admin/` panel gate in section 11).
Standard Supabase pattern: `public.profiles` mirrors it, kept in sync by
`handle_new_user()`, a `SECURITY DEFINER` trigger on `auth.users AFTER INSERT`.

`is_admin` is writable only by a `service_role` connection —
`prevent_self_admin_escalation()` raises if a normal session tries to flip it,
so a compromised or buggy client can't self-promote to admin.

## 5. Multi-tenancy: RLS via a private helper function

Every workspace-scoped table is gated by `private.is_workspace_member(workspace_id)`
— a `SECURITY DEFINER` function in the non-exposed `private` schema (not
`public`, so PostgREST never turns it into an RPC endpoint). It bypasses RLS
internally, which is what lets `workspace_members`' own policies reference
`workspace_members` without recursive RLS evaluation.

Two spots need a different rule than "you're a workspace member":

- **`workspace_members` INSERT** — bootstrap problem: a freshly created
  workspace has zero membership rows, so `is_workspace_member()` is false for
  its own owner until *something* inserts the first row. The policy adds an
  OR-branch: the workspace's `owner_id` can always insert their own first
  membership row.
- **`invitations`** — the invitee isn't a workspace member yet. They can read
  and accept (`UPDATE accepted_at`) only their *own* pending invite, matched
  by `email = (select auth.jwt()) ->> 'email'`.

All `(select auth.uid())` / `(select auth.jwt())` calls are wrapped in `select`
per Supabase's RLS performance guidance — otherwise Postgres re-evaluates the
function once per row instead of once per statement.

### What RLS does *not* enforce here

Role granularity (`owner`/`admin`/`member` restricting *which* member can
invite, remove members, or delete a workspace) is not encoded in RLS — any
workspace member can currently manage other members. ARCHITECTURE.md section 7
(`withPlanGuard`) and section 10 (Server Actions) put authorization logic at
the app layer, not the DB layer, and role-based command gating fits that same
layer. `workspaces` DELETE is the one exception restricted at the DB level (to
`owner_id`), since destroying a tenant's data is high-blast-radius enough to
warrant defense in depth.

## 6. Budget alert trigger (ARCHITECTURE.md section 9)

Section 9 lists *"Budget alerts: En cada INSERT de expense → Trigger"* as a
DB-level job, unlike the other jobs in that table (which are pg_cron / Edge
Functions — out of scope here, no columns specified for them yet). Implemented
as `check_budget_alert()`, `AFTER INSERT ON transactions`: sums the month's
spend for the category and inserts a `notifications` row once it crosses 80%
of `budget_monthly`.

Known v1 limitation: it re-fires on every subsequent expense past the 80%
line (no dedupe within the month). Not specified in ARCHITECTURE.md, so not
built — flagging it here instead of guessing at a dedupe rule.

## 7. Reference data: currencies, exchange_rates

`currencies` isn't in ARCHITECTURE.md's table list, but `accounts`,
`transactions`, `recurring_rules`, `subscriptions`, and `exchange_rates` all
carry `currency_code`, and the project needs referential integrity on it
(`NUMERIC` money + string currency codes is exactly the kind of thing this
project's own philosophy says shouldn't be trusted to app-layer validation
alone). Added as a small catalog table, seeded with 10 common ISO 4217 codes
(USD, EUR, COP, MXN, ARS, GBP, BRL, CLP, PEN, CAD — extend as needed).

Both tables are public-read for `authenticated` (`using (true)`) — writes are
expected to come from pg_cron / Edge Functions via `service_role`, which
bypasses RLS entirely, so no write policy exists for `authenticated`.

## 8. Explicitly not built yet

- **Materialized view for historical summaries** (section 8) — ARCHITECTURE.md
  names it but doesn't specify its columns; not enough to build against.
- **pg_cron jobs** (section 9: exchange rate fetch, recurring materialization,
  subscription reminders, materialized view refresh) — these are Edge
  Functions / cron schedules, not schema. Separate task once those functions
  exist.
- **Drizzle schema** (`db/schema/*.ts`) — deferred per the SQL-direct-via-MCP
  decision made for this task; needs introspection or hand-authoring next.
- **RLS cross-tenant test suite** (`tests/integration/rls.test.ts`, mandated as
  a non-skippable test in section 14) — needs real Supabase Auth users to test
  against, i.e. needs the auth flow scaffolded first.

## 9. Advisor pass

`get_advisors(security)` and `get_advisors(performance)` were run after 0001
and again after 0002. Remaining items are both expected/inert:

- `processed_webhook_events` has RLS enabled with no policies — intentional,
  locks it to `service_role` only.
- `unused_index` on every new index — expected on an empty database with no
  query history yet; not a real signal until there's traffic.

Fixed before landing (see `0002_advisor_fixes.sql`): `check_budget_alert()` and
`handle_new_user()` were reachable as public RPC endpoints (Postgres grants
`EXECUTE` to `PUBLIC` by default on new functions) — revoked; two RLS policies
on `invitations` were re-evaluating `auth.jwt()` per row instead of once per
statement — rewritten; `invitations` had two permissive `SELECT` policies for
the same role — merged into one; nine FK columns were missing covering
indexes — added.
