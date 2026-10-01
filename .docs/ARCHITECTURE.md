# Architecture: Finanzas SaaS

> **Fuente de verdad técnica**. Si este doc y el código divergen, gana el código (PR con justificación y actualización de este archivo en el mismo commit).
> **Documento de contexto / viaje del producto**: ver `plan-app-finanzas.md` en `/home/sesasan/Documentos/Proyectos/Finanzas/`.

---

## 1. Stack

| Capa | Tecnología | Razón en una línea |
|---|---|---|
| Framework | **Next.js 15** (App Router) + **TypeScript** strict | Server Components eliminan API routes internas; tipos son red de seguridad en dominio monetario |
| UI | **shadcn/ui** + **Tailwind CSS** | Componentes accesibles, copiables, sin dependencia runtime |
| Forms | **react-hook-form** + **Zod** | Schema compartido con Drizzle (un solo source of truth) |
| ORM | **Drizzle** | Tipos sin runtime pesado, migraciones SQL limpias |
| DB | **Supabase Postgres** | Una consola, RLS nativa, extensiones (pg_cron, pg_crypto) |
| Auth | **Supabase Auth** | Email + OAuth + magic links, cookies server-side |
| Storage | **Supabase Storage** | Recibos/adjuntos, RLS también aplica |
| Cron / Background | **Supabase pg_cron** + Edge Functions | Sin servicio externo para escala personal |
| Billing | **Stripe** + Customer Portal | No construir UI de billing |
| Email | **Resend** + **React Email** | Templates en JSX, dominio propio, DKIM |
| Errores | **Sentry** | Free tier suficiente |
| Analytics | **Plausible** | Privacy-friendly, sin cookie banner |
| Gráficas | **Recharts** | Liviano, suficiente para dashboards |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Standard 2026 |
| Hosting | **Vercel** | Deploy atómico, edge network |

---

## 2. Patrón arquitectónico

**Modular monolith sobre Next.js App Router.** Una sola app, una sola DB, deploys atómicos. Las separaciones se hacen por **módulos de dominio** (`features/*`), no por servicios.

### Por qué monolito (no microservicios)

- **Cohesión del dominio**: todo está scoped a `workspace_id` (cuentas, transacciones, presupuestos, suscripciones comparten RLS, `audit_log`, cache tags).
- **Equipo pequeño**: deploys independientes por equipo no aplican aún.
- **Next.js App Router es fundamentalmente un monolito** — separarlo significa dos repos, dos deploys, dos auth flows, CORS, doble observabilidad. Cero beneficio.
- **Volumen real**: ~200K filas/mes en `transactions` con 1K workspaces pagados. Postgres + índices `(workspace_id, occurred_at)` lo resuelve.

**Trigger para extraer un módulo a servicio** (revisar decisión si):
- Equipo >5 ingenieros pisándose PRs.
- Un módulo con 100x más carga que el resto (ej. ingestion bancaria de alta frecuencia).
- Necesidad de tech stack distinto (ej. ML en Python).

### Por qué modular internamente

Aunque es un proceso, las boundaries entre `features/*` son estrictas: ningún feature importa de otro feature. Comunicación entre features solo vía contratos en `lib/` o eventos explícitos. Esto permite extracción futura si hace falta.

---

## 3. Estructura de carpetas

