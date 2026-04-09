# Testing — HOUZS Venture Portal

Phase 1 shipped with 0 test files. Phase 2 introduces Vitest + happy-dom as
part of Step 1. This doc describes the layers, what they cover, and how to
add new tests.

## Commands

```bash
npm test          # watch mode (default)
npm run test:ci   # single run (what CI uses)
npm run test:ui   # Vitest UI dashboard in browser
npm run build     # next build — catches compile errors CI also runs
```

## Layers

### 1. Unit — `src/**/*.test.ts`
Pure functions with no Supabase or Next.js runtime dependency. Fastest to run
and first to cover. Examples that already exist:

- `src/lib/utils.test.ts` — formatMoney, formatRate, cn
- `src/lib/roles.test.ts` — canAccess\* across all 4 roles (PDPA gate)
- `src/lib/tier.test.ts` — M3 regression (escalation tier downgrade)

**Rule**: every bug fix ships with a regression test. If the logic lives
inside a Server Action, extract the pure bit to a helper in `src/lib/` and
test the helper.

### 2. Integration — deferred
Supabase RPC functions (`dashboard_summary`, `generate_monthly_invoices`)
test best against a real Postgres via `supabase db` local dev. Docker on
Windows is a compatibility minefield, so we defer integration tests until
billing math in Phase 2 Step 5 actually needs them. At that point we either
stand up Supabase local or rely on staging database queries.

### 3. RLS audit — manual via /qa
Access Matrix (4 roles × 9 modules) is verified by a `/qa` pass that logs in
as each role and confirms each row-level-security policy blocks what it should.
Not automated — the test environment for this is Playwright MCP against the
dev server, not Vitest.

### 4. End-to-end — Playwright MCP
Used during per-step verification in phased runs. Every Forge step in Phase 2
includes a Playwright MCP E2E check before the commit lands. Playwright is
not run in CI (it depends on a live Supabase instance), only locally.

## Placeholder pattern

When a bug fix is planned but not yet implemented, drop a `describe.todo(...)`
stub at the expected test location. This keeps the test file indexed by the
test runner (so you don't forget it) without breaking CI. Examples:

- `src/app/(portal)/fund-out/actions.cancel.test.ts` — M2 fix placeholder
- `src/app/(portal)/fund-out/actions.create.test.ts` — M1 fix placeholder

## What NOT to test

- `'use server'` Server Actions directly — they pull in `next/cache`,
  `next/navigation`, and Supabase SSR cookies. Mocking all of that is more
  trouble than it's worth. Instead, extract pure helpers and test those.
- Server Components — the `async function Page() {...}` shape doesn't play
  well with vitest. Cover them via Playwright MCP E2E.
- UI snapshots — brittle, don't catch real bugs. Cover UI via targeted
  `@testing-library/react` tests only when the component has real logic.

## Adding a new test

1. Pick the layer (usually Unit for new bug fixes)
2. Create `<subject>.test.ts` next to the source file
3. Import the pure helper directly, no mocking
4. Run `npm test` to verify it passes
5. Commit with the fix, not separately

## CI

`.github/workflows/test.yml` runs on every push + PR against `main`:

1. Install deps (`npm ci`)
2. `npm run test:ci` — Vitest single run
3. `npm run build` — Next.js production build check

Build uses placeholder `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` values so compilation works without real
credentials. Real deploys pick up the values from Vercel project settings.
