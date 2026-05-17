# Statements Tab Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/statements` render the Invoices list by default and move the existing Statements list to `/statements/monthly`. The sidebar entry still says "Statements"; only the landing content changes.

**Architecture:** Three sequential file moves + a tab-header rewrite + a fix-up of three production references that hard-code `/statements/invoices`. Each task ends in a committable, working state.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind. No new dependencies. No DB / migration changes.

**Spec:** [docs/superpowers/specs/2026-05-15-statements-tab-reorder.md](../specs/2026-05-15-statements-tab-reorder.md)

---

### Task 1: Create `/statements/monthly/page.tsx` carrying the existing Statements-list body

**Files:**
- Create: `src/app/(portal)/statements/monthly/page.tsx`

This task is additive: a new route renders the Statements list at `/statements/monthly`. After it lands, both `/statements` (old Statements list, unchanged) and `/statements/monthly` (new) work side-by-side. The tab header is not touched yet, so the new route's own tab nav still points at the old hrefs — harmless because no tab in the existing nav links to `/statements/monthly` yet.

- [ ] **Step 1: Create the new file** with the same body as the current `src/app/(portal)/statements/page.tsx` — identical imports, same exported async function, same `active="statements"` prop on the tab header. The body verbatim:

```tsx
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import GenerateStatementsButton from '../_components/GenerateStatementsButton'
import StatementsTabHeader from '../_components/StatementsTabHeader'
import StatementsPeriodTable from '../_components/StatementsPeriodTable'

export default async function MonthlyStatementsPage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [{ data: statements }, { data: companies }] = await Promise.all([
    supabase
      .from('monthly_statements')
      .select('*')
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
  ])

  const statementList = statements ?? []
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )

  const byPeriod = new Map<string, typeof statementList>()
  for (const s of statementList) {
    const period = s.period_month
    const list = byPeriod.get(period) ?? []
    list.push(s)
    byPeriod.set(period, list)
  }

  const latestPeriod = Array.from(byPeriod.keys()).sort().reverse()[0]
  const draftCount = statementList.filter((s) => s.status === 'draft').length
  const issuedCount = statementList.filter((s) => s.status === 'issued').length
  const paidCount = statementList.filter((s) => s.status === 'paid').length

  const canGenerate = user.role === 'finance'

  return (
    <div>
      <StatementsTabHeader active="statements" />
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · MONTHLY STATEMENTS
          </div>
          <h1 className="page-title">Statements</h1>
        </div>
        {canGenerate ? <GenerateStatementsButton /> : null}
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {latestPeriod ? `Latest period` : 'No statements yet'}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tracking-[-0.01em]">
            {latestPeriod ? (
              dayjs(latestPeriod).format('MMMM YYYY')
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {statementList.length} TOTAL{' '}
            {statementList.length === 1 ? 'STATEMENT' : 'STATEMENTS'}
          </div>
        </div>

        {statementList.length > 0 ? (
          <div className="lg:col-span-5 space-y-2">
            {draftCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-graphite">draft</em>
                <span className="text-ink tabular">{draftCount}</span>
              </div>
            ) : null}
            {issuedCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-alert">issued</em>
                <span className="text-ink tabular">{issuedCount}</span>
              </div>
            ) : null}
            {paidCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-ledger">paid</em>
                <span className="text-ink tabular">{paidCount}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ───────── Statements by period ───────── */}
      {statementList.length === 0 ? (
        <EmptyState canGenerate={canGenerate} />
      ) : (
        Array.from(byPeriod.entries()).map(([period, periodStatements]) => (
          <section key={period} className="mb-12">
            <div className="sect-head">
              <h2>{dayjs(period).format('MMMM YYYY')}</h2>
              <span className="rule" aria-hidden />
              <span className="count">{periodStatements.length} {periodStatements.length === 1 ? 'STATEMENT' : 'STATEMENTS'}</span>
            </div>

            <div className="overflow-x-auto">
              <StatementsPeriodTable
                rows={periodStatements.map((s) => {
                  const company = companyMap.get(s.company_id)
                  return {
                    id: s.id,
                    companyName: company?.name ?? '—',
                    companyCode: company?.code ?? '',
                    totalInvoice: Number(s.total_invoice),
                    totalContra: Number(s.total_contra),
                    netAmount: Number(s.net_amount),
                    status: s.status,
                  }
                })}
              />
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function EmptyState({ canGenerate }: { canGenerate: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-2">
        No statements yet.
      </p>
      <p className="font-serif italic text-muted text-sm">
        {canGenerate ? (
          <>
            Finance generates monthly statements for all active subsidiaries.
            <br />
            Click <em>Generate statements</em> above to start.
          </>
        ) : (
          <>Finance hasn&apos;t generated any statements yet.</>
        )}
      </p>
    </div>
  )
}
```