```
finances/
├── app/                              # Next.js routes
│   ├── (marketing)/                  # Sitio público (sin auth, SEO)
│   │   ├── page.tsx                  # Landing
│   │   ├── pricing/page.tsx
│   │   └── features/page.tsx
│   ├── (auth)/                       # Signup, login, forgot
│   ├── (app)/                        # SaaS autenticado
│   │   └── [workspace]/
│   │       ├── layout.tsx            # Carga workspace, plan guard contextual
│   │       ├── dashboard/
│   │       ├── accounts/
│   │       ├── transactions/
│   │       ├── budgets/
│   │       ├── subscriptions/
│   │       └── settings/
│   │           ├── billing/          # Stripe customer portal redirect
│   │           └── members/          # Invites + roles
│   ├── api/
│   │   ├── webhooks/stripe/          # Webhook handler (raw body, signature)
│   │   ├── cron/                     # External cron triggers
│   │   └── account/{export,delete}   # Compliance endpoints (GDPR-style)
│   └── admin/                        # Panel interno (solo owner)
├── features/                         # Módulos de dominio
│   ├── auth/                         # Supabase auth helpers
│   ├── workspaces/                   # CRUD + membership
│   ├── accounts/
│   ├── transactions/
│   ├── budgets/
│   ├── subscriptions/
│   ├── recurring/                    # Reglas recurrentes
│   ├── billing/                      # Planes, guard, customer portal
│   ├── notifications/
│   └── audit/
├── lib/                              # Shared utilities
│   ├── db/                           # Cliente Drizzle, migraciones
│   ├── auth/                         # Sesión Supabase, middleware
│   ├── money.ts                      # Helpers monetarios (Money class)
│   ├── cache.ts                      # Tag helpers
│   ├── email/                        # Templates React Email + Resend
│   ├── billing/
│   │   ├── plans.ts                  # Definición de planes (código)
│   │   ├── guard.ts                  # withPlanGuard
│   │   └── limits.ts                 # Lectura de límites y uso
│   ├── rate-limit.ts
│   └── validation/                   # Schemas Zod compartidos
├── components/                       # UI primitives (shadcn) + layouts
├── db/
│   ├── schema/                       # Drizzle schemas por dominio
│   ├── migrations/                   # SQL migrations generadas
│   └── policies/                     # RLS policies (SQL)
├── tests/
│   ├── unit/                         # Vitest
│   ├── integration/                  # Vitest + Supabase local
│   └── e2e/                          # Playwright
├── public/
├── .env.example
├── package.json
├── tsconfig.json                     # strict: true
├── AGENTS.md                         # Convenciones para AI assistants
└── ARCHITECTURE.md                   # Este archivo
```

### Regla de oro: features no se importan entre sí

`features/expenses/` puede importar de `lib/`, pero **nunca** de `features/budgets/`. Si necesitas data de otro feature, expones un query en `features/budgets/queries.ts` y lo importas. Comunicación siempre vía contratos explícitos.

---

## 4. Modelo de datos

### Tablas principales

```
workspaces (
  id, name, owner_id,
  plan,                              -- 'free' | 'pro' | 'family'
  plan_status,                       -- 'active' | 'trialing' | 'canceled' | 'past_due'
  stripe_customer_id,
  stripe_subscription_id,
  trial_ends_at, current_period_ends_at,
  created_at, deleted_at
)

workspace_members (
  workspace_id, user_id, role,       -- 'owner' | 'admin' | 'member'
  joined_at, PRIMARY KEY (workspace_id, user_id)
)

invitations (
  id, workspace_id, email, role, token,
  expires_at, accepted_at, created_at
)

users (id, email, name, created_at)  -- managed by Supabase Auth

accounts (
  id, workspace_id, name, currency_code,
  icon, is_active, created_at, deleted_at
)

income_categories (id, workspace_id, name, deleted_at)

expense_categories (
  id, workspace_id, name,
  budget_monthly,                    -- NUMERIC(15,2)
  icon, created_at, deleted_at
)

transactions (
  id, workspace_id,
  type,                              -- 'income' | 'expense' | 'transfer'
  account_id, category_id,           -- category_id NULL para transfers
  transfer_pair_id,                  -- agrupa las 2 entradas de un transfer
  amount, currency_code,             -- amount NUMERIC(15,2)
  occurred_at, note,
  user_id,                           -- quién lo registró
  is_auto_generated,                 -- de recurring_rule
  recurring_rule_id,
  created_at, deleted_at
)

transfers (
  id, workspace_id,
  from_account_id, to_account_id,
  amount, currency_code,
  occurred_at, note,
  user_id, created_at, deleted_at
)  -- vista derivada; un transfer = 2 transactions vinculadas por transfer_pair_id

recurring_rules (
  id, workspace_id, type,
  account_id, category_id,
  amount, currency_code,
  frequency,                         -- 'daily'|'weekly'|'monthly'|'yearly'
  next_occurrence, is_active,
  created_at, deleted_at
)

subscriptions (
  id, workspace_id, service,
  cost, currency_code,
  billing_cycle,                     -- 'monthly'|'quarterly'|'yearly'
  renewal_date, remind_days_before,
  status,                            -- 'active'|'canceled'|'paused'
  created_at, deleted_at
)

exchange_rates (
  from_currency, to_currency, rate,  -- rate NUMERIC(20,10)
  fetched_at, PRIMARY KEY (from_currency, to_currency)
)

notifications (
  id, workspace_id, user_id,
  type, message, payload,            -- payload JSONB
  sent_at, read_at, created_at
)

audit_log (
  id, workspace_id, actor_id,
  action, entity_type, entity_id,
  before, after,                     -- JSONB
  created_at
)

processed_webhook_events (
  event_id PRIMARY KEY, source, processed_at
)
```

