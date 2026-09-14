# Plan: App Web de Gestión de Movimientos (Finanzas Personales)

> Basado en el análisis de tu Notion "💰 Gestión de Movimientos" + funciones nuevas que pediste: reportes/gráficas avanzadas, multi-moneda/multi-usuario (familia), y notificaciones/recordatorios.

---

## 1. Resumen de tu Notion actual

Tu sistema tiene 7 tablas relacionadas:

- **Incomes**: Transaction, Amount, Date, Account (relación), Source/Categoría (relación)
- **Expenses**: Transaction, Amount, Date, Category (relación), Payment Method/Account (relación)
- **Transfers**: Transaction, Amount, Date, From (relación), To (relación)
- **Accounts**: Name + fórmulas (Account Balance, Incomes Amount, Expenses Amount)
- **Expense Categories**: Categoría, Budget + fórmulas (Total Spent, Budget %, Money Left, Monthly Avg, Status)
- **Income Categories**: Name + fórmula Total Income
- **Subscriptions**: Service, Cost, Billing (mensual/anual/trimestral/semanal), Renewal date, Status + fórmulas (Monthly Cost, Annual Cost, New Renewal, Reminder)

Todo funciona con relaciones (relations) y fórmulas nativas de Notion que calculan saldos, presupuestos y proyecciones.

---

## 2. Stack recomendado (app web)

Para replicar esto y agregar lo que pediste, la combinación más eficiente para construir tú mismo (o con ayuda de Claude Code) es:

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | **Next.js** (React) + Tailwind CSS | Un solo framework para UI + rutas API, fácil de desplegar |
| Backend/API | Rutas API de Next.js (o Node/Express aparte) | Evita mantener dos repos separados al inicio |
| Base de datos | **PostgreSQL** vía **Supabase** | Da de una vez: base de datos relacional, autenticación multi-usuario, y suscripciones en tiempo real — cubre 3 de tus requisitos sin construir nada desde cero |
| Auth | Supabase Auth | Login por email/Google, útil para el modo "familia" |
| Gráficas | **Recharts** o **Tremor** | Dashboards de gastos/ingresos con poco código |
| Notificaciones | Resend/SendGrid (email) + Supabase Edge Functions con cron | Recordatorios de suscripciones, alertas de presupuesto |
| Tipo de cambio (multi-moneda) | API externa (exchangerate-api.io o similar) | Conversión automática entre monedas |
| Hosting | Vercel (frontend) + Supabase (backend/DB) | Ambos tienen capa gratuita suficiente para uso personal/familiar |

Esta combinación (Next.js + Supabase) es la ruta más corta porque Supabase te da base de datos + auth + notificaciones en tiempo real "gratis", que son justo tus tres funciones adicionales.

---

## 3. Modelo de datos (schema)

```sql
-- Usuarios y familias
users (id, email, name, created_at)
households (id, name)              -- "familia" o espacio compartido
household_members (household_id, user_id, role)  -- role: admin/miembro

-- Catálogos
currencies (code, symbol, name)     -- USD, COP, EUR...
accounts (id, household_id, name, currency_code, icon, is_active)
expense_categories (id, household_id, name, budget_monthly, icon)
income_categories (id, household_id, name)

-- Movimientos
incomes (id, household_id, account_id, category_id, user_id, amount, currency_code, date, note)
expenses (id, household_id, account_id, category_id, user_id, amount, currency_code, date, note)
transfers (id, household_id, from_account_id, to_account_id, amount, currency_code, date, note)

-- Suscripciones
subscriptions (id, household_id, service, cost, currency_code, billing_cycle, renewal_date, status, remind_days_before)

-- Notificaciones
notifications (id, household_id, user_id, type, message, sent_at, read_at)
```

**Diferencias clave vs. Notion:**
- `household_id` en cada tabla → habilita multi-usuario/familia (varias personas comparten un mismo set de cuentas y ven los movimientos de todos)
- `currency_code` en cuentas y movimientos → habilita multi-moneda real, con conversión al momento de mostrar totales
- Los saldos y totales que en Notion son fórmulas, aquí se calculan con **vistas SQL** o se agregan en el backend (más rápido y sin límites de Notion)

---

## 4. Funcionalidad a replicar (paridad con Notion)

- [ ] CRUD de ingresos, gastos y transferencias
- [ ] Cuentas con saldo calculado automáticamente
- [ ] Categorías de gasto con presupuesto y % gastado
- [ ] Categorías de ingreso
- [ ] Suscripciones con costo mensualizado/anualizado y próxima renovación
- [ ] Botones de "acción rápida" para registrar movimientos (formulario rápido, como tu sección de Notion)

## 5. Funciones nuevas que pediste

**a) Reportes y gráficas avanzadas**
- Dashboard mensual: ingresos vs. gastos, tendencia últimos 6-12 meses
- Distribución de gastos por categoría (pie/donut)
- Comparativo de presupuesto vs. real, por categoría
- Flujo de caja proyectado (incluye suscripciones futuras)
- Exportar reportes a PDF/Excel

**b) Multi-moneda**
- Cada cuenta y movimiento tiene su propia moneda
- Conversión automática a una "moneda base" para ver el patrimonio total consolidado
- Tasa de cambio actualizada diariamente vía API

**c) Multi-usuario / familia**
- Un "household" (espacio familiar) con varios miembros
- Permisos: quién puede ver/editar qué cuentas
- Ver quién registró cada movimiento
- Presupuestos compartidos vs. personales

**d) Notificaciones/recordatorios**
- Aviso antes de renovación de suscripción (email o push)
- Alerta cuando una categoría supera X% de su presupuesto
- Resumen semanal/mensual automático por email
- Recordatorio si no se han registrado movimientos en varios días

---

## 6. Roadmap sugerido (fases)

1. **Fase 1 — Núcleo**: schema en Supabase, auth, CRUD de cuentas/ingresos/gastos/transferencias, saldo por cuenta
2. **Fase 2 — Presupuestos y suscripciones**: categorías con budget, módulo de suscripciones con cálculo mensual/anual
3. **Fase 3 — Multi-usuario**: households, invitar miembros, permisos
4. **Fase 4 — Multi-moneda**: campo currency + integración de API de tasas de cambio
5. **Fase 5 — Reportes**: dashboards con Recharts/Tremor, exportación
6. **Fase 6 — Notificaciones**: cron jobs + emails (Resend) para recordatorios y alertas

---

## 7. Siguiente paso

Cuando quieras empezar a construir, puedo ayudarte a:
- Generar el schema SQL completo listo para pegar en Supabase
- Armar el proyecto base de Next.js con la estructura de carpetas
- Escribir las queries/endpoints para cada módulo

Solo dime por cuál fase quieres arrancar.
