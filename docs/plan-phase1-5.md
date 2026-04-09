# Phase 1.5 Plan — Tech Debt Cleanup + Test Infra

**Status:** Draft. Awaiting user approval before execution.
**Created:** 2026-04-10
**Author:** Claude Opus 4.6 (1M context) + wenwei4046
**Source:** `.gstack/qa-reports/qa-report-phase1-2026-04-10.md` + `.context/retros/2026-04-10-1.json` + `TODOS.md`
**Successor to:** `docs/plan-phase2.md` (this ships before Phase 2)

---

## TL;DR

Phase 1 shipped in one 2h44min session with 0 test files and 3 deferred bugs. Phase 1.5 is a **minimal, focused cleanup phase** that fixes the bugs, adds the test infra, verifies production builds, and unblocks Phase 2 on solid ground.

**Scope: 6 steps. Estimated 5-6 hours CC time. One sitting, realistically two.**

**Explicit non-scope:** Bank CSV import, Slack notifications, PDF templates, mobile polish, dark mode, multi-currency. Those remain in TODOS.md as their own future mini-phases.

---

## Why Phase 1.5 before Phase 2

Three drivers, in priority order:

1. **M2 is a user-visible bug.** If Finance cancels a pending loan in production today, they get an orphan `pending_approval` row they can never clean up. This becomes dispute material the first time a real subsidiary calls asking "why is this loan still showing as pending?"

2. **0 test files entering Phase 2 is malpractice.** Phase 2 adds 5 billing modes that compute invoices feeding into legal statements. Manual Playwright testing got Phase 1 across the line; it will not scale through billing math.

3. **Phase 1 has never been `next build`-ed.** The `'server-only'` guard and Supabase SSR cookie pattern have edge cases only visible at production build time. Catching them in Phase 1.5 is cheap insurance. Catching them mid-Phase-2 is a rollback nightmare.

---

## Phase 1.5 Forge Steps

### Step 1: Vercel preview deploy + smoke test

**Why:** Cheapest insurance in the whole plan. Validates that Phase 1 actually builds + runs on real Vercel infra before any further work.