### Índices críticos

```sql
CREATE INDEX idx_transactions_workspace_date
  ON transactions(workspace_id, occurred_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_transactions_workspace_account
  ON transactions(workspace_id, account_id, occurred_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_transactions_workspace_category
  ON transactions(workspace_id, category_id, occurred_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_accounts_workspace_active
  ON accounts(workspace_id) WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX idx_audit_workspace_recent
  ON audit_log(workspace_id, created_at DESC);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE INDEX idx_recurring_rules_active
  ON recurring_rules(next_occurrence) WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_subscriptions_renewal
  ON subscriptions(workspace_id, renewal_date) WHERE status = 'active' AND deleted_at IS NULL;
```

---

## 5. Multi-tenancy: RLS + scopedTo (defense in depth)

### Capa 1: helper `scopedTo(workspaceId)`

Cada query en `features/*/queries.ts` pasa por este helper que inyecta el scope. Imposible olvidarlo si es el patrón estándar.

```ts
// lib/db/scope.ts
export async function scopedQuery<T>(
  workspaceId: string,
  queryBuilder: (workspaceId: string) => Promise<T>
): Promise<T> {
  // 1. Verifica que el user es miembro del workspace (early throw)
  // 2. Ejecuta el query con workspace_id inyectado
  // 3. Retorna resultado
}
```

### Capa 2: Row Level Security en Postgres

Toda tabla con datos de tenant lleva RLS. Política base:

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_workspace_isolation ON transactions
  FOR ALL TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid()
  ));
```

### Test crítico de RLS

Suite en `tests/integration/rls.test.ts` que crea 2 workspaces con 2 usuarios distintos, intenta cruzar, y **asserta 0 filas** en cada intento cross-tenant. Si un test pasa cuando debería fallar, RLS está roto — bloquea deploy.

---

## 6. Reglas de dinero

### En DB

- `NUMERIC(15,2)` para todo monto. **Nunca** `FLOAT` / `DOUBLE PRECISION`.
- `NUMERIC(20,10)` para tasas de cambio (precisión alta).

### En TypeScript

Helper `Money` (no `number` para montos):

```ts
// lib/money.ts
export class Money {
  constructor(public readonly cents: bigint) {}
  static fromMajor(value: number | string, currency: string): Money { ... }
  toMajor(): string { ... }
  add(other: Money): Money { ... }
  // ...
}
```

BigInt evita problemas de precisión con valores monetarios grandes.

### Conversión de moneda

Helper único que lee `exchange_rates` con cache de 24h. Toda conversión pasa por él:

```ts
import { convert } from '@/lib/money'
const total = await convert(amount, 'USD', baseCurrency, workspaceId)
```

**Nunca** hardcodear tasas ni hacer conversión inline.

---

## 7. Planes y límites (withPlanGuard)

### Planes en código

```ts
// lib/billing/plans.ts
export const PLANS = {
  free:   {
    label: 'Free',
    priceMonthly: 0,
    stripePriceId: null,
    limits: { transactions: 50, workspaces: 1, seats: 1 },
    features: { multiCurrency: false, advancedReports: false, family: false },
  },
  pro:    {
    label: 'Pro',
    priceMonthly: 500,  // centavos
    stripePriceId: process.env.STRIPE_PRICE_PRO!,
    limits: { transactions: Infinity, workspaces: Infinity, seats: 1 },
    features: { multiCurrency: true, advancedReports: true, family: false },
  },
  family: {
    label: 'Family',
    priceMonthly: 900,
    stripePriceId: process.env.STRIPE_PRICE_FAMILY!,
    limits: { transactions: Infinity, workspaces: Infinity, seats: 5 },
    features: { multiCurrency: true, advancedReports: true, family: true },
  },
} as const;
```

### withPlanGuard

Toda Server Action que toque un recurso con límite usa el guard:

```ts
// features/transactions/actions.ts
'use server'
export async function createTransaction(input: CreateTransaction) {
  return withPlanGuard(input.workspaceId, 'transactions.create', async () => {
    return db.insert(transactions).values(input).returning()
  })
}
```

`withPlanGuard` internamente:
1. Lee `workspace.plan`.
2. Cuenta uso del período actual (cacheado, tag `usage:{workspaceId}:{month}`).
3. Si excede límite → throw `PlanLimitError`.
4. Si pasa → ejecuta la acción y registra uso.

La UI captura `PlanLimitError` y muestra upgrade modal con link a `/settings/billing`.

---

## 8. Cache y cálculos

| Cálculo | Estrategia | Invalidación |
|---|---|---|
| Saldo de cuenta | `unstable_cache` con tag `account:{id}:balance` | `revalidateTag` al insertar/editar/borrar transacción de esa cuenta |
| % presupuesto del mes | `unstable_cache` con tag `budget:{categoryId}:{YYYY-MM}` | `revalidateTag` al insertar/editar expense de la categoría |
| Resumen histórico | Vista materializada refrescada por pg_cron diario | Cron diario |
| Exchange rates | Tabla `exchange_rates` + cache de 24h en memoria | pg_cron diario |
| Lista de workspaces del user | `unstable_cache` con tag `user:{userId}:workspaces` | Al aceptar invitación / crear workspace |

**Regla**: nunca calcular saldos o % presupuesto en el cliente. Siempre del servidor. El cliente solo renderiza.

---

## 9. Background jobs (pg_cron + Edge Functions)

| Job | Frecuencia | Implementación |
|---|---|---|
| Fetch exchange rates | Diario 03:00 UTC | Edge Function llama API externa → upsert en `exchange_rates` |
| Materialize recurring transactions | Diario 04:00 UTC | pg_cron: inserta transactions desde `recurring_rules` con `next_occurrence <= today` |
| Subscription reminders | Diario 05:00 UTC | pg_cron: busca subscriptions con `renewal_date - remind_days_before = today` → crea notifications + envía email |
| Budget alerts | En cada INSERT de expense | Trigger: si gasto_acumulado_mes > 80% budget → crea notification |
| Refresh material views | Diario 06:00 UTC | pg_cron: `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| Stripe webhook processing | On-demand | Handler en `/api/webhooks/stripe` con verificación de firma |

