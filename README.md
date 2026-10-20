# Personal Finance AI Foundation

Production-minded personal finance AI application using:

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui-style component setup
- Supabase
- Zod
- Vitest

Phase 1 implemented:

- Supabase Auth sign-up/sign-in/sign-out
- Protected dashboard routes
- Multi-step onboarding wizard with save/resume
- Profile editing flow
- PostgreSQL RLS for per-user isolation

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env.local
```

3. Fill required values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

4. Apply Supabase migration:

```bash
# if Supabase CLI is installed and linked
supabase db push
```

Migration file created:

- `supabase/migrations/20261019190000_phase1_auth_onboarding.sql`

You mentioned you have a Gemini API key, so this project is wired for Gemini by default.

5. Run development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - start local development server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint
- `npm run lint:fix` - run ESLint with auto-fixes
- `npm run typecheck` - run TypeScript checks
- `npm run test` - run Vitest once
- `npm run test:watch` - run Vitest in watch mode
- `npm run format` - format with Prettier
- `npm run format:check` - check formatting

## Architecture

See [docs/architecture.md](docs/architecture.md) for full details.

Key rules:

- Keep UI in `src/app` and `src/components`
- Keep business orchestration in `src/features`
- Keep database access in `src/lib/db`
- Keep AI integration in `src/lib/ai`
- Keep secrets server-only and never expose them in client bundles

## Supabase

- SQL migrations belong in `supabase/migrations`
- Supabase server client is in `src/lib/db/supabase-server.ts`
- Supabase browser client is in `src/lib/db/supabase-client.ts`

## Security Notes

- `src/lib/validation/env.server.ts` imports `server-only` and validates secret env vars.
- `src/lib/validation/env.client.ts` validates only `NEXT_PUBLIC_` vars.
- `src/lib/ai/gemini.ts` is server-only and never runs in the browser.
- `public.financial_profiles` is protected with RLS policies tied to `auth.uid()`.

## Supabase Configuration

1. In Supabase Auth settings, set Site URL to `http://localhost:3000`.
2. Enable Email auth provider.
3. Use a strong service role key in `.env.local` and never expose it client-side.

## Test Coverage

- Unit tests include financial reconciliation logic.
- Integration test validates RLS isolation:
  - `src/tests/rls-financial-profiles.integration.test.ts`
  - Skips automatically when Supabase env vars are missing.

Run checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
```
