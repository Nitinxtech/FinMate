# Architecture Overview

This project uses a modular, feature-based architecture designed for production growth.

## Phase 1 Scope (Implemented)

- User authentication (sign-up, sign-in, sign-out)
- Protected dashboard routes
- Multi-step financial onboarding with save/resume
- Profile editing for previously entered data
- PostgreSQL RLS-backed data isolation

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui-style component setup
- Supabase (server + browser clients)
- Zod for runtime validation
- Vitest for unit/integration-style tests

## Folder Boundaries

- `src/app`: Routing and composition only (UI shell + API route handlers)
- `src/components/ui`: Reusable primitives and app-wide UI patterns
- `src/components/{dashboard,onboarding}`: View-level composition components
- `src/features/*`: Feature modules where business behavior will live
- `src/lib/validation`: Zod schemas and environment validation
- `src/lib/db`: Supabase clients and data-access adapters
- `src/lib/ai`: AI integration boundary (Gemini server-only)
- `src/lib/finance`: Future pure finance calculations and policy rules
- `src/lib/market-data`: Future external market data clients
- `src/types`: Shared type contracts (e.g., Supabase generated DB types)
- `src/tests`: Vitest suites

## Security Rules

1. Never import `src/lib/validation/env.server.ts` into client components.
2. Keep secrets in non-public env vars only (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Only expose values prefixed with `NEXT_PUBLIC_` to browser code.
4. Keep AI and privileged database calls in server-only modules.
5. Enforce user data isolation with database RLS, not just application logic.

## Data Model

Primary table:

- `public.financial_profiles` (one row per user)
  - User-entered fields: country/currency, compensation, expenses, debts, insurance, investments, goals
  - Derived fields: stored in `derived_values` JSONB
  - Progress fields: `onboarding_step`, `onboarding_completed`

RLS policies:

- `auth.uid() = user_id` for select/insert/update/delete

## Data and AI Integration Pattern

1. UI components call server actions.
2. Server actions validate input with Zod and delegate to feature repository/service.
3. Repository uses authenticated Supabase clients; RLS enforces ownership.
4. AI-assisted operations use `src/lib/ai/gemini.ts` behind service interfaces.

## Financial Rules Enforced

- CTC must reconcile with applicable CTC components.
- Salary components are optional and per-employee.
- User-entered values are separate from derived values.
- CTC is not treated as take-home salary.
- Tax liability is not inferred without jurisdiction-specific details.
