# Finanzas

SaaS de gestión financiera personal — multi-tenant, multi-moneda, multi-usuario.

## Stack

- **Frontend**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict
- **UI**: Tailwind CSS 4 + shadcn/ui (Radix)
- **DB**: PostgreSQL (Supabase) + Drizzle ORM
- **Auth**: Supabase Auth
- **Forms**: react-hook-form + Zod
- **Billing**: Stripe (Fase 3)
- **Hosting**: Vercel + Supabase

## Setup local

```bash
pnpm install
cp .env.example .env.local   # completar con credenciales de Supabase
pnpm dev
```

## Estructura

```
app/              # Routes (route groups: marketing, auth, app)
features/         # Módulos de dominio (accounts, transactions, etc.)
lib/              # Utilidades compartidas
db/               # Schema, migraciones, RLS policies
tests/            # unit, integration, e2e
components/       # UI primitives (shadcn) + layouts
```

## Documentación

- [Documento de viaje / contexto](~/Documentos/Proyectos/Finanzas/plan-app-finanzas.md) — historia del proyecto, pivot a SaaS, pricing
- [Arquitectura técnica](~/Documentos/Proyectos/Finanzas/ARCHITECTURE.md) — fuente de verdad técnica (decisiones, schema, módulos, convenciones)

## Scripts

- `pnpm dev` — dev server con Turbopack
- `pnpm build` — build de producción
- `pnpm start` — production server
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript

## Estado

Fase 1 — Núcleo multi-tenant (en progreso).
