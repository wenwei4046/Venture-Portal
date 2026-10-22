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

`.github/workflows/test.yml` runs on every push + PR against `main` — four jobs
side by side (2026-10-06; one job in a row took ~10.5 min, side by side the wait is
the slowest job, ~5 min):

1. **Unit tests (1/2) and (2/2)** — `npm run test:ci -- --shard=N/2`: the Vitest
   suite split by file into two halves run at once. A failure names its half;
   run the same command locally to reproduce it.
2. **SQL checks** — `tests/member-sql` and `tests/revenue-payroll-sql`, each its
   own package (PGlite), so this job never installs the app.
3. **Next.js build check** — `npm run lint -- --quiet` (ESLint on `src/`; an error
   fails the job, a warning does not), then `npm run build` (a 4 GB heap; it
   outgrew Node's 2 GB), reusing `.next/cache` from earlier runs. Since Next 16
   (2026-10-21) `next build` no longer lints and `next lint` is gone; the lint step
   keeps what the build used to refuse. Before a push: `npm run lint -- --quiet`.
4. **Cloudflare worker build + PDF smoke** — see below.

A PR that changes only docs (`**/*.md`, `docs/`, `.design/`) runs none of them
(`paths-ignore`): nothing reads the docs, so nothing can break.

Build uses placeholder `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` values so compilation works without real
credentials. Real deploys pick up the values from Vercel project settings.

## PDF geometry tests, and the tool that proves they work

`src/lib/export/pdf.test.ts` renders through the real `PdfDocument` / `PdfTable`
wrappers and asserts on where text actually landed, not on the bytes. The reason
is `@react-pdf/layout`: it applies every style through an **optional** call on
the Yoga node (`yogaNode[method]?.(...)` in `setYogaValue`). A Yoga build missing
a setter — a version mismatch, a patched WASM loader, a bundler swapping the
binary — therefore **drops the style in silence** and still emits a perfectly
valid PDF whose layout has collapsed. `buf.slice(0,4) === '%PDF'` cannot fail for
any layout reason.

Two fixtures, because they reach different code:

- `buildGeometryFixture()` — tables through `PdfTable`, which lays columns out at
  fixed widths.
- `buildFlexFixture()` — the flex row the invoice, credit-note and payment-voucher
  formatters use (`flex: 1` label, fixed-width right-aligned amount). The flex
  setters are unreachable from the table fixture, so without this one they are
  untested no matter what is asserted.

Assertions are derived from the fixtures' own inputs (column x deltas must equal
the declared widths) except for a handful of **page-frame anchors**, which are
pinned. Those exist because deltas are blind to a dropped `padding` or `margin`:
every box shifts by the same amount, so every delta still checks out while the
document loses its margins. Only a measurement against the page edge catches it.

**Do not trust the coverage — re-measure it:**

```bash
node tools/yoga-setter-sweep.mjs
```

That deletes each of the fourteen silently-droppable setters from the Yoga
prototype in turn, runs the suite against each, and prints which ones the suite
notices. It restores `node_modules` when it finishes, including on Ctrl-C. Run it
after changing the fixtures; the coverage table in the header of `pdf.test.ts` is
its output. As of the last run: 6 caught, 8 unreachable because no style in the
PDF formatters sets them (that file says which, and why).

One trap worth knowing: pdf2json cannot be handed a pooled `Buffer`. It re-wraps
any Buffer that views a larger ArrayBuffer from offset 0, discarding
`byteOffset`, and Node pools every allocation under 4096 bytes — so small PDFs
get parsed from the wrong offset and fail with "Invalid XRef stream header",
intermittently. `parsePdf()` copies the exact byte range first. Never work around
a failure there by padding a fixture past 4096 bytes.

## Cloudflare worker verification

`next build` does not exercise the worker bundle, so the PDF routes can be green
in CI and return HTTP 500 on Cloudflare: `yoga-layout` compiles its flexbox
engine from a base64 blob with `WebAssembly.instantiate()`, which workerd
forbids. The fix is applied by the `postinstall` hook
(`tools/patch-yoga-wasm.mjs`) — which is why CI must run plain `npm ci` and never
`npm ci --ignore-scripts`.

```bash
npm run verify:worker   # build + bundle assertions + render a real PDF in workerd
```

Three layers, and the third is the one that cannot be faked:

1. `opennextjs-cloudflare build`. OpenNext refuses to build a Next.js major more
   than two years after its release: Next 15 (2024-10-21) was refused from
   2026-10-21 until the app moved to Next 16 the same day (#595 had bridged it with
   `--dangerouslyUseUnsupportedNextVersion`). Next 16 came out on 2025-10-22, so
   this job starts failing on 2027-10-22 unless the app is on a newer major by then.
2. `tools/assert-open-next-wasm.mjs` — reads the built bundle and proves the fix
   is present in the right shape.
3. `tools/smoke-worker-pdf.mjs` — starts the built worker in workerd, requests a
   PDF from `/api/wasm-health` (a probe route that stays 404 unless
   `PDF_WASM_SMOKE=1` is set, so it is inert in production) and checks its
   geometry.

Layer 2 alone is not enough, and this was demonstrated rather than assumed: a fix
that is **present but fails to load** passes all four of its checks with exit 0
and then returns HTTP 500 on every PDF route. Only layer 3 catches that.

Layer 3 has itself been tested the same way. With the sweep harness installed
(`node tools/yoga-setter-sweep.mjs --keep`), rebuild and run:

```bash
YOGA_DROP_SETTERS=setPadding node tools/smoke-worker-pdf.mjs
```

That reproduces a silent layout collapse inside workerd, and the result is worth
reading closely, because it is the whole argument for how these assertions are
written:

```
bytes 10106   pages 2   text items 318          <- HTTP 200, a valid PDF
header DESC delta=90    (declared 90)           <- column delta: PASSES
balance col delta=200   (declared 200)          <- column delta: PASSES
page0 min x/y  -4 / -2.99                       <- the text is off the page
FAIL  leftmost text sits at x=-4pt, outside [30.5, 33.5]
```

Every delta-based assertion passed on a document whose content had walked off the
page, because dropping the padding shifts every column by the same amount. Only
the page-frame anchors caught it. Restore afterwards with
`node tools/yoga-setter-sweep.mjs --restore` and rebuild.