Note the import paths use `../_components/...` because the file is now one directory deeper than the original.

- [ ] **Step 2: Smoke-check the new route compiles**

The preview dev server has HMR. After saving, open `http://localhost:3000/statements/monthly` — it should show the same Statements list that `/statements` currently shows. Tab header still says Statements tab is active.

If TypeScript errors appear in the preview logs, double-check the relative imports in step 1.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(portal\)/statements/monthly/page.tsx
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(statements): mount Statements list at /statements/monthly (additive)"
```

---

### Task 2: Swap `/statements/page.tsx` to the Invoices view + rewrite the tab header

**Files:**
- Modify: `src/app/(portal)/statements/page.tsx` (replace body)
- Modify: `src/app/(portal)/statements/_components/StatementsTabHeader.tsx` (reorder + new hrefs)

Both edits happen in the same commit so the app stays consistent. Without doing them together, there is a window where the Invoices tab on `/statements` reloads back to the same page (because the header still points to the old hrefs) — only relevant in dev, but the work is small enough that one commit is fine.

- [ ] **Step 1: Replace `src/app/(portal)/statements/page.tsx`** with the Invoices content (mirrors the current `src/app/(portal)/statements/invoices/page.tsx`):

```tsx
// /statements is now the Invoices landing (mig 2026-05-15 tab reorder).
// The Monthly Statements list moved to /statements/monthly.

import BillingView from '../billing/_components/BillingView'
import StatementsTabHeader from './_components/StatementsTabHeader'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default function StatementsPage(props: Props) {
  return (
    <div>
      <StatementsTabHeader active="invoices" />
      <BillingView {...props} />
    </div>
  )
}
```

Note: this replaces the entire current body of `statements/page.tsx`. The Statements-list code that used to live here is already on disk at `/statements/monthly/page.tsx` from Task 1.

- [ ] **Step 2: Rewrite `src/app/(portal)/statements/_components/StatementsTabHeader.tsx`** to put Invoices first and change its href to `/statements`; Statements moves to second with href `/statements/monthly`:

```tsx
import Link from 'next/link'

// 2026-05-15 reorder: Invoices is the default Statements landing
// (/statements). Monthly Statements moved to /statements/monthly. The
// sidebar entry still says "Statements" — only the landing content swapped.
export default function StatementsTabHeader({ active }: { active: 'statements' | 'invoices' }) {
  return (
    <div className="border-b border-hairline mb-8 -mt-2">
      <nav className="flex gap-6" aria-label="Statements tabs">
        <TabLink href="/statements" label="Invoices" isActive={active === 'invoices'} />
        <TabLink href="/statements/monthly" label="Statements" isActive={active === 'statements'} />
      </nav>
    </div>
  )
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={
        isActive
          ? 'pb-3 border-b-2 border-accent font-serif text-accent text-sm'
          : 'pb-3 border-b-2 border-transparent font-serif italic text-graphite text-sm hover:text-ink transition-colors'
      }
    >
      {label}
    </Link>
  )
}
```

- [ ] **Step 3: Smoke-check both routes**

In the browser:
- `http://localhost:3000/statements` → renders Invoices list, "Invoices" tab is the bold/active one (first), "Statements" is second (italic).
- Click the "Statements" tab → URL goes to `/statements/monthly`, the old Statements list renders.