---

## 10. Server Components + Server Actions

### Patrón default

- **Fetch inicial** en Server Component vía `features/*/queries.ts`.
- **Mutación** en Server Action vía `features/*/actions.ts`.
- **Invalidación** de cache con `revalidateTag()` después de mutar.
- **Formularios** con `react-hook-form` en cliente; submit llama a Server Action vía `<form action={createTransaction}>` o `useFormState`.

```ts
// features/transactions/actions.ts
'use server'
export async function deleteTransaction(id: string, workspaceId: string) {
  const { accountId, categoryId } = await getTransactionMeta(id)
  await scopedTo(workspaceId, db.delete(transactions).where(eq(transactions.id, id)))
  await logAudit(workspaceId, 'transaction.delete', { id })
  revalidateTag(`account:${accountId}:balance`)
  revalidateTag(`budget:${categoryId}:${getCurrentMonth()}`)
}
```

### API routes solo para

- **Webhooks** (Stripe) — necesitan raw body y firma.
- **Cron triggers externos** (si Vercel Cron > pg_cron en algún caso).
- **Endpoints públicos** sin sesión (ej. health check).
- **Account export/delete** (compliance, mejor como endpoint JSON).
- **Callbacks de auth** (redirect externo con querystring: `code`, `token_hash`). Viven en
  `app/auth/*`, **no** en `app/api/*`, porque responden `303 Location` y no JSON, y su URL es
  configuración externa (Google Console + allow-list de redirects de Supabase): tiene que ser estable.

---

## 11. Auth flow

Supabase Auth con cookies (server-side friendly via `@supabase/ssr`):

- Email + password.
- Magic link.
- Google OAuth.
- Confirmación de email **obligatoria** post-signup (reduce spam/abuse).
- Password reset vía Supabase default.

### Proxy (`proxy.ts` en la raíz → `lib/auth/session-proxy.ts`)

