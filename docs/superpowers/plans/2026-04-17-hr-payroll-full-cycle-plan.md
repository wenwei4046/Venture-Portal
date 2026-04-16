# Spec 1–6 Full Cycle Implementation Plan — HR Payroll Redesign

**Author**: Claude (planning agent)
**Date**: 2026-04-17
**Target branch**: `claude/amazing-kepler` (worktree)
**Base branch**: `main`
**Related spec**: [`docs/superpowers/specs/2026-04-17-hr-payroll-redesign-spec.md`](../specs/2026-04-17-hr-payroll-redesign-spec.md)

---

## Pre-flight findings that change the plan (must read before Spec 1)

1. **Migration numbering is not contiguous**. Worktree has `20260101000072` → gap → `20260101000100–116` → gap → `20260101000119`. The initial assumption "max on main is 20260101000116" is wrong. Starting Spec 1 at `20260101000120` is still safe (no collision).
2. **`payment_voucher_sources` has a hard-coded max-3-rows trigger** (migration 103, function `pvs_enforce_max_three`). Spec 4's requirement "HR Pool + Finance Pool + Director Pool + Marketing Pool + (possible 5th)" **will break** under this trigger. Raised as **Spec 4 Blocker-1** with a proposed migration to drop the cap in favor of a CHECK.
3. **`lookup_epf` already accepts `p_part epf_part DEFAULT 'A'`** and **`lookup_socso` accepts `p_category socso_category DEFAULT 'first'`**. The existing `compute_hr_staff_statutory` trigger does NOT pass these — it always uses defaults. Spec 1 needs to re-declare the trigger to pass the new `epf_category` and `socso_category` columns.
4. **`hr_staff_costs` has NO `updated_by` column** (only `updated_at`). The audit trail plan for `hr_staff_salary_history` should derive actor from `current_setting('request.jwt.claims')` or pass `created_by` from the Server Action — the trigger alone cannot identify the user cleanly.
5. **`payment_vouchers.source_pool` is deprecated as of migration 115** — new code must write only into `payment_voucher_sources`. Spec 2 salary_payout voucher generation reflects this.
6. **The `approved_has_metadata` CHECK constraint** requires both `approved_by` and `approved_at` when status is `approved` or `paid`. Spec 2's auto-generated `salary_payout` vouchers need `approved_by = <Principal user_id>` and `approved_at = NOW()`.
7. **Director pool is now `director_pool`** (migration 101 renamed from `salary_pool`). Spec 3 uses `director_pool` consistently.
8. **Currently uncommitted in the worktree**: `migrations/20260101000119_director_ctc_statutory_auto_compute.sql` (untracked), plus two modified files (`director-salary/{_components/CTCInputGrid.tsx, page.tsx}`). These must land first.
9. **Existing `compute_hr_staff_statutory` trigger only recalculates when basic_salary / allowances / non_statutory_allowance change** — adding category columns means we need to list them in the trigger's `UPDATE OF` clause too, otherwise changing `epf_category` alone won't recompute.
10. **`hr_cost_submissions` already carries a period snapshot** (see migration 18). Spec 3's pool routing must decide: does `hr_monthly_payroll` replace `hr_cost_submissions`, or does it live alongside? **Decision**: keep `hr_cost_submissions` as the billing-to-subsidiaries snapshot (unchanged), use `hr_monthly_payroll` as the per-employee record. `generate_monthly_invoices` reads from `hr_cost_submissions` today — no change needed there.

---

## Executive summary — what ships at each boundary

| Spec | User outcome | Risk retired |
|------|-------------|-------------|
| **1 — HR Monthly Payroll Core** | HR can enter April 2026 payroll (basic + allowances + OT + commission) for all staff in an inline grid; import from InfoTech CSV via column mapper; edit staff master data; pro-rata is automatic. | "Delete + re-add wipes history"; no monthly variability. |
| **2 — OPEX Statement + Principal Approval** | Submit-to-Principal flow; Principal sees 4-OPEX consolidated view, approves, N `salary_payout` vouchers generate atomically. | No audit trail for payroll approvals. |
| **3 — Per-Dept Pool Architecture** | Finance routes HR/Finance/Director/Digital invoices to their own operating pools; balance visible at `/operating-fund`. | OPEX pool leakage into `hv_operating_fund`. |
| **4 — Bank Transfer + Alliance Bank Pool** | Finance logs transfer from Hong Leong pools → Alliance payroll pool; salary vouchers debit Alliance only. | Payroll account runs dry without audit. |
| **5 — Payslip PDF + Bank Transfer File** | Each employee gets a Malaysian-format payslip PDF; Finance downloads Maybank2E / RHB REFLEX / PBB eAF / HL Connect bulk payment file. | Manual payslip typing + manual bank portal entry. |
| **6 — Statutory Compliance Files** | KWSP Form A, PERKESO Borang 2/3 + EIS Borang 4, LHDN CP39 auto-generated as a ZIP per period. | Manual government form typing. |

Cumulative delivery: a complete monthly payroll cycle — enter → review → approve → fund → pay → distribute payslips → submit statutory returns. Each spec is deployable independently; each adds a closed loop on the previous.

---

## Pre-flight (before Spec 1 kick-off)

### Code archaeology checklist

Before writing any code, verify these exist in `main` (exploration confirmed 9/10):

- [x] `hr_staff_costs` table (migration 7) with `epf_er/socso_er/eis_er/total_ctc/non_statutory_allowance` columns
- [x] `compute_hr_staff_statutory` trigger (mig 39 + 41)
- [x] `lookup_epf(wages, part, period)` / `lookup_socso(wages, category, period)` / `lookup_eis(wages, period)` / `lookup_pcb(income, category, children, period)` RPCs (mig 27)
- [x] `hr_cost_submissions` table (mig 18) — immutable monthly snapshot
- [x] `generate_monthly_invoices(period)` RPC (mig 19) reading from `hr_cost_submissions`
- [x] `payment_vouchers` + `payment_voucher_sources` (mig 50 + 103) — note **max-3-source trigger**
- [x] `director_ctc` + `director_payouts` (mig 5)
- [x] `compute_director_ctc_total` trigger (mig 119, **in worktree only, must land first**)
- [x] `requireRole(...)` helper at `src/lib/auth.ts`
- [x] `period-lock.ts` (`assertPeriodOpen`) — integrates in Spec 2

**Pre-flight ownership**: whoever starts Spec 1 must first commit and push the untracked `20260101000119_director_ctc_statutory_auto_compute.sql` (worktree has two modified files too — resolve these first).

### Sample data prep

- Verify `scripts/seed-hr-staff.mjs` runs clean against a wiped DB:
  - `node --env-file=.env.local scripts/wipe-test-data.mjs`
  - `node --env-file=.env.local scripts/seed-hr-staff.mjs`
  - Expect: 9 staff (3 HR + 3 Finance + 3 Marketing), period 2026-04-01, `hr_pool_allocation` + `hr_staff_allocation` populated