The third route `/statements/invoices` still works (the file is still there) and renders Invoices content; that's the next task to clean up.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(portal\)/statements/page.tsx src/app/\(portal\)/statements/_components/StatementsTabHeader.tsx
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(statements): swap /statements landing to Invoices; tab order reversed"
```

---

### Task 3: Remove `/statements/invoices/` and update the three production references

**Files:**
- Delete: `src/app/(portal)/statements/invoices/page.tsx` (and the now-empty directory)
- Modify: `src/app/(portal)/billing/actions.ts:153`
- Modify: `src/app/(portal)/billing/page.tsx:12`
- Modify: `src/app/(portal)/hr-costing/actions.ts:92`
- Modify: `src/app/(portal)/billing/_components/BillingView.tsx:1-3` (doc comment only)

Once the three production references are updated, `/statements/invoices` is unreachable from anywhere in the app — safe to delete.

- [ ] **Step 1: Update `src/app/(portal)/billing/actions.ts:153`**

Find this line:

```ts
  revalidatePath('/statements/invoices')
```

Replace with:

```ts
  revalidatePath('/statements')
```

- [ ] **Step 2: Update `src/app/(portal)/billing/page.tsx:12`**

Find:

```ts
  redirect(`/statements/invoices${qs}`)
```

Replace with:

```ts
  redirect(`/statements${qs}`)
```

- [ ] **Step 3: Update `src/app/(portal)/hr-costing/actions.ts:92`**

Find:

```ts
  revalidatePath('/statements/invoices')
```

Replace with:

```ts
  revalidatePath('/statements')
```

- [ ] **Step 4: Update the doc comment in `src/app/(portal)/billing/_components/BillingView.tsx:1-3`**

Find:

```tsx
// Phase 7 Step 11: extracted from billing/page.tsx so both the /billing redirect
// and the /statements/invoices tab can share one implementation. All internal
// component paths are preserved.
```

Replace with:

```tsx
// Phase 7 Step 11 + 2026-05-15 tab reorder: extracted so both the /billing
// redirect and the /statements page (Invoices landing after the reorder) can
// share one implementation. All internal component paths are preserved.
```

- [ ] **Step 5: Delete the obsolete invoices route (via git so the deletion is staged for the commit)**

```bash
git rm -r "src/app/(portal)/statements/invoices"
```

After this, `/statements/invoices` returns 404 — which is fine because nothing in the codebase still links there. The deletion is already staged; the final `git add` in Step 8 only needs to pick up the four modified files.

- [ ] **Step 6: Confirm TypeScript + tests still pass**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "statements|billing|hr-costing" | head -20
```

Expected: no output (or only pre-existing errors from `payments/page.tsx` for the dayjs import, which is unrelated to this change).

```bash
npm run test:ci
```

Expected: `196 passed (196)` — none of this work changes test fixtures or pure logic.

- [ ] **Step 7: Browser smoke**

- `/statements` → Invoices list (Invoices tab active)
- `/statements/monthly` → Statements list (Statements tab active)
- `/statements/invoices` → 404
- `/billing?period=2026-05` → 302 redirect, lands on `/statements?period=2026-05`
- Issue an invoice from `/statements`, after the action the page revalidates (no manual refresh needed)
- Submit HR cost approval (if a draft exists) — same revalidation behaviour on `/statements`

- [ ] **Step 8: Commit**

```bash
git add src/app/\(portal\)/billing/actions.ts src/app/\(portal\)/billing/page.tsx src/app/\(portal\)/hr-costing/actions.ts src/app/\(portal\)/billing/_components/BillingView.tsx
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(statements): drop /statements/invoices; production references repoint to /statements"
```

(The `git rm -r` from Step 5 is already staged, so this single `git add` plus the commit captures all 5 changed paths.)