> **Next.js 16**: el fichero `middleware.ts` está **deprecado** y se llama `proxy.ts`; el export
> se llama `proxy`, no `middleware`. Además el Proxy corre por defecto en el runtime **Node.js**
> (no Edge), y poner `export const runtime` en un fichero de Proxy lanza error.

Dos capas, separadas a propósito:

**Capa 1 — `proxy.ts`: refresco de sesión + redirect de conveniencia. Nada más.**
Construye el cliente SSR con `getAll`/`setAll`, llama a `supabase.auth.getUser()` y devuelve
**el mismo objeto `NextResponse` sobre el que Supabase escribió las cookies**. Devolver un
`NextResponse` nuevo descarta en silencio la sesión refrescada (bug clásico de `@supabase/ssr`:
logouts aleatorios). `setAll` recibe un segundo argumento `headers` con `Cache-Control`/`Expires`/
`Pragma`: hay que aplicarlos, o un CDN puede cachear el `Set-Cookie` de un usuario y servírselo a
otro. La decisión de redirect vive en `resolveAuthRedirect()`, función pura y testeada.

**Capa 2 — `app/(app)/[workspace]/layout.tsx`: resolución de workspace.**
Cargar el workspace, redirigir a `/onboarding` y propagar `x-workspace-id` **no** son tarea del
Proxy. Pertenecen a `features/workspaces` (el Proxy es de `features/auth`), y meterlos ahí obliga a
una query a Postgres por request en el camino crítico de *todas* las rutas, incluidas las públicas,
para un dato que el segmento necesita una sola vez. Se hacen en el layout del segmento.

#### Regla no negociable: el Proxy es UX, nunca un límite de autorización

El Proxy es una conveniencia de redirect. Se puede saltear (los bypass de middleware por spoofing
de headers son una clase conocida de CVE en Next.js) y **no corre nunca** para una llamada directa
a PostgREST / Data API. Por lo tanto:

- Todo Server Component y toda Server Action rederiva la identidad con `supabase.auth.getUser()`
  — **nunca** `getSession()`, que confía en una cookie sin verificar.
- RLS sigue siendo el único límite real. Misma lección que
  `db/policies/0002_workspace_members_role_gating.sql`: un chequeo en la capa de aplicación **no**
  neutraliza un agujero de RLS.
- `raw_user_meta_data` y `profiles.name` son **editables por el usuario**: nunca usarlos en una
  decisión de autorización. Los datos de autorización van en `app_metadata` o en tablas propias
  con RLS. `profiles.email` es un espejo de `auth.users.email` y es inmutable desde el cliente
  (`trg_prevent_profile_email_change`, migración 0003).

Rutas:
- `(marketing)/`, `(auth)/`, `app/auth/*`: públicas.
- `(app)/[workspace]/*`: requieren sesión (el Proxy redirige a `/login?next=…`) + workspace válido
  (lo valida el layout) + RLS.
- `admin/`: requiere `profiles.is_admin = true`, verificado en el servidor. **No** en el Proxy.

---

## 12. Setup del entorno

### Variables requeridas

```bash
# .env.example
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Finanzas"  # TBD

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=           # server only, NUNCA al cliente

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=                    # price_xxx
STRIPE_PRICE_FAMILY=                 # price_xxx

# Resend
RESEND_API_KEY=
EMAIL_FROM=noreply@tudominio.com

# Sentry
SENTRY_DSN=

# Plausible
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

### Pasos para correr local

1. `git clone` y `cd finances`
2. `cp .env.example .env.local` y rellenar
3. `npm install`
4. Crear proyecto en [supabase.com](https://supabase.com), copiar URL + anon key + service role key a `.env.local`
5. `npm run db:push` — aplica schema
6. `npm run db:policies` — aplica RLS policies
7. `npm run db:seed` — opcional, datos de demo
8. `npm run dev`
9. Tests: `npm run test` (unit) / `npm run test:e2e` (Playwright)

### Configuración externa one-time

- **Stripe**: crear Products `Pro` y `Family` con precios recurring mensuales. Configurar webhook endpoint `https://<app>/api/webhooks/stripe`. Copiar `STRIPE_WEBHOOK_SECRET` del dashboard.
- **Resend**: verificar dominio de envío. Configurar SPF/DKIM/DMARC en DNS.
- **Sentry**: crear proyecto Next.js, copiar DSN.
- **Plausible**: agregar dominio (self-hosted o cloud).