- Post-Spec-1: extend `seed-hr-staff.mjs` (additive) to also seed `hire_date`, `employee_code`, `pcb_category` for each row, and insert one matching `hr_monthly_payroll` row per staff for the current period (so UI isn't empty on first deploy).

### Test harness baseline

Before Spec 1 commit 1:
- `npm run test:ci` green (Vitest)
- `npm run build` green (Next.js 15)
- `npx tsc --noEmit` green

CI workflow `.github/workflows/test.yml` already guards tests + build.

---

## Spec 1 — HR Monthly Payroll Core

### Goal

HR opens `/hr-costing/payroll/2026-04-01`, sees a grid with one row per active employee, edits basic/stat-allow/non-stat-allow/OT/commission inline with live per-row statutory preview, saves as draft, and can either re-open or submit. First-time users on the new system can import an InfoTech CSV via a column mapper that saves the mapping for reuse.

Staff master data is editable (Edit button). Changes to `basic_salary` on master records are written to `hr_staff_salary_history` with an effective date. All staff gain fields needed for accurate statutory lookup: `employee_code`, `hire_date`, `resignation_date`, `epf_category`, `socso_category`, `is_epf_exempt`, `pcb_category`, `children_count`, `employment_type`.

### Success criteria

1. Given 9 seeded staff, HR can open `/hr-costing/payroll/2026-04-01` and see 9 rows pre-filled from master basic + non-stat-allow.
2. Entering `basic_salary=5000, stat_allow=300, ot_hours=10, ot_amount=300` on a row shows `gross=5600, epf_ee=616, socso_ee=19.75, eis_ee=5.50, pcb=<lookup>, net=<computed>` within 500ms.
3. Editing Basic on the Staff Master page writes an `hr_staff_salary_history` row with `effective_date = today + 1 month` (next period) and the old basic.
4. Uploading `test_infotech.csv` (9 rows with non-matching column names) opens the mapper; after mapping, preview shows "9 to update, 0 new, 0 skipped"; save applies and template persists under user's account.
5. A row with `hire_date = 2026-04-15` (mid-April) computes prorated basic = `basic * 16/30` (16 days worked) and prorated stat-allow + OT but full commission.
6. Unit tests for `src/lib/payroll-calc.ts` cover: full-month, hire-mid-month, resign-mid-month, epf-exempt, pcb-lookup-with-children, commission-tiered, commission-pct-of-base.
7. Finance navigating to `/hr-costing/payroll/2026-04-01` gets 403 (RLS denial); Finance's `/hr-costing/summary` view still shows dept aggregates only.

### Data model changes

**Migration `20260101000120_hr_payroll_staff_enhancements.sql`**
- `ALTER TABLE hr_staff_costs ADD COLUMN employee_code TEXT` (partial unique index `WHERE status='active'`)
- `ALTER TABLE hr_staff_costs ADD COLUMN hire_date DATE NOT NULL DEFAULT '2020-01-01'` then drop default
- `ALTER TABLE hr_staff_costs ADD COLUMN resignation_date DATE`
- `ALTER TABLE hr_staff_costs ADD COLUMN epf_category epf_part NOT NULL DEFAULT 'A'` (reuse existing enum)
- `ALTER TABLE hr_staff_costs ADD COLUMN socso_category socso_category NOT NULL DEFAULT 'first'`
- `ALTER TABLE hr_staff_costs ADD COLUMN is_epf_exempt BOOLEAN NOT NULL DEFAULT FALSE`
- `ALTER TABLE hr_staff_costs ADD COLUMN pcb_category pcb_category NOT NULL DEFAULT 'KA1'`
- `ALTER TABLE hr_staff_costs ADD COLUMN children_count INTEGER NOT NULL DEFAULT 0 CHECK (children_count >= 0)`
- `CREATE TYPE hr_employment_type AS ENUM ('salaried','commission_eligible')`
- `ALTER TABLE hr_staff_costs ADD COLUMN employment_type hr_employment_type NOT NULL DEFAULT 'salaried'`
- Rewrite `compute_hr_staff_statutory` to pass `epf_category`, `socso_category`, skip lookup if `is_epf_exempt=TRUE`
- Extend trigger `UPDATE OF` clause to include the new columns

**Migration `20260101000121_hr_staff_salary_history.sql`**
- `CREATE TABLE hr_staff_salary_history (id, staff_id FK, old_basic, new_basic, effective_from DATE, changed_by UUID FK users, changed_at TIMESTAMPTZ, reason TEXT)`
- BEFORE UPDATE trigger on `hr_staff_costs` that, when `OLD.basic_salary <> NEW.basic_salary`, inserts a history row with `effective_from = date_trunc('month', NOW()) + interval '1 month'`, `changed_by = current_setting('request.jwt.claim.sub')::uuid`
- RLS: principal+hr SELECT, system-only INSERT via trigger

**Migration `20260101000122_hr_monthly_payroll.sql`**
- `CREATE TYPE hr_monthly_payroll_status AS ENUM ('draft','submitted','paid')`
- `CREATE TYPE hr_monthly_payroll_source AS ENUM ('imported','manual','carried_forward')`
- `CREATE TABLE hr_monthly_payroll (...)` — full column list:
  - `id`, `staff_id FK`, `period_month`, `basic_salary`, `statutory_allowance`, `non_statutory_allowance`
  - `ot_hours`, `ot_amount`, `commission_amount`
  - `unpaid_leave_days` (for future)
  - `prorata_days_worked`, `prorata_days_in_month`
  - `epf_er`, `epf_ee`, `socso_er`, `socso_ee`, `eis_er`, `eis_ee`, `pcb`
  - `gross` (generated: basic + stat_allow + non_stat + ot + commission)
  - `net` (generated: gross − EE deductions − PCB)
  - `source` enum `imported|manual|carried_forward`
  - `status` enum `draft|submitted|paid`
  - `created_by`, `created_at`, `updated_at`
- UNIQUE `(staff_id, period_month)`
- BEFORE INSERT/UPDATE trigger `compute_hr_monthly_payroll`:
  1. Load staff master: `hire_date`, `resignation_date`, `epf_category`, `socso_category`, `is_epf_exempt`, `pcb_category`, `children_count`
  2. Compute `days_in_month`, `days_worked` from hire/resignation dates; `prorata_ratio = days_worked / days_in_month`
  3. Apply prorata to `basic_salary + statutory_allowance + ot_amount` (NOT commission, NOT non_statutory_allowance per user decision)
  4. Statutory wages = `prorated_basic + prorated_stat_allow`
  5. `lookup_epf(stat_wages, epf_category)` → epf_er/epf_ee (unless exempt)
  6. `lookup_socso(stat_wages, socso_category)` → socso_er/socso_ee
  7. `lookup_eis(stat_wages)` → eis_er/eis_ee
  8. `taxable_income = gross - epf_ee`
  9. `lookup_pcb(taxable_income, pcb_category, children_count)` → pcb
- Indexes: `(period_month, status)`, `(staff_id, period_month)`, `(period_month) WHERE status='submitted'`

**Migration `20260101000123_commission_rules.sql`**
- `CREATE TYPE commission_rule_type AS ENUM ('tiered_per_unit','pct_of_base')`
- `CREATE TYPE commission_base_source AS ENUM ('dept_np','company_sales','team_commission_sum','staff_sales_count','staff_sales_amount')`
- `CREATE TABLE commission_rules (id, staff_id FK NULL, rule_type, rule_name, tier_config JSONB, base_source commission_base_source NULL, pct DECIMAL(7,6) NULL, base_dept_id FK NULL, effective_from DATE, effective_to DATE NULL, created_by, created_at)`
  - For `tiered_per_unit`: `tier_config = [{from:0, to:10, rate:50}, {from:11, to:30, rate:80}, {from:30, to:null, rate:100}]`
  - For `pct_of_base`: `pct` + `base_source` + optional `base_dept_id`
  - Staff may have multiple rules — all apply (summed)
- `CREATE TABLE commission_inputs (id, staff_id FK, period_month, sales_count INT, sales_amount DECIMAL(15,2), notes TEXT, created_by, created_at)`
- RPC `compute_commission(p_staff_id, p_period) RETURNS DECIMAL` — sums all applicable rules
- Indexes: `commission_rules (staff_id, effective_from DESC)`; `commission_inputs UNIQUE (staff_id, period_month)`

**Migration `20260101000124_hr_import_templates.sql`**
- `CREATE TABLE hr_import_templates (id, user_id FK, template_name, column_map JSONB, match_strategy TEXT CHECK IN ('employee_code','employee_name_fuzzy'), created_at, updated_at)`
- `column_map` shape: `{"infotech_name": "hr_monthly_payroll_field"}` e.g. `{"Emp No": "employee_code", "Basic Pay": "basic_salary", "OT (Hrs)": "ot_hours"}`
- RLS: principal+hr CRUD; each user sees own templates + templates where `user_id IS NULL` (team shared)

**Migration `20260101000125_hr_monthly_payroll_summary_view.sql`**
- View `hr_monthly_payroll_summary` for Finance: `SELECT period_month, department_id, SUM(gross) AS dept_gross, SUM(epf_er+socso_er+eis_er) AS dept_stat_er, SUM(net) AS dept_net FROM hr_monthly_payroll JOIN hr_staff_costs USING(staff_id) JOIN departments... GROUP BY period_month, department_id`
- GRANT SELECT on view to `authenticated`; the view is SECURITY INVOKER so RLS on `hr_monthly_payroll` blocks Finance from raw table — **this is the key** (Finance gets aggregate, not detail)

**Migration `20260101000126_hr_monthly_payroll_backfill.sql`**
- For each row in `hr_staff_costs WHERE status='active'`, INSERT into `hr_monthly_payroll` for the current period with basic/non_stat from master, stat/ot/commission = 0, status='draft'. Idempotent.

### RLS policies

| Table | principal | finance | hr | dept_manager |
|---|---|---|---|---|
| `hr_monthly_payroll` | SELECT/INSERT/UPDATE (draft+paid) | **DENY ALL** | SELECT/INSERT/UPDATE (draft only) | DENY |
| `hr_monthly_payroll_summary` (view) | SELECT | SELECT | SELECT | DENY |
| `hr_staff_salary_history` | SELECT | DENY | SELECT | DENY |
| `commission_rules` | ALL | DENY | SELECT/INSERT/UPDATE | DENY |
| `commission_inputs` | SELECT | DENY | SELECT/INSERT/UPDATE | DENY |
| `hr_import_templates` | ALL | DENY | own + shared SELECT/INSERT/UPDATE/DELETE | DENY |

Submitted-status rows in `hr_monthly_payroll` must be read-only for HR (UPDATE policy: `USING (status='draft')`).

### Server Actions + RPC signatures

Create directory `src/app/(portal)/hr-costing/payroll/` with:

- `actions.ts`:
  - `createPayrollPeriod(period: string): Promise<void>` — idempotent INSERT carrying master basics forward
  - `copyFromLastMonth(period: string): Promise<{copied: number}>`
  - `updatePayrollRow(id: string, fields: Partial<PayrollRow>): Promise<void>` — status must be draft
  - `recomputeCommission(period: string): Promise<{updated: number}>`
  - `saveDraft(period: string, rows: PayrollRow[]): Promise<void>` — bulk upsert
  - (submitToPrincipal lives in Spec 2)
- `[period]/import/actions.ts`:
  - `previewImport(formData): Promise<{updates: N, inserts: 0, skipped: [...]}>`
  - `applyImport(mapping: ColumnMap, rows: ParsedRow[], period: string): Promise<void>`
  - `saveTemplate(name: string, mapping: ColumnMap): Promise<string>`

Server-side pure helper module `src/lib/payroll-calc.ts`:
- `computeProrataRatio(hireDate, resignDate, period): number`
- `splitCommission(rules, inputs): { perRule: {...}, total: number }`
- `computeGrossAndNet(row, lookups): { gross, net, epfEe, socsoEe, eisEe, pcb }` — no DB calls; takes pre-fetched lookup rates as args

RPC signatures:
- `compute_commission(p_staff_id UUID, p_period DATE) RETURNS DECIMAL` — pulls rules + inputs internally
- `carry_payroll_forward(p_period DATE) RETURNS INT` — bulk insert of next month from current

### UI pages + components

```
src/app/(portal)/hr-costing/
  payroll/
    page.tsx                         — list of periods with totals + status
    [period]/
      page.tsx                       — main editable grid
      _components/
        PayrollGrid.tsx              — inline editable, optimistic statutory preview
        PayrollRow.tsx               — one row; hover tooltip like CTCInputGrid
        PayrollActions.tsx           — Copy from last month / Import / Recompute / Save / Submit
        PayrollStatutoryTooltip.tsx  — reuse styling from director-salary
      import/
        page.tsx                     — upload + mapper UI
        _components/
          FileUpload.tsx
          ColumnMapper.tsx           — left: detected headers; right: dropdown of system fields
          ImportPreview.tsx
        actions.ts
      actions.ts
  staff/
    [id]/edit/page.tsx               — NEW — wire existing updateStaff action to UI
    _components/EditStaffForm.tsx    — mirrors AddStaffForm + new fields
```

Staff master Edit button: add `<Link href={\`/hr-costing/staff/${s.id}/edit\`}>Edit</Link>` inside existing `StaffActions.tsx` (currently only has Delete).

Bilingual pattern (per existing director-salary page): English label + `font-serif italic text-graphite` zh-CN subtitle, `font-mono tabular` for money.

### Testing plan

**Unit** (Vitest, `src/lib/payroll-calc.test.ts`):
- `computeProrataRatio`: 7 cases covering full month, hire-day-1, hire-day-15, resign-day-14, hire-and-resign-same-month, hire-before-period, resign-after-period
- `splitCommission`: tiered (boundary at 10, 30, 31), pct (dept NP positive/negative/zero), multi-rule sum
- `computeGrossAndNet`: exempt/non-exempt, with/without children, boundary RM20K, boundary RM6K
- Goal: 100% branch coverage on `payroll-calc.ts`

**Integration** (Supabase local via `supabase db reset`):
- Seed 9 staff with mixed hire_dates
- Call `carry_payroll_forward('2026-05-01')` → 9 rows
- Update one row basic → verify trigger recomputes EPF/SOCSO/EIS/PCB
- Update one row `is_epf_exempt=TRUE` → EPF/EIS stay 0, SOCSO still computes

**Manual QA** (Playwright):
- Login as HR, navigate `/hr-costing/payroll/2026-04-01`, verify 9 rows
- Edit basic → tab out → preview updates
- Upload `test_infotech.csv` → map → apply → rows updated
- Login as Finance → `/hr-costing/payroll/2026-04-01` → 403 redirect
- Finance → `/hr-costing` → summary shows dept aggregates only

### Migration / backfill steps

1. Apply `20260101000120` (columns) — no data loss, defaults cover existing rows
2. Apply `20260101000121` (salary history table) — empty
3. Apply `20260101000122` (payroll table) — empty
4. Apply `20260101000123` (commission rules) — empty. Pre-populate rules for known staff via ad-hoc SQL after deploy (see Open Questions)
5. Apply `20260101000124` (import templates) — empty
6. Apply `20260101000125` (summary view)
7. Apply `20260101000126` (backfill current period) — idempotent

### Risk callouts

- **Trigger recursion**: `compute_hr_monthly_payroll` must not call a function that re-UPDATEs the same row. Use `BEFORE INSERT OR UPDATE` and set NEW.* directly.
- **Pro-rata rounding**: Malaysian practice varies (calendar days vs working days). Plan defaults to calendar days per user's description — matches InfoTech. **Flag for user**: Malaysian labor law sometimes uses working days for mid-month joiners.
- **Commission timing**: if `recomputeCommission` is called before `commission_inputs` is filled, commission = 0. Acceptable — surfaced as "0" not an error.
- **Rollback**: each migration is additive; rollback = `DROP TABLE hr_monthly_payroll CASCADE` + ALTER drops. Salary history data destroyed on rollback — acceptable, warn user.

### Atomic commit plan

1. `feat(hr-payroll-1a): extend hr_staff_costs with employee_code, hire_date, category fields` — migration 120 + updated trigger (~180 LOC)
2. `feat(hr-payroll-1b): add hr_staff_salary_history audit trail` — migration 121 + trigger (~80 LOC)
3. `feat(hr-payroll-1c): add hr_monthly_payroll core table + compute trigger` — migration 122 + unit tests (~320 LOC)
4. `feat(hr-payroll-1d): add commission rules + inputs + compute_commission RPC` — migration 123 + unit tests (~220 LOC)
5. `feat(hr-payroll-1e): extract payroll-calc pure logic + unit tests` — `src/lib/payroll-calc.ts` + `.test.ts` (~280 LOC)
6. `feat(hr-payroll-1f): wire updateStaff Edit button + form` — UI + new route `/hr-costing/staff/[id]/edit` (~180 LOC)
7. `feat(hr-payroll-1g): payroll period list page + server actions` — `/hr-costing/payroll/page.tsx` + actions.ts (~240 LOC)
8. `feat(hr-payroll-1h): payroll editable grid page` — `[period]/page.tsx` + PayrollGrid + PayrollRow (~420 LOC)
9. `feat(hr-payroll-1i): add hr_import_templates + column mapper UI` — migration 124 + import route (~380 LOC)
10. `feat(hr-payroll-1j): add hr_monthly_payroll_summary view for Finance` — migration 125 + Finance route guard (~80 LOC)
11. `chore(hr-payroll-1k): backfill current period + seed enhancements` — migration 126 + updated seed-hr-staff.mjs (~120 LOC)

Total ~2,500 LOC across 11 commits, each < 500 LOC, each passes CI independently.

---

## Spec 2 — Consolidated OPEX Statement → Principal Approval

### Goal

HR clicks "Submit to Principal" on a complete payroll grid. A `payroll_runs` row is created with 4 OPEX totals (Marketing, HR, Finance, Director). Principal sees it in `/approvals`, drills into `/approvals/payroll-run/[id]`, sees the 4-dept breakdown and per-employee detail, approves. On approve, an atomic RPC generates N `salary_payout` `payment_vouchers` (one per employee + director), all `status=paid`, and flips `hr_monthly_payroll.status='paid'` and `director_payouts.status='paid'`.

### Success criteria

1. HR submits April 2026 payroll with 9 staff + 4 directors → `payroll_runs` row created with correct OPEX totals; `hr_monthly_payroll.status='submitted'` for all 9 rows.
2. Principal's `/approvals` shows new item "Payroll Run — April 2026 — RM XX,XXX.XX".
3. Principal detail page shows 4 cards (Marketing OPEX, HR OPEX, Finance OPEX, Director OPEX) with per-employee breakdown.
4. Finance viewing the same detail page sees only the 4 totals — no per-employee drill-down.
5. Principal approves → 13 `payment_vouchers` generated (9 staff + 4 directors), each `voucher_type='salary_payout'`, `status='paid'`, `reference_id=<hr_monthly_payroll.id or director_payouts.id>`.
6. `payroll_runs.status='paid'`, `paid_at` set. `hr_monthly_payroll.status='paid'` for all rows.
7. Principal rejects → `payroll_runs.status='draft'`, `hr_monthly_payroll` flips back to `draft`, comment persisted in `approval_requests`.
8. Period lock on 2026-03 blocks approval of a March payroll run (locked period test).
9. RLS: HR cannot UPDATE a submitted row back to draft directly (must go through reject flow).

### Data model changes

**Migration `20260101000127_payroll_runs.sql`**
- `CREATE TYPE payroll_run_status AS ENUM ('draft','submitted','approved','paid','rejected')`
- `CREATE TABLE payroll_runs (id UUID PK, period_month DATE UNIQUE NOT NULL, marketing_opex_total DECIMAL(15,2) NOT NULL DEFAULT 0, hr_opex_total DECIMAL(15,2) NOT NULL DEFAULT 0, finance_opex_total DECIMAL(15,2) NOT NULL DEFAULT 0, director_salary_total DECIMAL(15,2) NOT NULL DEFAULT 0, total_amount DECIMAL(15,2) GENERATED ALWAYS AS (marketing_opex_total + hr_opex_total + finance_opex_total + director_salary_total) STORED, status payroll_run_status NOT NULL DEFAULT 'draft', approval_id UUID REFERENCES approval_requests(id), submitted_by UUID, submitted_at TIMESTAMPTZ, approved_by UUID, approved_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, rejected_at TIMESTAMPTZ, rejection_reason TEXT, created_at, updated_at)`
- Index `(status, period_month)` and `(period_month)`
- RLS: principal + finance SELECT; hr SELECT own-submitted; hr INSERT; principal UPDATE (approve/reject); hr UPDATE (only when status='rejected' back to 'draft')

**Migration `20260101000128_payroll_approval_rpc.sql`**
- RPC `submit_payroll_to_principal(p_period DATE, p_user_id UUID) RETURNS UUID`
  - Opens tx, assert period unlocked, assert all `hr_monthly_payroll` for period are `draft`
  - Compute 4 OPEX totals (scan `hr_monthly_payroll` + `director_payouts`)
  - INSERT into `payroll_runs` (status='submitted')
  - INSERT into `approval_requests` (request_type='payroll_run', reference_id=runs.id)
  - UPDATE `hr_monthly_payroll` set status='submitted'
  - RETURN runs.id
- RPC `approve_payroll_run(p_run_id UUID, p_approver UUID) RETURNS VOID`
  - Opens tx, assert status='submitted'
  - UPDATE `payroll_runs` set status='approved', approved_by, approved_at
  - For each `hr_monthly_payroll` where status='submitted' AND period matches:
    - INSERT `payment_vouchers` (voucher_type='salary_payout', direction='debit', status='paid', amount=net, payee_name, reference_type='hr_monthly_payroll', reference_id, approved_by=p_approver, approved_at=NOW(), executed_by=p_approver, executed_at=NOW(), payment_date=CURRENT_DATE, payment_method='bank_transfer')
    - INSERT `payment_voucher_sources` (pool='hv_operating_fund' for Spec 2; becomes 'alliance_bank_pool' in Spec 4)
    - UPDATE `hr_monthly_payroll` set status='paid'
  - Similar loop for `director_payouts` where `status='confirmed' AND period matches AND no voucher exists yet`
  - UPDATE `payroll_runs` set status='paid', paid_at=NOW()
  - Log to `access_audit_log`
- RPC `reject_payroll_run(p_run_id, p_approver, p_reason) RETURNS VOID`
  - Opens tx
  - UPDATE `payroll_runs` set status='rejected', rejection_reason, rejected_at
  - UPDATE `hr_monthly_payroll` set status='draft' where period matches
  - Append comment to approval_requests

### RLS policies

| Table | principal | finance | hr | dept_manager |
|---|---|---|---|---|
| `payroll_runs` | SELECT/INSERT/UPDATE | SELECT | SELECT/INSERT | DENY |
| `approval_requests` (payroll_run rows) | SELECT/UPDATE | SELECT | SELECT (own) | DENY |

### Server Actions + RPC signatures

- `src/app/(portal)/hr-costing/payroll/[period]/actions.ts`:
  - `submitToPrincipal(period: string): Promise<string>` — calls `submit_payroll_to_principal` RPC, returns run.id, redirects to `/approvals/payroll-run/[id]`
- `src/app/(portal)/approvals/payroll-run/[id]/actions.ts`:
  - `approvePayrollRun(runId: string): Promise<void>` — `requireRole(['principal'])`, assert period unlocked via `assertPeriodOpen`, call RPC
  - `rejectPayrollRun(runId: string, reason: string): Promise<void>` — `requireRole(['principal'])`, call RPC

### UI pages + components

- `src/app/(portal)/approvals/payroll-run/[id]/page.tsx` — 4-OPEX summary cards + drill-down (role-gated)
- `src/app/(portal)/approvals/payroll-run/[id]/_components/OpexCard.tsx` — for each dept, show employee list (only if principal+hr)
- `src/app/(portal)/approvals/payroll-run/[id]/_components/FinanceView.tsx` — only 4 totals; no drill-down
- `src/app/(portal)/approvals/page.tsx` — extend queue renderer to handle `request_type='payroll_run'`

### Testing plan

**Unit**: add `src/lib/payroll-run-totals.test.ts` — given a set of monthly_payroll rows + director_payouts, `computeOpexTotals()` returns the right 4 numbers.

**Integration**: SQL test
- Seed 9 payroll rows (3 HR + 3 Finance + 3 Marketing) + 4 director_payouts
- Call `submit_payroll_to_principal` → assert payroll_runs row + approval_requests row
- Call `approve_payroll_run` → assert 13 payment_vouchers, all with status='paid' and payment_date set
- Assert sum(voucher.amount) == payroll_runs.total_amount

**Manual QA**: the full flow — HR submits, Principal approves, Finance sees 4 totals only.

### Migration / backfill steps

Pure additive — no existing data to migrate.

### Risk callouts

- **`approved_has_metadata` CHECK**: vouchers must set `approved_by + approved_at` simultaneously with `status='paid'`. The RPC sets both. Tested.
- **Transaction atomicity**: if voucher generation fails mid-loop (e.g. RLS, CHECK), entire tx rolls back — `hr_monthly_payroll` stays at `submitted`, not lost in limbo.
- **Period lock**: `assertPeriodOpen` called from Server Action, not from RPC. An attacker with direct DB access could bypass — acceptable since DB is behind Supabase Auth + RLS.
- **Double-approval**: `approve_payroll_run` asserts `status='submitted'` at top — second call fails.
- **Rollback**: if Principal approves and immediately wants to undo, no rollback path exists. Must void vouchers + reverse statuses manually. Document as limitation.

### Atomic commit plan

1. `feat(hr-payroll-2a): add payroll_runs table + RLS` — migration 127 (~140 LOC)
2. `feat(hr-payroll-2b): submit_payroll_to_principal RPC` — migration 128 part 1 + integration test (~280 LOC)
3. `feat(hr-payroll-2c): approve/reject payroll RPCs` — migration 128 part 2 + integration test (~350 LOC)
4. `feat(hr-payroll-2d): submit button + Server Action` — PayrollActions.tsx update + actions.ts (~120 LOC)
5. `feat(hr-payroll-2e): Principal approval detail page` — new route + OpexCard/FinanceView (~380 LOC)
6. `feat(hr-payroll-2f): approvals queue handles payroll_run type` — update existing queue (~100 LOC)

Total ~1,370 LOC / 6 commits.

---

## Spec 3 — Per-Department Pool Architecture

### Decision needed up-front (resolved in recommendation)

**User's hint**: HR, Finance, Director, Digital are "OPEX-collector pools, not P&L pools". Marketing is already a P&L pool via `dept_pools`.

**Recommendation**: new table `operating_pools` — keep `dept_pools` untouched. `dept_pools` stays Marketing-only. New pools route in as cash-in from invoice settlement, cash-out from payroll / expenses.

Rationale:
- `dept_pools` has complex `transaction_type` enum tied to Marketing P&L semantics (project_income, project_expense, commission_expense, etc.) that don't apply to HR/Finance/Director.
- Separating keeps both tables simple and preserves existing dept-pool logic.

### Goal

Finance routes each generated invoice to its proper pool. When that invoice is settled (paid), the payment voucher credits the correct pool. `/operating-fund` shows live balances for HR / Finance / Director / Digital pools, each with txn log.

### Success criteria

1. `generate_monthly_invoices(2026-04-01)` tags each invoice with `routes_to_pool` (hr_opex / finance_opex / director_opex / digital_opex / marketing depending on billing_mode).
2. When a subsidiary pays an invoice (creates `billing_payment` voucher status=paid), trigger inserts a credit row to `operating_pools` for the matching pool.
3. `/operating-fund` page (extended) shows balances for HR / Finance / Director / Digital pools alongside existing `hv_operating_fund` and `invoice_payout_pool`.
4. Director pool balance == sum(director_payouts.net_75 payments in) − sum(director salary outflows).
5. Invariant test: `SELECT SUM(amount) FROM operating_pools WHERE pool_type='hr_opex'` == `operating_pool_balance.hr_opex`.

### Data model changes

**Migration `20260101000129_operating_pools.sql`**
- `CREATE TYPE operating_pool_type AS ENUM ('hr_opex','finance_opex','director_opex','digital_opex')`
- `CREATE TYPE operating_pool_txn_type AS ENUM ('invoice_settled_in','payroll_out','transfer_out','transfer_in','adjustment')`
- `CREATE TABLE operating_pools (id UUID PK, pool_type operating_pool_type NOT NULL, transaction_type operating_pool_txn_type NOT NULL, amount DECIMAL(15,2) NOT NULL, reference_type TEXT, reference_id UUID, period_month DATE NOT NULL, description TEXT NOT NULL, created_by UUID NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`
- Index `(pool_type, created_at DESC)`, `(pool_type, period_month)`
- View `operating_pool_balance AS SELECT pool_type, SUM(CASE WHEN transaction_type IN ('invoice_settled_in','transfer_in','adjustment') THEN amount ELSE -amount END) AS balance FROM operating_pools GROUP BY pool_type`
- RLS: principal + finance SELECT; finance INSERT (system-level via trigger + manual adjustment); no UPDATE/DELETE

**Migration `20260101000130_invoice_pool_routing.sql`**
- `ALTER TABLE invoices ADD COLUMN routes_to_pool operating_pool_type` (NULL for Marketing — goes to dept_pools)
- Extend `generate_monthly_invoices` to SET `routes_to_pool`:
  - `hr_pool_split` billing mode → `routes_to_pool='hr_opex'`
  - `finance_attribution` + `finance_mgmt_fee` → `routes_to_pool='finance_opex'`
  - `director_opex` (new mode) → `routes_to_pool='director_opex'`
  - `digital_*` (future) → `routes_to_pool='digital_opex'`
  - `marketing_project` → NULL (still routes via dept_pools)

**Migration `20260101000131_director_opex_billing_mode.sql`**
- `ALTER TYPE billing_mode ADD VALUE 'director_opex'`
- Extend `generate_monthly_invoices` to handle `director_opex` mode: bill each company its share of director salary (per `director_payouts` × company share from `director_ctc`).

**Migration `20260101000132_invoice_payment_pool_credit_trigger.sql`**
- On `payment_vouchers` status-change-to-paid where `voucher_type='billing_payment'` and `reference_type='invoice'`:
  - Look up the invoice's `routes_to_pool`
  - If NOT NULL (so non-Marketing), insert into `operating_pools` with `transaction_type='invoice_settled_in'`, amount=voucher.amount
  - Marketing invoice → existing `dept_pools` logic (unchanged)

### Server Actions + UI

- Extend `/operating-fund/page.tsx` to add 4 new balance cards reading from `operating_pool_balance` view
- New route `/operating-fund/[pool_type]/page.tsx` — txn log for a single pool
- Finance can manually adjust via `/operating-fund/[pool_type]/adjust` with Principal approval (reuse existing approval pattern)

### Testing plan

**Integration**:
- Seed April 2026 HR pool invoices (3 companies × 3 dept = 9 invoices)
- Simulate payment on all 9 → `operating_pool_balance.hr_opex` = sum(invoice amounts)
- Simulate HR payroll approval (Spec 2 flow) — pool debits = payroll total (Spec 4 wires the actual debit; for Spec 3 test, pool stays credit-only)

**Invariant test**: after a full pool cycle, `operating_pools` sum matches the balance view.

### Risk callouts

- **Backward compatibility**: existing invoices created pre-Spec-3 have `routes_to_pool=NULL`. If a user pays one of those late, no pool row created. Backfill script: `UPDATE invoices SET routes_to_pool = ... WHERE id IN (SELECT id FROM invoices WHERE routes_to_pool IS NULL)` with billing-mode-based inference. Manual one-off.
- **Enum ADD VALUE**: cannot be done in the same tx as subsequent use. Must land migration 131 first, then code that references it.
- **Rollback**: drop `operating_pools`, drop `routes_to_pool` column, revert `generate_monthly_invoices`. Pool history lost — acceptable for rollback.

### Atomic commit plan

1. `feat(hr-payroll-3a): add operating_pools table + balance view` — mig 129 (~180 LOC)
2. `feat(hr-payroll-3b): add routes_to_pool column + update invoice generation` — mig 130 (~240 LOC)
3. `feat(hr-payroll-3c): add director_opex billing mode` — mig 131 (~260 LOC)
4. `feat(hr-payroll-3d): invoice-payment → pool credit trigger` — mig 132 + test (~180 LOC)
5. `feat(hr-payroll-3e): operating-fund UI extensions` — 4 new cards + txn pages (~380 LOC)

Total ~1,240 LOC / 5 commits.

---

## Spec 4 — Bank Transfer & Alliance Bank Pool

### BLOCKER-1 (must resolve before this spec)

`payment_voucher_sources` has a hard-coded `pvs_enforce_max_three()` trigger (migration 103). Spec 4's bank transfer voucher must debit HR Pool + Finance Pool + Director Pool + Marketing + possibly a 5th adjustment source = **5 sources**. Options:

- **Option A (recommended)**: drop the 3-row cap and replace with a `CHECK (amount > 0)` only. Plan follows this.
- **Option B**: batch two vouchers (splits the transfer across two records — messy audit).
- **Option C**: keep 3 — forces Finance to manually combine pools before transfer. Not acceptable per user requirement.

### Goal

Finance clicks "Transfer to Alliance" — enters one total RM amount and allocates it across HR / Finance / Director / Marketing / Digital pools (1-5 source pools). On Principal approve: debit each source pool, credit `alliance_bank_pool`. Spec 2's payroll-run-approve RPC now debits `alliance_bank_pool` (instead of `hv_operating_fund`). Pre-condition check: Alliance balance >= payroll total, else reject.

### Success criteria

1. Finance can create a `payroll_bank_transfer` voucher with 5 sources (HR + Finance + Director + Marketing + Digital).
2. Principal approves → 5 debit rows in `operating_pools` + 1 credit row in `alliance_bank_pool`.
3. Payroll run approval RPC now requires `alliance_bank_pool.balance >= payroll_runs.total_amount`, else raises `INSUFFICIENT_ALLIANCE_BALANCE`.
4. After payroll approval, alliance balance = previous + transfer_in − payroll_total.
5. `/alliance-pool` shows balance + full txn log.

### Data model changes

**Migration `20260101000133_alliance_bank_pool.sql`**
- `CREATE TABLE alliance_bank_pool (id UUID PK, transaction_type TEXT CHECK IN ('transfer_in','salary_payout_out','adjustment'), amount DECIMAL(15,2) NOT NULL, reference_type, reference_id UUID, description TEXT NOT NULL, period_month DATE, created_by UUID, created_at)`
- View `alliance_bank_pool_balance AS SELECT SUM(CASE WHEN transaction_type IN ('transfer_in','adjustment') THEN amount ELSE -amount END) AS balance FROM alliance_bank_pool`
- Index `(created_at DESC)`, `(period_month)`
- RLS: principal + finance SELECT + INSERT; no UPDATE/DELETE

**Migration `20260101000134_relax_pvs_max_rows.sql`** (BLOCKER-1 resolution)
- `DROP TRIGGER pvs_max_three_trigger ON payment_voucher_sources`
- `DROP FUNCTION pvs_enforce_max_three`
- Add helpful `CHECK` or leave unbounded (a voucher may reasonably have 1-10 sources)

**Migration `20260101000135_payroll_bank_transfer_voucher_type.sql`**
- `ALTER TYPE payment_voucher_type ADD VALUE 'payroll_bank_transfer'`
- Extend voucher approval RPC to handle new type: debit each source in `operating_pools`, credit `alliance_bank_pool` with matching amount

**Migration `20260101000136_payroll_run_alliance_source.sql`**
- Modify `approve_payroll_run` RPC (from Spec 2):
  - Pre-check: `SELECT balance FROM alliance_bank_pool_balance` ≥ `payroll_runs.total_amount`
  - If not, raise with message `'Alliance pool balance (RM X) is insufficient for payroll run (RM Y). Finance must transfer funds first.'`
  - Voucher sources pool now = `'alliance_bank_pool'` (not `'hv_operating_fund'`)
  - Each salary_payout voucher creation also inserts `alliance_bank_pool` debit row

### Server Actions + UI

- `src/app/(portal)/payments/new/page.tsx` — add `payroll_bank_transfer` option in voucher type dropdown
- `src/app/(portal)/payments/new/_components/BankTransferForm.tsx` — 5-source allocation form (sum must equal total)
- New route `/alliance-pool/page.tsx` — balance + txn log

### Testing plan

**Integration**:
- Seed operating_pools with 10k HR + 8k Finance + 5k Director + 3k Marketing + 2k Digital = 28k total
- Create payroll_bank_transfer voucher: 5 sources summing 28k → Principal approve
- Assert alliance balance = 28k, each source pool -= its allocation
- Create payroll run total 30k → approve should fail (balance 28k < 30k)
- Top up alliance via adjustment → approve now succeeds

### Risk callouts

- **Dropping the 3-row trigger**: if other code paths relied on it, they'll silently succeed with 4+ sources. Grep the codebase for references — only the one trigger file, no app-level check. Safe.
- **Enum `ADD VALUE` cannot be in same tx as use**: migration 135 first, then any migration that inserts rows with that type.
- **Backward compatibility**: vouchers currently have single source `source_pool` (deprecated migration 115). Spec 4 keeps writing only into `payment_voucher_sources` (multi-source).
- **Rollback**: `alliance_bank_pool` + new voucher type + enum value all addable/droppable. Re-enable the 3-row trigger on rollback — but if any 4+ row vouchers exist, trigger won't fire retroactively (OK — CHECK would).

### Atomic commit plan

1. `refactor(hr-payroll-4a): relax payment_voucher_sources max rows` — mig 134 + regression test (~80 LOC)
2. `feat(hr-payroll-4b): add alliance_bank_pool + balance view` — mig 133 (~150 LOC)
3. `feat(hr-payroll-4c): add payroll_bank_transfer voucher type` — mig 135 + voucher-approve RPC update (~260 LOC)
4. `feat(hr-payroll-4d): payroll-run debits alliance + balance check` — mig 136 (~180 LOC)
5. `feat(hr-payroll-4e): bank transfer form UI + /alliance-pool page` — new routes (~320 LOC)

Total ~990 LOC / 5 commits.

---

## Spec 5 — Payslip PDF + Bank Transfer File

### Goal

HR downloads one payslip PDF per employee or a ZIP of all. Finance downloads a bank-specific bulk payment file to upload to the bank portal.

### Decision needed up-front (flagged as Open Question)

- **PDF library**: `@react-pdf/renderer` (server-rendered, works in Next.js 15 App Router) — recommended
- **Bank format default**: ask user at Spec 5 kickoff — recommend **Hong Leong HL Connect CSV** since HV uses Hong Leong per CLAUDE.md context, though Alliance Bank is the actual payroll account (so maybe Alliance's format — **critical question for user**)

### Success criteria

1. `GET /hr-costing/payroll/2026-04-01/[staffId]/payslip.pdf` returns a PDF with the employee's monthly payroll details formatted in Malaysian standard layout.
2. `POST /hr-costing/payroll/2026-04-01/download-all` streams a ZIP of N payslips.
3. `GET /hr-costing/payroll/2026-04-01/bank-transfer.txt?format=maybank2e` returns fixed-width text matching Maybank2E schema.
4. `GET /hr-costing/payroll/2026-04-01/bank-transfer.csv?format=hl_connect` returns CSV for Hong Leong.
5. Bank file validation: re-upload to the bank portal in test account accepts the file.

### Data model changes

**Migration `20260101000137_payroll_payslip_cache.sql`**
- `CREATE TABLE payroll_payslips (id UUID PK, payroll_id UUID FK hr_monthly_payroll, generated_at TIMESTAMPTZ, generated_by UUID, storage_path TEXT)` — cache so PDFs aren't regenerated on every download
- Optional: store generated PDF in Supabase Storage for audit retention

**Settings extension**:
- Add `bank_transfer_format` config (maybank2e / hl_connect / rhb_reflex / pbb_eaf) in `treasury_config` or new `payroll_config`
- Principal-writable, Finance-readable

### Server Actions + file generators

New pure modules (all testable):
- `src/lib/payslip-pdf.ts` — React PDF renderer; exports `renderPayslipPdf(payroll, staff, company)` returning a stream
- `src/lib/bank-transfer/maybank2e.ts` — `generateMaybank2eFile(vouchers[]) → string` (fixed-width)
- `src/lib/bank-transfer/hl-connect.ts` — `generateHlConnectFile(vouchers[]) → string` (CSV)
- `src/lib/bank-transfer/rhb-reflex.ts` — CSV
- `src/lib/bank-transfer/pbb-eaf.ts` — fixed-width

Note: since CLAUDE.md forbids API routes, PDF/file downloads must be Server Actions or special route handlers. Next.js 15 does support `app/.../[...]/route.ts` — this is NOT the prohibited "API Route Handler for writes" (it's a GET, read-only). **Flag to user**: CLAUDE.md may need a one-line addendum allowing GET route handlers for file exports, since Server Actions can't stream binary responses cleanly.

### UI pages + components

- Download buttons on `/hr-costing/payroll/[period]` detail page:
  - "Download Payslip" per row (only if row status=paid)
  - "Download All Payslips (ZIP)" top-bar
  - "Download Bank Transfer File" top-bar — shows format from Settings

### Testing plan

**Unit** (Vitest):
- `src/lib/bank-transfer/maybank2e.test.ts` — given 3 vouchers, output matches expected fixed-width string (golden file)
- Same for hl_connect, rhb_reflex, pbb_eaf
- `src/lib/payslip-pdf.test.ts` — renders without error, PDF has expected text extractable via pdf-parse

**Manual**:
- Download sample file, upload to Hong Leong test portal → accepts

### Risk callouts

- **Bank format changes**: Malaysian banks change schemas periodically. Keep a version column in each generator.
- **PDF rendering in Edge runtime**: `@react-pdf/renderer` is Node-only. Ensure the route runs in Node runtime.
- **Payslip content locked**: once `hr_monthly_payroll.status='paid'`, payslip content must not change. Enforced by the row being read-only past paid.
- **Rollback**: drop table, remove UI buttons, remove routes. Bank format config can stay unset.

### Atomic commit plan

1. `chore(hr-payroll-5a): allow read-only route handlers for file exports` — CLAUDE.md update + convention note (~40 LOC)
2. `feat(hr-payroll-5b): payslip PDF generator` — `src/lib/payslip-pdf.ts` + unit test + sample rendering (~420 LOC)
3. `feat(hr-payroll-5c): Maybank2E bank file generator + golden test` — `src/lib/bank-transfer/maybank2e.ts` (~180 LOC)
4. `feat(hr-payroll-5d): HL Connect + RHB Reflex + PBB eAF generators + golden tests` — 3 modules (~380 LOC)
5. `feat(hr-payroll-5e): download routes + UI buttons + payslip cache` — mig 137 + routes + UI (~340 LOC)
6. `feat(hr-payroll-5f): Settings — select bank format` — new settings tab (~150 LOC)

Total ~1,510 LOC / 6 commits.

---

## Spec 6 — Statutory Compliance Files

### Goal

At month end, HR downloads one ZIP file containing: KWSP Form A (EPF contributions), PERKESO Borang 2/3 (SOCSO), PERKESO Borang 4 (EIS), LHDN CP39 (PCB). Each is in the exact format required by the government portal.

### Success criteria

1. `GET /hr-costing/payroll/2026-04-01/statutory.zip` returns ZIP with 4 files.
2. Upload EPF file to KWSP i-Akaun test portal → accepts.
3. Upload SOCSO file to PERKESO ASSIST test portal → accepts.
4. Upload PCB file to LHDN MyTax test portal → accepts.
5. Files match the period's `hr_monthly_payroll` + `director_payouts` payments exactly.

### Data model changes

Minimal — add NRIC field (needed for all 4 statutory files):

**Migration `20260101000138_add_nric.sql`**
- `ALTER TABLE hr_staff_costs ADD COLUMN nric TEXT`
- `ALTER TABLE directors ADD COLUMN nric TEXT`
- RLS unchanged (same sensitivity as salary)

### Server Actions + file generators

- `src/lib/statutory/kwsp-form-a.ts` — fixed-width format per KWSP schema
- `src/lib/statutory/perkeso-borang-2.ts` — SOCSO contribution file
- `src/lib/statutory/perkeso-borang-4.ts` — EIS contribution file
- `src/lib/statutory/lhdn-cp39.ts` — PCB submission
- Combine into ZIP at `app/(portal)/hr-costing/payroll/[period]/statutory.zip/route.ts`

### Testing plan

**Unit**: golden files for each schema. The schemas are published by the government agencies — start from public i-Akaun/ASSIST/MyTax sample templates.

**Manual**: test portal upload validation.

### Risk callouts

- **Schema drift**: government schemas change yearly. Version each generator; add a `schema_version` setting in Settings.
- **Director contributions**: directors also pay EPF/SOCSO/EIS — files must include them. The plan reads from `hr_monthly_payroll` (staff) UNION `director_payouts` (directors).
- **PDPA**: files contain NRIC numbers. `hr_staff_costs` doesn't have NRIC today — added in 138.

### Atomic commit plan

1. `feat(hr-payroll-6a): add nric column to staff + directors` — migration 138 (~80 LOC)
2. `feat(hr-payroll-6b): KWSP Form A generator` — `src/lib/statutory/kwsp-form-a.ts` + golden test (~220 LOC)
3. `feat(hr-payroll-6c): PERKESO Borang 2/3 + EIS Borang 4 generators` — 2 modules + golden tests (~320 LOC)
4. `feat(hr-payroll-6d): LHDN CP39 generator` — 1 module + golden test (~180 LOC)
5. `feat(hr-payroll-6e): ZIP route + UI download button` — route handler + button (~120 LOC)

Total ~920 LOC / 5 commits.

---

## Cross-cutting concerns

### Pool balance invariants (Spec 3+4 regression tests)

For every pool (`hr_opex`, `finance_opex`, `director_opex`, `digital_opex`, `alliance_bank_pool`, existing `hv_operating_fund`, `dept_pools`), add a Vitest integration test that asserts:

`SELECT SUM(signed_amount) FROM pool_source GROUP BY pool` == `pool_balance_view`

Run after every spec ship. Breaks CI on divergence.

### Period lock interactions

`src/lib/period-lock.ts` (`assertPeriodOpen`) must be called from:
- `submitToPrincipal` Server Action (Spec 2) — block submitting a run for a locked period
- `approvePayrollRun` Server Action (Spec 2) — block approving a run for a locked period
- `updatePayrollRow` Server Action (Spec 1) — block editing rows in locked period
- Bank transfer file generator (Spec 5) — allow even for locked periods (read-only)

Closing a period via existing period-closing flow (migration 54) should assert that all `payroll_runs` for that period are `status='paid'` or `rejected` — no `submitted` hanging.

### RLS matrix (all new tables, full cycle)

| Table | principal | finance | hr | dept_manager |
|---|---|---|---|---|
| `hr_staff_costs` (existing + new columns) | R/W | DENY | R/W | DENY |
| `hr_staff_salary_history` | R | DENY | R | DENY |
| `hr_monthly_payroll` | R/W (all states) | DENY | R/W (draft+submit), R (paid) | DENY |
| `hr_monthly_payroll_summary` view | R | R | R | DENY |
| `commission_rules` | R/W | DENY | R/W | DENY |
| `commission_inputs` | R | DENY | R/W | DENY |
| `hr_import_templates` | R/W | DENY | R/W (own + shared) | DENY |
| `payroll_runs` | R/W | R | R/W (submit/own) | DENY |
| `operating_pools` | R/Adjust | R/Adjust | DENY | DENY |
| `operating_pool_balance` view | R | R | DENY | DENY |
| `alliance_bank_pool` | R | R/W | DENY | DENY |
| `alliance_bank_pool_balance` view | R | R | DENY | DENY |
| `payroll_payslips` | R | DENY | R | DENY |

### Performance: indexes for `hr_monthly_payroll`

```sql
CREATE INDEX idx_hmp_period_status ON hr_monthly_payroll(period_month, status);
CREATE INDEX idx_hmp_staff_period ON hr_monthly_payroll(staff_id, period_month);
CREATE INDEX idx_hmp_status_period_submitted ON hr_monthly_payroll(period_month) WHERE status='submitted';
```

Partial index on submitted status is the fastest path for "ready to approve" checks in Spec 2.

### i18n / bilingual pattern

Follow director-salary page precedent: English primary label + `<em className="font-serif italic text-graphite">zh-CN description</em>` subtitle. Money always `font-mono tabular`. Status badges use existing `text-success` / `text-warning` / `text-danger` / `text-graphite` (muted).

No new library. No dictionary file. Strings inline.

---

## Open questions (for user review before Spec 1)

1. **Pro-rata basis**: calendar days or working days? (Plan defaults to calendar days — matches InfoTech HRMS.)
2. **Commission rules seed**: what are the initial rules for Telemarketer, MK, and other commission-eligible staff? Plan assumes creation via UI post-Spec-1.
3. **Finance drill-down**: brief says "Principal can see individual salaries; Finance cannot". Confirm: is this true even for Marketing/HR/Finance staff, not just Director? (RLS matrix assumes yes — Finance sees aggregates only, even for their own dept.)
4. **Bank format for Spec 5**: Alliance Bank format (since that's the payroll account) or Hong Leong (since it's the main bank)? Recommend Alliance + HL as Phase 1.
5. **Read-only route handlers allowed?**: CLAUDE.md says "Server Actions, not API Route Handlers". Spec 5+6 need GET route handlers for file downloads (which are read-only by nature). Propose one-line CLAUDE.md addendum.
6. **`dept_pools` vs `operating_pools`**: recommendation is separate tables (see Spec 3 decision section). Confirm.
7. **3-row cap removal in Spec 4**: confirm it's OK to drop the `pvs_enforce_max_three` trigger entirely. Alternative is raising to 10.
8. **NRIC for Spec 6**: need to add NRIC to `hr_staff_costs` + `directors`. Plan adds in 138. Confirm you have NRICs to backfill.
9. **Unpaid leave / leave import**: mentioned as `unpaid_leave_days` column in Spec 1 but no import UI. Defer leave import to v2? (Plan defers.)
10. **Commission clawback**: confirmed NO by user. Plan reflects this.
11. **Payslip delivery**: downloadable PDF only in Spec 5, or also email to employee? (Plan: downloadable only — email is v2.)

---

## Rollout plan

### Per-spec cutover checklist (applies to each Spec 1 through 6)

1. `npm run test:ci` green on feature branch
2. `npm run build` green
3. Apply migrations locally via `supabase db reset` + `supabase db push --dry-run`
4. Deploy to staging Vercel preview URL
5. Run integration test against staging DB
6. Dry-run: HR user does one complete flow for the spec (e.g. enter payroll for 1 employee, submit, approve)
7. Monitor staging logs for 24h
8. Merge to `main` → production deploy
9. Smoke-test production with `scripts/seed-hr-staff.mjs` against a test period (2020-01 to avoid polluting real periods)

### Feature flag strategy

- New routes (`/hr-costing/payroll/*`, `/approvals/payroll-run/*`, `/alliance-pool`, `/operating-fund/[pool_type]`) are hidden from sidebar (`src/components/layout/Sidebar.tsx`) until spec ships via `canAccess*` role checks in `src/lib/roles.ts`
- Per-spec flag: add boolean like `SHOW_HR_PAYROLL_V2 = true` in `src/lib/features.ts` and gate sidebar link. Simpler than env-based flags for a 1-user app.

### User training doc (after each spec)

Draft one-pager per spec in `docs/user-guides/`:
- `hr-payroll-1-enter-monthly-data.md` — "How to enter April payroll"
- `hr-payroll-2-approve-run.md` — "Principal: how to review + approve payroll"
- `hr-payroll-3-pools.md` — "Finance: how dept pools receive their cash"
- `hr-payroll-4-bank-transfer.md` — "Finance: weekly/monthly transfer to Alliance"
- `hr-payroll-5-payslips.md` — "HR: how to download payslips + bank file"
- `hr-payroll-6-statutory.md` — "HR: how to submit KWSP/SOCSO/EIS/LHDN files"

---

## Key decisions needing user confirmation before Spec 1 kickoff

1. Pro-rata basis: calendar days (recommended) or working days?
2. Finance drill-down: only Director, or also Marketing/HR/Finance staff? (Plan assumes aggregates only, per access-matrix.md — confirm.)
3. Are NRICs available to backfill for all staff and directors before Spec 6?
4. OK to drop the 3-row cap on `payment_voucher_sources` in Spec 4?
5. OK to add a read-only GET route handler exception to CLAUDE.md for file downloads in Specs 5 and 6?
6. Confirm: separate `operating_pools` table (not extending `dept_pools`)?

## Open questions deferred to spec kickoff (not blocking)

1. Which bank format is default for Spec 5 — Alliance, Hong Leong, or both?
2. What are initial commission rules for Telemarketer, MK, other commission-eligible staff?
3. "Finance cannot see individual salaries" — confirm scope: only blocking drill-down, or also blocking dept-total breakdowns?
4. Payslip emailing to employees — v1 download-only (recommended) or include email?
5. Unpaid leave / leave import — defer to v2 (recommended)?