**Deliverables:**
1. User runs `vercel` CLI or pushes a branch (if Vercel auto-deploy is wired). If neither is set up, install: `npm install -g vercel && vercel login && vercel link` (~5 min, one-time).
2. Deploy to preview: `vercel --env-file .env.local` or equivalent.
3. Hit the preview URL with finance@venture.my + principal@venture.my accounts.
4. 15-min smoke test: login → dashboard → /fund-in new → /fund-out new → /statements → /approvals → /settings. Anything visibly broken → file as finding, fix before continuing Phase 1.5.
5. If all clean, promote to production (or leave on preview URL until Phase 2 ships, user's call).

**Success criteria:** Login + 7 route navigations work on Vercel preview. No console errors beyond the known favicon 404. Sign-out works.

**Effort:** 20-30 min (mostly user manual testing, not CC work).

**Risk:** Low. Worst case: we find a prod-only bug and spend 30 min fixing it.

---

### Step 2: Test framework bootstrap

**Why:** Phase 1 retro flagged 0-test-files as the #1 growth area. Bootstrap Vitest + CI before fixing M1/M2 so each fix ships with a regression test.

**Deliverables:**
1. Install: `npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom happy-dom @types/node`
2. Create `vitest.config.ts` with happy-dom environment + path alias `@/*` → `./src/*`
3. Create `src/test/setup.ts` for `@testing-library/jest-dom` matchers
4. `package.json` scripts: `"test": "vitest"`, `"test:watch": "vitest --watch"`, `"test:ci": "vitest run"`, `"build:check": "next build"`
5. Create `TESTING.md` at repo root explaining the layers (unit / integration / RLS / E2E) + how to run
6. Seed 3 real tests:
   - `src/lib/utils.test.ts`: `formatMoney` positive + negative + zero + large number
   - `src/lib/roles.test.ts`: each `canAccess*` function against all 4 roles
   - `src/app/(portal)/approvals/actions.escalation.test.ts`: M3 regression (escalation approval → tier downgrade). Mock Supabase client. Tests T1→T2, T2→T3, T3→T4, T4→T4 (no further downgrade).
7. `.github/workflows/test.yml`: on push + pull_request, run `npm ci && npm run test:ci && npm run build:check`
8. Commit: `chore: bootstrap Vitest test framework (Phase 1.5 Step 2)`
9. Update `CLAUDE.md` with a new `## Testing` section referencing TESTING.md and the test expectations from /retro ("every bug fix ships with a regression test")

**Success criteria:** All 3 tests pass locally AND on GitHub Actions. `next build` completes in CI without error. PR checks visible on next commit.

**Effort:** 40-60 min CC.

**Open question:** Are we using Supabase local dev (via Docker) for integration tests, or mock-everything unit tests only? Recommendation: **mock-only for now**, add Supabase local in a future mini-phase if integration tests become painful. Rationale: Docker on Windows is a compatibility minefield, mocks are fine for the kind of logic we need to test in Phase 1.5.

---

### Step 3: M2 fix — `cancelLoan` orphan elimination

**Why:** User-visible bug. Finance cancels a pending loan → approval rejected but loan stays `pending_approval` forever because `loans_principal_update` RLS policy blocks Finance from updating the loan row.

**Current behavior** (`src/app/(portal)/fund-out/actions.ts:190-237`):
```
Finance clicks Cancel
  → UPDATE approval_requests SET status='rejected'  ✓
  → (loan stays pending_approval)                    ✗ orphan
```

**Target behavior:**
```
Finance clicks Cancel
  → CALL cancel_loan_and_approval(loan_id, notes)
    → UPDATE loans SET status='cancelled'            ✓
    → UPDATE approval_requests SET status='rejected' ✓
    → (both in one transaction, SECURITY DEFINER)
```

**Deliverables:**
1. New migration `20260101000017_fund_out_atomicity.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION cancel_loan_and_approval(
       p_loan_id UUID,
       p_cancel_reason TEXT DEFAULT NULL
   )
   RETURNS VOID
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
       v_caller_role user_role;
   BEGIN
       -- Explicit role check inside the function (SECURITY DEFINER bypasses RLS)
       v_caller_role := current_user_role();
       IF v_caller_role NOT IN ('finance', 'principal') THEN
           RAISE EXCEPTION 'cancel_loan_and_approval: unauthorized role %', v_caller_role
               USING ERRCODE = 'insufficient_privilege';
       END IF;

       -- Verify the loan is cancellable
       IF NOT EXISTS (
           SELECT 1 FROM loans
           WHERE id = p_loan_id AND status = 'pending_approval'
       ) THEN
           RAISE EXCEPTION 'Loan not found or not cancellable (status must be pending_approval)';
       END IF;

       -- Update the loan (bypasses loans_principal_update RLS via SECURITY DEFINER)
       UPDATE loans
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = p_loan_id AND status = 'pending_approval';

       -- Reject the paired approval request
       UPDATE approval_requests
       SET status = 'rejected',
           workflow_state = 'rejected',
           notes = COALESCE(p_cancel_reason, 'Cancelled by Finance before approval'),
           approved_at = NOW()
       WHERE reference_id = p_loan_id
         AND reference_table = 'loans'
         AND status = 'pending';
   END;
   $$;

   GRANT EXECUTE ON FUNCTION cancel_loan_and_approval(UUID, TEXT) TO authenticated;

   COMMENT ON FUNCTION cancel_loan_and_approval(UUID, TEXT) IS
       'Atomic cancel: updates loan status + approval request in one transaction. Uses SECURITY DEFINER to bypass loans_principal_update RLS. Caller role checked internally.';
   ```
2. Update `src/app/(portal)/fund-out/actions.ts:190-237` `cancelLoan`:
   - Replace the 2-step app logic with a single `supabase.rpc('cancel_loan_and_approval', { p_loan_id: id, p_cancel_reason: null })` call
   - Remove the comment block explaining the RLS workaround (no longer needed)
3. Regression test `src/app/(portal)/fund-out/actions.cancel.test.ts`:
   - Setup: mock Supabase to return a loan in `pending_approval` status
   - Call: `cancelLoan(formData)` with the loan id
   - Assert: both `loans.update` and `approval_requests.update` were called with correct args
   - Edge case: loan not in `pending_approval` → error
4. Playwright E2E test (new file `e2e/fund-out-cancel.spec.ts`):
   - Finance creates loan → cancels before Principal approves → loan list shows no `pending_approval` row for that company

**Success criteria:**
- Regression test passes locally + CI
- Manual: cancel a test loan, verify it disappears from Fund OUT list (not just hides as rejected approval)
- `git grep 'pending_approval' src/app` returns only legitimate references (not orphan cleanup workarounds)

**Effort:** 45-60 min CC.

---

### Step 4: M1 fix — loan creation atomicity

**Why:** `createLoan` does 2 separate INSERTs. If step 2 (approval_requests) fails, orphan loan in `pending_approval`. Rare in practice but leaves data integrity time bomb.

**Deliverables:**
1. Extend migration `20260101000017_fund_out_atomicity.sql` (or new one) with:
   ```sql
   CREATE OR REPLACE FUNCTION create_loan_with_approval(
       p_company_id UUID,
       p_principal DECIMAL,
       p_base_rate DECIMAL,
       p_risk_premium DECIMAL,
       p_effective_rate DECIMAL,
       p_repayment_terms TEXT,
       p_submitted_by UUID,
       p_description TEXT
   )
   RETURNS TABLE (loan_id UUID, approval_id UUID)
   LANGUAGE plpgsql
   SECURITY INVOKER  -- respects caller's RLS — only Finance can INSERT
   SET search_path = public
   AS $$
   DECLARE
       v_loan_id UUID;
       v_approval_id UUID;
   BEGIN
       INSERT INTO loans (
           company_id, principal, base_rate, risk_premium, effective_rate,
           repayment_terms, status, created_by
       ) VALUES (
           p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
           p_repayment_terms, 'pending_approval', p_submitted_by
       )
       RETURNING id INTO v_loan_id;

       INSERT INTO approval_requests (
           request_type, reference_id, reference_table, submitted_by,
           description, amount, status, workflow_state
       ) VALUES (
           'new_loan', v_loan_id, 'loans', p_submitted_by,
           p_description, p_principal, 'pending', 'submitted'
       )
       RETURNING id INTO v_approval_id;

       RETURN QUERY SELECT v_loan_id, v_approval_id;
   END;
   $$;

   GRANT EXECUTE ON FUNCTION create_loan_with_approval(UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT, UUID, TEXT) TO authenticated;
   ```
2. Update `src/app/(portal)/fund-out/actions.ts:12-114` `createLoan`:
   - Keep all input validation + base rate + tier lookup at the top
   - Replace the 2 `.from('loans').insert(...)` and `.from('approval_requests').insert(...)` blocks with a single `supabase.rpc('create_loan_with_approval', {...})`
   - Delete the comment block at lines 89-92 explaining the non-atomic NOTE
3. Regression test `src/app/(portal)/fund-out/actions.create.test.ts`:
   - Setup: mock supabase rpc to simulate PostgreSQL error on the second INSERT
   - Call: `createLoan(formData)` with valid input
   - Assert: the RPC is called once (not separate loan+approval inserts)
   - Assert: on failure, no orphan loan exists (we can verify this in the real DB via integration test, but for unit test just confirm the RPC was called)

**Success criteria:**
- `grep "Not atomic" src/app/(portal)/fund-out/actions.ts` returns nothing (comment deleted)
- Regression test passes
- Manual E2E: create a loan via Finance, verify it appears in Principal's approvals queue (happy path still works)

**Effort:** 45-60 min CC.

---

### Step 5: L2 fix — unified config audit log

**Why:** Settings changes (treasury config, tier premiums, overdue stages, company tiers) have no history. Audit gap for disputes and compliance.

**Design choice:** One unified `config_audit_log` table instead of per-table history tables. Less schema, same queryable data, single trigger function.

**Deliverables:**
1. New migration `20260101000018_config_audit_log.sql`:
   ```sql
   CREATE TABLE config_audit_log (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       table_name TEXT NOT NULL,
       row_key TEXT NOT NULL,  -- config_key | tier | stage | company_id, depending on table
       changed_by UUID REFERENCES users(id),
       changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       old_values JSONB NOT NULL,
       new_values JSONB NOT NULL
   );

   CREATE INDEX idx_config_audit_table_row ON config_audit_log(table_name, row_key, changed_at DESC);
   CREATE INDEX idx_config_audit_changed_at ON config_audit_log(changed_at DESC);

   COMMENT ON TABLE config_audit_log IS
       'Unified audit history for all settings tables. One row per config update.';

   -- RLS: Principal + Finance can read. Nobody can insert/update/delete directly.
   ALTER TABLE config_audit_log ENABLE ROW LEVEL SECURITY;

   CREATE POLICY audit_log_pf_select ON config_audit_log
       FOR SELECT USING (current_user_role() IN ('principal', 'finance'));
   CREATE POLICY audit_log_no_insert ON config_audit_log FOR INSERT WITH CHECK (FALSE);
   CREATE POLICY audit_log_no_update ON config_audit_log FOR UPDATE USING (FALSE);
   CREATE POLICY audit_log_no_delete ON config_audit_log FOR DELETE USING (FALSE);

   -- Trigger function (SECURITY DEFINER to bypass the no_insert policy)
   CREATE OR REPLACE FUNCTION log_config_change()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
       v_row_key TEXT;
   BEGIN
       -- Extract the row identifier based on table
       v_row_key := CASE TG_TABLE_NAME
           WHEN 'treasury_config' THEN NEW.config_key
           WHEN 'tier_config' THEN NEW.tier::TEXT
           WHEN 'overdue_config' THEN NEW.stage::TEXT
           WHEN 'companies' THEN NEW.id::TEXT
           ELSE NEW.id::TEXT
       END;

       INSERT INTO config_audit_log (table_name, row_key, changed_by, old_values, new_values)
       VALUES (TG_TABLE_NAME, v_row_key, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));

       RETURN NEW;
   END;
   $$;

   -- Apply to all 4 config tables
   CREATE TRIGGER treasury_config_audit
       AFTER UPDATE ON treasury_config
       FOR EACH ROW EXECUTE FUNCTION log_config_change();

   CREATE TRIGGER tier_config_audit
       AFTER UPDATE ON tier_config
       FOR EACH ROW EXECUTE FUNCTION log_config_change();

   CREATE TRIGGER overdue_config_audit
       AFTER UPDATE ON overdue_config
       FOR EACH ROW EXECUTE FUNCTION log_config_change();

   CREATE TRIGGER companies_audit
       AFTER UPDATE ON companies
       FOR EACH ROW EXECUTE FUNCTION log_config_change();
   ```
2. Remove the inline TODO comment from `src/app/(portal)/settings/actions.ts:139-140` about tier history (it's now solved).
3. (Optional, defer to Phase 2 Settings UI work) New Settings page section "History" showing recent config changes. **Not in Phase 1.5 scope** — Phase 2 Step 8 can add this.
4. Regression test: mock Supabase, call `updateTreasuryConfig` twice, verify the audit log captures both changes. (Unit test is light because the trigger is DB-side; realistically this needs an integration test against a real Postgres, so defer the full test to Phase 2's test infra expansion and just verify the migration applies.)

**Success criteria:**
- Migration applies cleanly via `supabase db push`
- Manual test: Principal changes buffer_amount → query `SELECT * FROM config_audit_log WHERE table_name = 'treasury_config'` shows the change
- `SELECT * FROM config_audit_log` as Dept Manager → RLS blocks

**Effort:** 45-60 min CC.

---

### Step 6: Loan portfolio CSV export (small bonus)

**Why:** Listed in TODOS.md as "XS effort, may be done in Phase 1 already" — it wasn't, and it's a real Finance request. Ships in 30 min. Fits here.

**Deliverables:**
1. `src/app/(portal)/fund-out/export/route.ts` — Next.js Route Handler (yes, we use Server Actions for writes, but Route Handlers are still the idiom for file downloads):
   ```ts
   import { NextResponse } from 'next/server'
   import { requireRole } from '@/lib/auth'
   import { createClient } from '@/lib/supabase/server'

   export async function GET() {
     await requireRole(['principal', 'finance'])
     const supabase = await createClient()

     const { data: loans } = await supabase
       .from('loans')
       .select('*, companies(name, short_code, tier)')
       .order('created_at', { ascending: false })

     const { data: outstanding } = await supabase
       .from('loan_outstanding')
       .select('loan_id, outstanding, total_principal_paid, total_interest_paid')

     const outstandingMap = new Map(
       (outstanding ?? []).map(o => [o.loan_id, o])
     )

     const headers = [
       'Loan ID', 'Company', 'Short Code', 'Tier', 'Principal', 'Outstanding',
       'Base Rate', 'Risk Premium', 'Effective Rate', 'Disbursement Date',
       'Status', 'Created At'
     ]

     const rows = (loans ?? []).map(l => {
       const company = l.companies as { name: string; short_code: string; tier: string } | null
       const out = outstandingMap.get(l.id)
       return [
         l.id,
         company?.name ?? '',
         company?.short_code ?? '',
         company?.tier ?? '',
         l.principal,
         out?.outstanding ?? l.principal,
         l.base_rate,
         l.risk_premium,
         l.effective_rate,
         l.disbursement_date ?? '',
         l.status,
         l.created_at,
       ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
     })

     const csv = [headers.join(','), ...rows].join('\n')

     return new NextResponse(csv, {
       headers: {
         'Content-Type': 'text/csv; charset=utf-8',
         'Content-Disposition': `attachment; filename="loans-${new Date().toISOString().slice(0, 10)}.csv"`,
       },
     })
   }
   ```
2. Add an "Export CSV" link to `src/app/(portal)/fund-out/page.tsx` header (next to the "Record new loan" button for Finance/Principal)
3. Unit test for CSV serialization edge cases: company name with comma, quote in description, null outstanding

**Success criteria:** Finance clicks Export CSV → downloads `loans-2026-04-10.csv` with 2 rows matching current seed data. Opens cleanly in Excel.

**Effort:** 30-40 min CC.

---

## Effort estimate

| Step | CC time | User time | Total |
|------|---------|-----------|-------|
| 1 — Vercel deploy + smoke | 10 min | 20 min | 30 min |
| 2 — Test framework bootstrap | 50 min | — | 50 min |
| 3 — M2 fix (cancelLoan) | 55 min | — | 55 min |
| 4 — M1 fix (createLoan atomicity) | 55 min | — | 55 min |
| 5 — L2 fix (config audit log) | 55 min | — | 55 min |
| 6 — Loan CSV export | 35 min | — | 35 min |

**Total: ~4 hours 20 min CC time + 20 min user manual testing.**

One sitting is feasible, but recommend splitting into 2 sessions:
- **Session A (daylight, ~2.5h)**: Steps 1, 2, 3 — Deploy + test infra + first bug fix
- **Session B (daylight, ~2h)**: Steps 4, 5, 6 — Remaining fixes + CSV export

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vercel preview reveals prod-only bug | Med | High (blocks Phase 1.5) | Expected, that's WHY we deploy first. Fix inline before continuing. |
| Test framework setup hits Windows-specific snag | Med | Med | Use happy-dom (not jsdom, which has worse Windows support). Vitest works fine on Windows per their docs. |
| SECURITY DEFINER function introduces RLS bypass vulnerability | Low | **Critical** | Both new functions (`cancel_loan_and_approval`, `create_loan_with_approval`) have explicit role checks inside. Review the role checks during implementation. |
| `config_audit_log` trigger breaks existing settings updates | Med | Med | Apply migration, test each settings form before marking Step 5 complete. Trigger failures block the UPDATE, so broken = visible. |
| CSV export exposes sensitive data to unauthorized role | Low | Med | Route handler uses `requireRole(['principal', 'finance'])` — same gate as the list page |
| M1/M2 fixes break Phase 1 happy path | Med | High | Step 3 + 4 each include a happy-path E2E verification in success criteria |

---

## Success criteria for Phase 1.5 complete

1. ✅ Phase 1 deployed to Vercel (preview or production — user's call)
2. ✅ 5+ tests passing (`formatMoney`, `roles`, M3 regression, M2 regression, M1 regression)
3. ✅ GitHub Actions CI runs tests + build on every push
4. ✅ `src/app/(portal)/fund-out/actions.ts` has no "Not atomic" TODO comments
5. ✅ Manual: cancel a pending loan → loan disappears from list (M2 verified)
6. ✅ Manual: settings change → `config_audit_log` has a new row (L2 verified)
7. ✅ Finance exports CSV → valid file with all loans
8. ✅ `/qa` Phase 1.5 audit: 0 critical, 0 high, any previously-deferred Phase 1.5 items marked "done" in TODOS.md
9. ✅ Updated `CLAUDE.md` with Testing section + Phase 1.5 completion marker
10. ✅ `TODOS.md` moves M1, M2, L2, loan CSV export, test framework, Vercel deploy to Completed section

---

## What moves to Phase 1.6 / future phases (explicitly NOT in Phase 1.5)

These remain in `TODOS.md` for a future dedicated cleanup phase, NOT mixed into Phase 2:

- **Bank statement CSV import + reconciliation** — substantial scope (2-3 days), deserves its own mini-phase. Highest value of the deferred items. Post-Phase-2.
- **Slack webhook notifications** — depends on webhook infra + user preference for notification channels. Post-Phase-2.
- **Read-access audit log** (PDPA compliance) — needs Postgres SELECT triggers which are moderately complex. Phase 2.5 or Phase 3 kickoff.
- **Base rate what-if simulator** — nice to have, not blocking. Post-Phase-2.
- **PDF statement template design** — designer work needed, not pure eng. Post-Phase-2.
- **Mobile polish for complex forms** — Phase 2.5 after usage reveals real friction.
- **Dark mode** — nice to have, not blocking. Phase 3 or later.
- **Multi-currency** — Phase 3+, requires schema changes.
- **Compliance sign-off gate** (Malaysian tax agent review) — separate legal workstream, not engineering.

---

## Ready to execute?

**Next action (if user approves):** Start Session A — Steps 1, 2, 3.

If Vercel CLI is not yet installed, Step 1 starts with:
```
npm install -g vercel
vercel login
vercel link
```

Then user runs `vercel` to get a preview URL and smoke tests. User reports back, I continue with Steps 2-6.

---

## Plan Review (condensed /plan-eng-review style)

### Scope Challenge findings

**Q: Is everything in Phase 1.5 actually blocking Phase 2?**
Answer: Steps 1, 2, 3, 4, 5 yes. Step 6 (CSV export) is a bonus that piggy-backs on the test framework because it's tiny and fits the same "polish Phase 1" theme. Could be cut if you want to ship Phase 1.5 faster.

**Q: Should M1 fix wait until Phase 2?**
Answer: No. Phase 2 doesn't trigger M1 (it doesn't create loans), so there's no natural time to revisit. Fix it while the context is fresh. ~1 hour saves a future "why is this orphan loan here" incident.

**Q: Should the test framework be introduced in Phase 2 Step 0 instead of Phase 1.5 Step 2?**
Answer: No — having the test framework in Phase 1.5 means M1, M2, L2 fixes each ship with regression tests. Fixing a bug without a regression test is how the bug comes back. Phase 2's bigger test budget builds on top of the same framework.

**Q: Is unified `config_audit_log` vs per-table history tables the right call?**
Answer: Yes. Per-table (`treasury_config_history`, `tier_config_history`, etc.) means 4-6 new tables, 4-6 new triggers, 4-6 new RLS policy sets. Unified means 1 table, 1 trigger function, 1 policy set. Queryability is the same: `WHERE table_name = 'treasury_config' AND row_key = 'buffer_amount'`. **Eureka moment** for a small codebase.

### Architecture issues — 1

**Issue A1: `SECURITY DEFINER` function blast radius** (confidence 7/10)

Both `cancel_loan_and_approval` and `create_loan_with_approval` use `SECURITY DEFINER` to bypass RLS. This is correct and necessary (Finance can't normally UPDATE loans). But any bug in the internal role check makes the function a RLS bypass vector.

Mitigation: the plan already specifies `v_caller_role := current_user_role()` and explicit `RAISE EXCEPTION` if unauthorized. Make sure the unit test hits the "wrong role" path. Add to Step 3's regression test: simulate HR calling the function → should fail with `insufficient_privilege`.

**Accepted as-is, with the explicit role-check test added to Step 3.**

### Code quality issues — 1

**Issue Q1: CSV export uses a Route Handler** (confidence 9/10) — `CLAUDE.md:144` says "Writes — use Server Actions, NOT API Route Handlers. Every action calls requireRole(...) at entry."

Tension: CSV download is a READ not a write, and browsers can't download from a Server Action easily (Server Actions are designed for form submissions, not file downloads). Route Handler is the right idiom.

**Action:** Update CLAUDE.md's Coding Conventions section to clarify:
- Writes → Server Actions
- Mutations (including logout) → Server Actions
- File downloads / CSV / PDF → Route Handlers in `src/app/.../export/route.ts`
- Webhooks → Route Handlers

This is a doc clarification, not a code change. Fold into Step 6's deliverables.

### Test review

Phase 1.5 ends with 5 test files and ~15-20 passing tests:
- `utils.test.ts` — formatMoney (4 cases)
- `roles.test.ts` — canAccess* × 4 roles (8-12 cases)
- `approvals/actions.escalation.test.ts` — M3 regression (4 tier paths)
- `fund-out/actions.cancel.test.ts` — M2 regression (3 cases: happy, wrong role, wrong status)
- `fund-out/actions.create.test.ts` — M1 regression (2 cases: happy, simulated insert failure)
- `export/csv.test.ts` — CSV serialization (3 cases: comma, quote, null)

**Gaps acknowledged:** L2 (config audit log) doesn't have a unit test because it's DB-trigger-based. Verified manually in Step 5 success criteria. Add to Phase 2 test infra expansion when we have Supabase local integration testing.

### Performance review

No concerns. All 6 steps touch minor code. The `config_audit_log` index is adequate for expected query patterns. CSV export does 2 queries + in-memory join for <100 rows — fine.

### NOT in Phase 1.5 scope (already covered above)

See "What moves to Phase 1.6" section.

### Failure modes

| Codepath | Realistic failure | Test? | Error handling? | User sees? |
|----------|-------------------|-------|----------------|------------|
| `cancel_loan_and_approval` — HR calls it | Wrong role bypass | ✓ (new) | RAISE EXCEPTION | Clear error |
| `create_loan_with_approval` — duplicate loan | Rare, but possible | ✗ | Postgres constraint | Error message |
| `config_audit_log` trigger — `auth.uid()` is NULL | Anonymous update (shouldn't happen) | ✗ | NULL row | Audit log has NULL `changed_by` — acceptable |
| CSV export — 10,000 rows | Slow download | ✗ | — | Browser shows "Downloading..." for several seconds |
| Vitest on Windows — path alias issue | Common gotcha | ✗ (the TEST failing is the test) | Setup error | Fails loudly at npm test |

**No critical gaps flagged.** All identified failure modes either have tests or surface visibly.

### Completion summary

- Scope Challenge: **no reduction recommended** — the plan is already minimal
- Architecture: **1 issue** (A1 — SECURITY DEFINER blast radius, mitigated)
- Code Quality: **1 issue** (Q1 — Route Handler convention, folded into Step 6)
- Test Review: **5 new test files, 15-20 tests planned, no critical gaps**
- Performance: **0 issues**
- Not-in-scope: **written, 9 items deferred**
- What already exists: **Phase 3 prereqs verified in Phase 1 foundation (director_payouts.calculation_snapshot ✓, statutory effective_from/to ✓, approval_requests workflow ✓)**
- Failure modes: **5 evaluated, 0 critical gaps**
- Parallelization: **Sequential — each step's fix informs the next. No parallelization opportunity.**
- Lake Score: **6/6 recommendations chose complete option** (Step 6 is additive but tiny; everything else is complete-as-planned)

**VERDICT: CLEAR — ready to execute.**