---

## 13. Workflow

### Branches

- `main` — producción, protegido, requiere PR + checks.
- `feat/<scope>` — features (ej. `feat/onboarding-wizard`).
- `fix/<scope>` — bugs.
- `chore/<scope>` — tareas no funcionales.
- `refactor/<scope>` — refactorings sin cambio de comportamiento.

### Commits

Conventional Commits:
- `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`
- Scope opcional: `feat(billing): add upgrade modal`.

### Definition of Done

Una feature está "done" cuando:
- [ ] Tests unitarios cubren la lógica nueva
- [ ] Migración DB si cambió schema
- [ ] RLS policy si es tabla nueva o cambió acceso
- [ ] `withPlanGuard` si la acción toca recurso limitado
- [ ] `revalidateTag` correspondiente si invalida cache
- [ ] Sin `any` (excepto justificado en comentario)
- [ ] Sin secrets commiteados
- [ ] Sin warnings de lint
- [ ] Sin warnings de typecheck
- [ ] Probada manualmente en dev

### Pre-deploy checklist

- [ ] `npm run lint` pasa
- [ ] `npm run typecheck` pasa
- [ ] `npm run test` pasa
- [ ] `npm run test:e2e` pasa
- [ ] `npm run db:migrate` corrido en staging y producción
- [ ] Variables de entorno configuradas en Vercel para producción
- [ ] Webhook de Stripe apunta a URL de producción
- [ ] Sentry release versionado
- [ ] CHANGELOG actualizado

---

## 14. Testing

| Tipo | Herramienta | Qué cubre |
|---|---|---|
| Unit | **Vitest** | Helpers (`Money`, `withPlanGuard`, conversiones moneda), lógica pura |
| Integration | **Vitest** + Supabase local (Docker) | Queries con RLS, transacciones, triggers |
| E2E | **Playwright** | Flujos completos: signup → onboarding → primer movimiento, upgrade de plan, invitación a miembro |
| Cross-tenant | Custom en `tests/integration/rls.test.ts` | 2 workspaces, intentos cross-tenant → assert 0 filas |

### Tests críticos (no skipeables)

1. **RLS cross-tenant**: intento de leer/escribir datos de otro workspace debe fallar.
2. **Money precision**: conversiones, sumas, redondeos no pierden centavos.
3. **Plan guard**: usuario Free no puede crear la transacción #51 del mes.
4. **Webhook idempotency**: mismo `event_id` procesado dos veces → un solo efecto.
5. **Recurring materialization**: regla `monthly` no genera duplicados si corre 2 veces.

---

## 15. Decisiones arquitectónicas (log)

| Fecha | Decisión | Motivo | Trigger para revisar |
|---|---|---|---|
| 2026-07-25 | Monolito modular | Cohesión del dominio, equipo pequeño, escala actual | >5 ingenieros, o módulo con 100x más carga |
| 2026-07-25 | Drizzle sobre Prisma | Tipos sin runtime, migraciones SQL limpias, mejor con edge functions | Si Drizzle no cubre un caso específico (raro) |
| 2026-07-25 | pg_cron sobre Inngest/Trigger.dev | Una sola consola, gratis, suficiente para escala personal | Si >100K workspaces o jobs >30s |
| 2026-07-25 | Plausible sobre PostHog | Privacy-friendly, sin cookie banner, suficiente para validar | Si necesitas funnels o cohorts complejos |
| 2026-07-25 | Sin Redis inicialmente | `unstable_cache` de Next.js cubre hasta dolor real | Si cache hit rate <80% o latencia >500ms |
| 2026-07-25 | `Money` class con BigInt | Evita errores de precisión en operaciones monetarias | Nunca (es una invariante del dominio) |
| 2026-07-25 | NUMERIC(15,2) en DB | Nunca FLOAT para dinero | Nunca |
| 2026-09-14 | `profiles.email` inmutable desde el cliente (trigger + sync desde `auth.users`) | `profiles_update_self` no restringe columnas: un PATCH directo a PostgREST podía falsear el email espejo; se vuelve account-takeover cuando las invitaciones matcheen por email | Nunca (invariante); revisar si `auth.users` deja de ser la fuente de verdad |
| 2026-09-14 | Aceptar filas huérfanas en `profiles` de signups sin confirmar | Sin confirmar no hay sesión ⇒ no hay `auth.uid()` ⇒ RLS niega todo, y `anon` no tiene policy; `on delete cascade` las limpia junto al `auth.users` | Si son una porción medible de `profiles`, o si algo busca por `profiles.email` en vez de `auth.users.email` |
| 2026-09-14 | Dos route handlers de callback: `/auth/callback` (PKCE `code`) y `/auth/confirm` (`token_hash`) | El verifier PKCE vive en una cookie del navegador que inició el flujo; un link de email se abre rutinariamente en otro navegador o en un preview de webmail | Si Supabase unifica ambos flujos |
| 2026-09-14 | `proxy.ts` en vez de `middleware.ts` | `middleware` está deprecado en Next 16 y renombrado a `proxy`; además el Proxy corre en Node.js runtime por defecto | Cuando Next elimine el alias `middleware` |

---

## 16. Open questions

- [ ] **Nombre del producto** (blocker #1 — afecta env vars, metadata, emails)
- [ ] **Dominio** (ej. `finanzas.app`, `budgetflow.com`, etc.)
- [ ] **Límite exacto del plan Free** (propuesta actual: 50 mov/mes)
- [ ] **Stripe Price IDs** (después de crear productos)
- [ ] **Política de retención** tras cancelación de cuenta (propuesta: 30 días, después hard delete)
- [ ] **Idiomas en v1** (propuesta: solo español)
- [ ] **Soporte al cliente** (propuesta: email propio `support@tudominio.com` con Resend)
- [ ] **Política de reembolso** (propuesta: 7 días)
- [ ] **Trial period** (propuesta: 14 días para Pro al registrarse)
- [ ] **Confirmar si se cobra anual** (propuesta: v1 solo mensual)
- [ ] Migrar `NEXT_PUBLIC_SUPABASE_ANON_KEY` a **publishable key** (Supabase recomienda publishable para frontend; anon es legacy/compat)
- [ ] Confirmar el toggle **Confirm phone** en el dashboard: decide si `signUp` de un email ya registrado devuelve usuario ofuscado o error `user_already_exists` (el código maneja ambos, pero conviene saber cuál es)

---

## 17. Anti-patrones explícitos

NO hacer en este proyecto:

- ❌ Carpeta `services/` mezclando dominios
- ❌ `lib/utils.ts` con 200 funciones
- ❌ Componentes importando queries de otros features directamente
- ❌ Query sin `scopedTo` o sin RLS habilitada en la tabla
- ❌ Mutación sin `withPlanGuard` cuando el recurso tiene límite
- ❌ `number` o `float` para montos monetarios en TS (usar `Money`)
- ❌ `FLOAT` / `DOUBLE PRECISION` para montos en DB (usar `NUMERIC(15,2)`)
- ❌ Hard delete sin `deleted_at` en tablas de dominio
- ❌ Hardcoded secrets en código o commits
- ❌ API routes internas para **mutaciones iniciadas por el usuario** (eso va en Server Actions).
  **Excepción permitida**: endpoints que reciben un *redirect externo* o un *webhook*. Son GET/POST
  del navegador o de un tercero contra una URL estable, y no pueden ser Server Actions: una Server
  Action es un POST opaco, protegido por CSRF token y ligado a un `<form>`, así que no puede ser el
  destino de un redirect externo. Hoy: `app/auth/callback/` (OAuth PKCE) y `app/auth/confirm/`
  (links de email de Supabase), más `app/api/webhooks/*`.
- ❌ Context API para estado que cambia seguido (usar Zustand si crece)
- ❌ `any` sin justificación documentada en comentario
- ❌ Cálculos de saldo/% presupuesto en cliente (siempre del servidor)
- ❌ Importar desde `features/X/` dentro de `features/Y/`

---

## 18. Convenciones de naming

- **Archivos**: kebab-case (`transaction-list.tsx`, `create-transaction.ts`).
- **Componentes React**: PascalCase (`TransactionList`).
- **Funciones/variables**: camelCase.
- **Tipos/Interfaces**: PascalCase.
- **DB tables**: snake_case plural (`transactions`, `workspace_members`).
- **DB columns**: snake_case (`workspace_id`, `occurred_at`).
- **Constantes globales**: SCREAMING_SNAKE_CASE.
- **CSS classes**: Tailwind utility classes, sin CSS-in-JS.