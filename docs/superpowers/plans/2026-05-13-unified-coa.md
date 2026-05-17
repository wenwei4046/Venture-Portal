# Unified Chart of Accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-table COA (`chart_of_accounts` + `payment_categories`) with a single source-of-truth chart_of_accounts, expanded to eight types with auto-generated codes in user-defined number ranges, plus restructure P&L (Gross Profit + Other Income), Balance Sheet (Fixed Asset section), and Cash Flow (Operating/Investing/Financing sections).

**Architecture:** Big-bang migration. Postgres enum extension + new `cash_flow_category` enum + range-enforcement trigger + `next_account_code()` RPC. Drop `payment_categories`, rename `payment_voucher_sources.category_code → account_code` with FK to `chart_of_accounts(code)`. Wipe + reseed COA with 28 system accounts. Sweep TS code references. Rewrite report rendering to follow standard accounting structure.

**Tech Stack:** Postgres (Supabase), TypeScript strict, Next.js 15 App Router (Server Components by default), Server Actions guarded by `requireRole`, Tailwind v3 (DESIGN.md v3.0), Vitest + happy-dom.

**Reference spec:** `docs/superpowers/specs/2026-05-13-unified-coa-design.md`

**Constraints (from CLAUDE.md):** TypeScript strict, no `any`; Server Components default; writes via Server Actions with `requireRole`; money is `decimal(15,2)` displayed via `formatMoney`; dates via `dayjs`; no hex outside `globals.css`; UI follows `.page-head` / `.ledger-table` / `.sect-head` / `.num`; every fix ships a regression test; pure logic in `src/lib/*.ts` so it's unit-testable. **Do NOT `git push`** (user directive). Local commits only via `git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046"`.

**Pre-requisites:**
- The previous batch's migrations 234/235/236 are **not yet applied** at the time this plan runs (the user deferred them). This plan supersedes them — the new migration in Task 3 includes the same NOT-NULL guarantees plus the rest of the redesign, so 234/235/236 should NOT be applied.
- User must run `node --env-file=.env.local scripts/wipe-all-business-data.mjs --confirm` BEFORE applying Task 3's migration (deletes the few remaining test transactions). The plan flags this in Task 3.

**Run tests:** `npm run test:ci` (full) / `npx vitest run <path>` (single file). Build: `npm run build`.

---

## File Structure

| File | Responsibility | New / Modify |
|---|---|---|
| `src/lib/coa.ts` | Pure TS: `AccountType` union, `CashFlowCategory` union, range constants, `defaultCashFlowCategoryFor`, `typeLabel`, `rangeFor` | Create |
| `src/lib/coa.test.ts` | Tests for the above | Create |
| `supabase/migrations/20260101000237_coa_schema_extensions.sql` | Additive: extend `account_type` enum, create `cash_flow_category` enum, add column to chart_of_accounts (nullable), create `next_account_code` RPC, range-enforcement trigger | Create |
| `supabase/migrations/20260101000238_unified_coa_bigbang.sql` | Drop `payment_categories`, rename `payment_voucher_sources.category_code → account_code`, add FK, wipe + seed `chart_of_accounts`, update `bank_accounts.gl_account_code`, set `cash_flow_category` NOT NULL | Create |
| `src/app/(portal)/settings/actions.ts` | Replace `createPaymentCategory` / `updatePaymentCategory` with `createAccount` / `updateAccount`; the latter only edits name/cash_flow_category/is_active/sort_order — never code or type | Modify |
| `src/app/(portal)/settings/_components/CategoriesSection.tsx` | Delete | Delete |
| `src/app/(portal)/settings/_components/AccountsSection.tsx` | New: type select + name input + read-only code preview + cash_flow_category select; list grouped by type | Create |
| `src/app/(portal)/settings/page.tsx` | Swap CategoriesSection → AccountsSection | Modify |
| `src/app/(portal)/payments/actions.ts` | `category_code` → `account_code` in createVoucher / updateVoucher; new validation against `chart_of_accounts.is_active` | Modify |
| `src/app/(portal)/payments/_components/NewPaymentForm.tsx` | Category dropdown → Account dropdown sourced from chart_of_accounts grouped by type | Modify |
| `src/lib/voucher-paid-helpers.ts` | Reads `payment_voucher_sources.account_code` to look up gl_account_code from chart_of_accounts | Modify |
| `src/app/(portal)/fund-out/actions.ts` | `disbursement_category_code` → `disbursement_account_code`; validate against new BS types (`asset`/`fixed_asset`/`liability`/`equity`) | Modify |
| `src/lib/loan-disbursement.ts` | `bsCategoriesForDisbursement` → `bsAccountsForDisbursement`; type check uses new enum values | Modify |
| `src/app/(portal)/billing/actions.ts` | `invoice.category_code` → `invoice.account_code` (if referenced) | Modify |
| `src/lib/cfo-reports.ts` | Read `account_code`; join `chart_of_accounts` for `name`, `account_type`, `cash_flow_category`; new shapes for Income Statement (Gross Profit + Other Income) and Cash Flow (Op/Inv/Fin sections); Balance Sheet groups by COA type | Modify (substantial) |
| `src/lib/cfo-reports.test.ts` | New test cases for Gross Profit, Other Income routing, CFS Op/Inv/Fin classification | Modify |
| `src/app/(portal)/reports/income-statement/page.tsx` | Render: Revenue − Cost = Gross Profit, + Other Income − Expense = Net Profit. Per-pool blocks updated. | Modify |
| `src/app/(portal)/reports/cash-flow/page.tsx` | Render: A. Operating / B. Investing / C. Financing with per-pool drill | Modify (substantial) |
| `src/app/(portal)/reports/balance-sheet/page.tsx` | Add Fixed Assets section; group named lines by COA type (using `coa.ts` constants) | Modify |
| `src/types/index.ts` | New types if any are surfaced (mostly internal to cfo-reports) | Modify (small) |

---

## Task 1: Pure TS helpers in `src/lib/coa.ts`

**Files:**
- Create: `src/lib/coa.ts`
- Create: `src/lib/coa.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/coa.test.ts
import { describe, it, expect } from 'vitest'
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  rangeFor,
  defaultCashFlowCategoryFor,
  typeLabel,
} from './coa'

describe('coa', () => {
  it('lists 8 account types in canonical order', () => {
    expect(ACCOUNT_TYPES).toEqual([
      'equity', 'fixed_asset', 'asset', 'liability',
      'revenue', 'cost', 'other_income', 'expense',
    ])
  })

  it('lists 3 cash flow categories', () => {
    expect(CASH_FLOW_CATEGORIES).toEqual(['operating', 'investing', 'financing'])
  })

  it('rangeFor returns [start, end] for each type', () => {
    expect(rangeFor('equity')).toEqual([1000, 1999])
    expect(rangeFor('fixed_asset')).toEqual([2000, 2999])
    expect(rangeFor('asset')).toEqual([3000, 3999])
    expect(rangeFor('liability')).toEqual([4000, 4999])
    expect(rangeFor('revenue')).toEqual([5000, 5999])
    expect(rangeFor('cost')).toEqual([6000, 6999])
    expect(rangeFor('other_income')).toEqual([7000, 7999])
    expect(rangeFor('expense')).toEqual([9000, 9999])
  })

  it('defaultCashFlowCategoryFor maps type → default category', () => {
    expect(defaultCashFlowCategoryFor('equity')).toBe('financing')
    expect(defaultCashFlowCategoryFor('liability')).toBe('financing')
    expect(defaultCashFlowCategoryFor('fixed_asset')).toBe('investing')
    expect(defaultCashFlowCategoryFor('asset')).toBe('operating')
    expect(defaultCashFlowCategoryFor('revenue')).toBe('operating')
    expect(defaultCashFlowCategoryFor('cost')).toBe('operating')
    expect(defaultCashFlowCategoryFor('other_income')).toBe('operating')
    expect(defaultCashFlowCategoryFor('expense')).toBe('operating')
  })

  it('typeLabel returns human-readable labels', () => {
    expect(typeLabel('fixed_asset')).toBe('Fixed Asset')
    expect(typeLabel('other_income')).toBe('Other Income')
    expect(typeLabel('expense')).toBe('Expense')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/coa.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/coa.ts`**

```ts
// src/lib/coa.ts
// Single source of truth for Chart-of-Accounts types and ranges. Maps the
// Postgres `account_type` enum to display labels, number ranges (used by
// next_account_code RPC and a DB trigger), and a default cash_flow_category
// for each type. Reports + Settings UI both import from here.

export const ACCOUNT_TYPES = [
  'equity', 'fixed_asset', 'asset', 'liability',
  'revenue', 'cost', 'other_income', 'expense',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CASH_FLOW_CATEGORIES = ['operating', 'investing', 'financing'] as const
export type CashFlowCategory = (typeof CASH_FLOW_CATEGORIES)[number]

// Each type owns a 1000-code range. 8000-8999 is reserved (gap).
const RANGES: Record<AccountType, readonly [number, number]> = {
  equity:        [1000, 1999],
  fixed_asset:   [2000, 2999],
  asset:         [3000, 3999],
  liability:     [4000, 4999],
  revenue:       [5000, 5999],
  cost:          [6000, 6999],
  other_income:  [7000, 7999],
  expense:       [9000, 9999],
}
export function rangeFor(type: AccountType): readonly [number, number] {
  return RANGES[type]
}

const DEFAULT_CFC: Record<AccountType, CashFlowCategory> = {
  equity:       'financing',
  fixed_asset:  'investing',
  asset:        'operating',
  liability:    'financing',
  revenue:      'operating',
  cost:         'operating',
  other_income: 'operating',
  expense:      'operating',
}
export function defaultCashFlowCategoryFor(type: AccountType): CashFlowCategory {
  return DEFAULT_CFC[type]
}

const LABELS: Record<AccountType, string> = {
  equity:       'Equity',
  fixed_asset:  'Fixed Asset',
  asset:        'Asset',
  liability:    'Liability',
  revenue:      'Revenue',
  cost:         'Cost',
  other_income: 'Other Income',
  expense:      'Expense',
}
export function typeLabel(type: AccountType): string {
  return LABELS[type]
}
```

- [ ] **Step 4: Run test, confirm PASS**

Run: `npx vitest run src/lib/coa.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```
git add src/lib/coa.ts src/lib/coa.test.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat: pure TS chart-of-accounts taxonomy module"
```

---

## Task 2: Schema additions migration (additive — non-breaking)

**Files:**
- Create: `supabase/migrations/20260101000237_coa_schema_extensions.sql`

This migration is additive only — it can land on a live system without breaking anything. The breaking changes (drop payment_categories, rename column) come in Task 3.

- [ ] **Step 1: Write the migration**

```sql
-- 20260101000237_coa_schema_extensions.sql
-- Additive prep for the unified COA. Extends the existing account_type enum,
-- introduces cash_flow_category, adds a nullable column on chart_of_accounts,
-- and creates the next_account_code RPC + range-enforcement trigger. Nothing
-- here breaks the existing payment_categories table — that drops in mig 238.

BEGIN;

-- (1) Extend account_type enum. Postgres requires each ADD VALUE in its own
--     statement and outside a transaction in some versions; we run them in
--     separate ALTER TYPE calls. IF NOT EXISTS keeps re-runs idempotent.
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'fixed_asset';
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'cost';
ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'other_income';

-- (2) cash_flow_category enum (Operating / Investing / Financing — IFRS-style).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cash_flow_category') THEN
    CREATE TYPE cash_flow_category AS ENUM ('operating', 'investing', 'financing');
  END IF;
END $$;

-- (3) Add column to chart_of_accounts. Nullable until Task 3 backfills the
--     seed rows and flips NOT NULL.
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS cash_flow_category cash_flow_category;

COMMENT ON COLUMN chart_of_accounts.cash_flow_category IS
  'Determines which section (Operating / Investing / Financing) a cash movement '
  'on this account lands in on the Cash Flow Statement. Default derived from '
  'account.type at insert time but overridable per-account in Settings → Accounts.';

-- (4) next_account_code(type) — returns the next free code in the type''s range.
CREATE OR REPLACE FUNCTION next_account_code(p_type account_type)
RETURNS VARCHAR(10) LANGUAGE plpgsql AS $$
DECLARE
  v_start INT; v_end INT; v_max INT;
BEGIN
  CASE p_type
    WHEN 'equity'        THEN v_start := 1000; v_end := 1999;
    WHEN 'fixed_asset'   THEN v_start := 2000; v_end := 2999;
    WHEN 'asset'         THEN v_start := 3000; v_end := 3999;
    WHEN 'liability'     THEN v_start := 4000; v_end := 4999;
    WHEN 'revenue'       THEN v_start := 5000; v_end := 5999;
    WHEN 'cost'          THEN v_start := 6000; v_end := 6999;
    WHEN 'other_income'  THEN v_start := 7000; v_end := 7999;
    WHEN 'expense'       THEN v_start := 9000; v_end := 9999;
    ELSE
      RAISE EXCEPTION 'next_account_code: unknown account_type %', p_type;
  END CASE;

  SELECT COALESCE(MAX(code::INT), v_start - 1) INTO v_max
  FROM chart_of_accounts
  WHERE code ~ '^[0-9]+$' AND code::INT BETWEEN v_start AND v_end;

  IF v_max + 1 > v_end THEN
    RAISE EXCEPTION '%s range exhausted (>% codes used)', p_type, v_end - v_start;
  END IF;
  RETURN (v_max + 1)::TEXT;
END $$;

GRANT EXECUTE ON FUNCTION next_account_code(account_type) TO authenticated;

-- (5) Range-enforcement trigger: any INSERT or UPDATE of code must fall
--     within the type's range. Applies to all existing rows on UPDATE; if
--     mig 238's reseed renumbers everything, those INSERTs satisfy the rule.
CREATE OR REPLACE FUNCTION coa_enforce_code_range()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_start INT; v_end INT; v_code_int INT;
BEGIN
  IF NEW.code !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'chart_of_accounts.code must be numeric, got "%"', NEW.code;
  END IF;
  v_code_int := NEW.code::INT;
  CASE NEW.type
    WHEN 'equity'        THEN v_start := 1000; v_end := 1999;
    WHEN 'fixed_asset'   THEN v_start := 2000; v_end := 2999;
    WHEN 'asset'         THEN v_start := 3000; v_end := 3999;
    WHEN 'liability'     THEN v_start := 4000; v_end := 4999;
    WHEN 'revenue'       THEN v_start := 5000; v_end := 5999;
    WHEN 'cost'          THEN v_start := 6000; v_end := 6999;
    WHEN 'other_income'  THEN v_start := 7000; v_end := 7999;
    WHEN 'expense'       THEN v_start := 9000; v_end := 9999;
    ELSE RAISE EXCEPTION 'coa_enforce_code_range: unknown type %', NEW.type;
  END CASE;
  IF v_code_int < v_start OR v_code_int > v_end THEN
    RAISE EXCEPTION 'chart_of_accounts.code % is outside %-% range for type %',
      NEW.code, v_start, v_end, NEW.type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coa_enforce_code_range_trigger ON chart_of_accounts;
CREATE TRIGGER coa_enforce_code_range_trigger
  BEFORE INSERT OR UPDATE ON chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION coa_enforce_code_range();

COMMIT;
```

- [ ] **Step 2: Commit the migration file (do NOT apply it yet — user applies when ready)**

```
git add supabase/migrations/20260101000237_coa_schema_extensions.sql
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(migration): COA schema extensions — new types, cash_flow_category, next_account_code RPC, range trigger"
```

> **NOTE for executor:** The existing range trigger from this migration will REJECT every current row in chart_of_accounts (their codes don't fall in the new ranges). That's fine for `INSERT` but the trigger fires on `UPDATE` too, so editing any existing row after this migration applies (but before mig 238 wipes and reseeds) would fail. Mitigation: keep both migrations queued together — apply both back-to-back.

---

## Task 3: Big-bang migration — drop, rename, reseed, retarget

**Files:**
- Create: `supabase/migrations/20260101000238_unified_coa_bigbang.sql`

This migration is DESTRUCTIVE. Pre-requisites the user must run BEFORE applying:
1. `node --env-file=.env.local scripts/wipe-all-business-data.mjs --confirm` (clears transactional data — fund_sources, loans, vouchers, journals, invoices, etc.).
2. Confirm `journal_lines`, `payment_voucher_sources`, `bank_accounts` (rows kept but `current_balance = 0`) are in the expected state.

- [ ] **Step 1: Write the migration**

```sql
-- 20260101000238_unified_coa_bigbang.sql
-- Big-bang switch to the unified Chart of Accounts.
--
-- Pre-requisites (must hold BEFORE running this migration):
--   - wipe-all-business-data.mjs --confirm has been run.
--     -> payment_voucher_sources, journal_lines, journal_entries are empty.
--     -> bank_accounts rows still exist with current_balance = 0.
--   - mig 234 / 235 / 236 from the previous batch are NOT applied (this
--     migration supersedes them — they're skipped).
--
-- What this migration does:
--   (1) Drop payment_categories (CASCADE removes the FK from
--       payment_voucher_sources.category_code).
--   (2) Rename payment_voucher_sources.category_code → account_code; add NOT
--       NULL + FK to chart_of_accounts(code).
--   (3) Temporarily unhook bank_accounts.gl_account_code (set NULL) so the
--       wipe of chart_of_accounts doesn't trip any FK.
--   (4) DELETE every existing chart_of_accounts row.
--   (5) INSERT the 28 seed rows under the new number scheme + cash_flow_category.
--   (6) Re-point bank_accounts.gl_account_code at the new codes.
--   (7) Flip chart_of_accounts.cash_flow_category NOT NULL.

BEGIN;

-- ── 0. Safety check: pre-req tables are empty ──────────────────────────────
DO $$
DECLARE
  v_pvs_count INT;
  v_lines_count INT;
BEGIN
  SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources;
  SELECT COUNT(*) INTO v_lines_count FROM journal_lines;
  IF v_pvs_count > 0 OR v_lines_count > 0 THEN
    RAISE EXCEPTION
      'unified COA migration requires payment_voucher_sources and journal_lines to be empty (run wipe-all-business-data.mjs --confirm first). Found % pvs rows, % line rows',
      v_pvs_count, v_lines_count;
  END IF;
END $$;

-- ── 1. Drop payment_categories (CASCADE clears the FK from PVS) ────────────
DROP TABLE IF EXISTS payment_categories CASCADE;

-- ── 2. Rename PVS.category_code → account_code; FK to chart_of_accounts ────
ALTER TABLE payment_voucher_sources
  RENAME COLUMN category_code TO account_code;

-- The column was set NOT NULL by mig 235 if that batch was applied; if not,
-- set it here. The CASCADE in step 1 dropped any old FK; we add the new one.
ALTER TABLE payment_voucher_sources
  ALTER COLUMN account_code SET NOT NULL;

ALTER TABLE payment_voucher_sources
  ADD CONSTRAINT pvs_account_code_fk
  FOREIGN KEY (account_code) REFERENCES chart_of_accounts(code);

-- ── 3. Temporarily null bank_accounts.gl_account_code to let us wipe COA ───
UPDATE bank_accounts SET gl_account_code = NULL;

-- ── 4. Wipe chart_of_accounts ──────────────────────────────────────────────
DELETE FROM chart_of_accounts;

-- ── 5. Seed 28 system accounts (code / name / type / cash_flow_category) ───
INSERT INTO chart_of_accounts (code, name, type, cash_flow_category, is_active, sort_order) VALUES
  -- Equity (1000-1999)
  ('1000', 'Equity & Internal Funds',       'equity',       'financing', true, 10),
  ('1010', 'HV Operating Fund',             'equity',       'financing', true, 20),
  ('1020', 'Director Saving Fund',          'equity',       'financing', true, 30),
  ('1030', 'Dept Pool — Marketing',         'equity',       'financing', true, 40),
  ('1040', 'Dept Pool — Finance',           'equity',       'financing', true, 50),
  ('1050', 'Dept Pool — HR',                'equity',       'financing', true, 60),
  ('1060', 'Dept Pool — Director Office',   'equity',       'financing', true, 70),
  ('1070', 'Dept Pool — Director',          'equity',       'financing', true, 80),
  ('1080', 'Invoice Payout Pool',           'equity',       'financing', true, 90),
  -- Fixed Asset (2000-2999)
  ('2000', 'Equipment / Computer',          'fixed_asset',  'investing', true, 10),
  -- Asset (3000-3999)
  ('3000', 'Cash & Bank — Hong Leong',      'asset',        'operating', true, 10),
  ('3010', 'Cash & Bank — Alliance (HR)',   'asset',        'operating', true, 20),
  ('3020', 'Loans Receivable',              'asset',        'investing', true, 30),  -- override: lending = investing
  ('3030', 'Accounts Receivable — Subs',    'asset',        'operating', true, 40),
  ('3040', 'Interest Receivable',           'asset',        'operating', true, 50),
  ('3050', 'Director Advance',              'asset',        'operating', true, 60),
  -- Liability (4000-4999)
  ('4000', 'Fund Sources Payable',          'liability',    'financing', true, 10),
  ('4010', 'Interest Payable — Fund Sources','liability',   'operating', true, 20),  -- override: interest is operating
  ('4020', 'Salary Payable (75% Payroll)',  'liability',    'operating', true, 30),
  ('4030', 'Statutory Payable',             'liability',    'operating', true, 40),
  ('4040', 'Director Invoice Payable (25%)','liability',    'operating', true, 50),
  ('4050', 'Accounts Payable — General',    'liability',    'operating', true, 60),
  -- Revenue (5000-5999)
  ('5000', 'Service Revenue — Subs',        'revenue',      'operating', true, 10),
  -- Other Income (7000-7999)
  ('7000', 'Interest Income — Loans',       'other_income', 'operating', true, 10),
  ('7010', 'Penalty Income',                'other_income', 'operating', true, 20),
  -- Expense (9000-9999)
  ('9000', 'General & Admin Expenses',      'expense',      'operating', true, 10),
  ('9010', 'Interest Expense — Fund Sources','expense',     'operating', true, 20),
  ('9020', 'Marketing Expense',             'expense',      'operating', true, 30),
  ('9030', 'Salary Expense',                'expense',      'operating', true, 40),
  ('9040', 'Statutory Employer Contribution','expense',     'operating', true, 50);

-- ── 6. Re-point bank_accounts at the new codes ─────────────────────────────
UPDATE bank_accounts SET gl_account_code = '3000' WHERE bank_name ILIKE 'Hong Leong%';
UPDATE bank_accounts SET gl_account_code = '3010' WHERE bank_name ILIKE 'Alliance%';

-- Optional safety: any active bank account that didn't match falls back to 3000.
UPDATE bank_accounts SET gl_account_code = '3000'
  WHERE gl_account_code IS NULL AND status = 'active';

-- ── 7. Flip cash_flow_category NOT NULL (all 28 seed rows have a value) ────
ALTER TABLE chart_of_accounts
  ALTER COLUMN cash_flow_category SET NOT NULL;

COMMIT;
```

- [ ] **Step 2: Commit the migration file**

```
git add supabase/migrations/20260101000238_unified_coa_bigbang.sql
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(migration): big-bang unified COA — drop payment_categories, reseed 28 accounts"
```

> **DO NOT apply these migrations yet.** Tasks 4-9 must land first (TS code referencing the new shape) before applying to the DB, otherwise the app won't compile. Migrations are applied by the user at the end.

---

## Task 4: Settings actions + AccountsSection UI

**Files:**
- Modify: `src/app/(portal)/settings/actions.ts`
- Delete: `src/app/(portal)/settings/_components/CategoriesSection.tsx`
- Create: `src/app/(portal)/settings/_components/AccountsSection.tsx`
- Modify: `src/app/(portal)/settings/page.tsx`

- [ ] **Step 1: Add `createAccount` and `updateAccount` actions**

In `src/app/(portal)/settings/actions.ts`, replace `createPaymentCategory` / `updatePaymentCategory` with these two Server Actions. The old names + helper `VALID_ACCOUNT_TYPES` are removed (grep to confirm no other call sites).

```ts
// Replace the existing createPaymentCategory / updatePaymentCategory block.
import { ACCOUNT_TYPES, CASH_FLOW_CATEGORIES, defaultCashFlowCategoryFor, type AccountType, type CashFlowCategory } from '@/lib/coa'

export async function createAccount(formData: FormData) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const type = (formData.get('type') as string)?.trim() as AccountType
  const name = (formData.get('name') as string)?.trim()
  const rawCfc = (formData.get('cash_flow_category') as string)?.trim()
  const cashFlowCategory = (rawCfc as CashFlowCategory) || defaultCashFlowCategoryFor(type)

  if (!type || !ACCOUNT_TYPES.includes(type)) {
    throw new Error('Invalid account type')
  }
  if (!name) throw new Error('Account name is required')
  if (!CASH_FLOW_CATEGORIES.includes(cashFlowCategory)) {
    throw new Error('Invalid cash flow category')
  }

  // Get next code from the DB RPC (atomic within the request)
  const { data: code, error: rpcErr } = await supabase.rpc('next_account_code', { p_type: type })
  if (rpcErr || !code) throw new Error(`Failed to generate code: ${rpcErr?.message ?? 'unknown'}`)

  const { error } = await supabase
    .from('chart_of_accounts')
    .insert({ code, name, type, cash_flow_category: cashFlowCategory })
  if (error) throw new Error(`Failed to create account: ${error.message}`)

  revalidatePath('/settings')
}

export async function updateAccount(formData: FormData) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const code = (formData.get('code') as string)?.trim()
  const name = (formData.get('name') as string)?.trim()
  const rawCfc = (formData.get('cash_flow_category') as string)?.trim()
  const isActive = formData.get('is_active') === 'on' || formData.get('is_active') === 'true'

  if (!code) throw new Error('Account code is required')
  if (!name) throw new Error('Account name is required')

  const updates: Record<string, unknown> = { name, is_active: isActive }
  if (rawCfc && CASH_FLOW_CATEGORIES.includes(rawCfc as CashFlowCategory)) {
    updates.cash_flow_category = rawCfc
  }

  const { error } = await supabase
    .from('chart_of_accounts')
    .update(updates)
    .eq('code', code)
  if (error) throw new Error(`Failed to update account: ${error.message}`)

  revalidatePath('/settings')
}
```

- [ ] **Step 2: Write `AccountsSection.tsx`**

Create `src/app/(portal)/settings/_components/AccountsSection.tsx` as a Client Component. Layout:
- Header: "Chart of Accounts" + count, "Show inactive" toggle
- List grouped by `type` (in `ACCOUNT_TYPES` order); each group has a `<h3>` with `typeLabel(type)` + range, then rows
- Each row: `code` (mono) / `name` / `cash_flow_category` (text) / status / Edit
- "Create new" form at the top: `<select name="type">` (8 options, labelled `${typeLabel(t)} (${range[0]}-${range[1]})`) + `<input name="name">` + `<select name="cash_flow_category">` (3 options, defaulted by type via `defaultCashFlowCategoryFor` when type changes) + submit
- Edit modal: name + cash_flow_category + is_active (sort_order optional), code/type read-only

Use `useFormState` / `useTransition` for the submit. Style with `.ledger-table`, `.page-eyebrow`, `.sect-head` for the group headers. Markup mirrors current `CategoriesSection.tsx` patterns where applicable.

Skeleton (full implementation flows from this; fill in JSX):

```tsx
'use client'
import { useState, useTransition } from 'react'
import { ACCOUNT_TYPES, CASH_FLOW_CATEGORIES, defaultCashFlowCategoryFor, rangeFor, typeLabel, type AccountType, type CashFlowCategory } from '@/lib/coa'
import { createAccount, updateAccount } from '../actions'

interface Account {
  code: string
  name: string
  type: AccountType
  cash_flow_category: CashFlowCategory
  is_active: boolean
  sort_order: number
}
interface Props {
  accounts: Account[]
}

export default function AccountsSection({ accounts }: Props) {
  const [pending, startTransition] = useTransition()
  const [showInactive, setShowInactive] = useState(false)
  const [createType, setCreateType] = useState<AccountType>('expense')
  const [createCfc, setCreateCfc] = useState<CashFlowCategory>(defaultCashFlowCategoryFor('expense'))

  // ... grouped render + create form + edit modal
  return ( /* JSX described above */ <div /> )
}
```

The page server-fetches `accounts` and passes them down:
```tsx
// settings/page.tsx (modify)
const { data: accounts } = await supabase
  .from('chart_of_accounts')
  .select('code, name, type, cash_flow_category, is_active, sort_order')
  .order('type').order('sort_order').order('code')
return <AccountsSection accounts={(accounts ?? []) as Account[]} />
```

- [ ] **Step 3: Delete the old file**

```
git rm src/app/(portal)/settings/_components/CategoriesSection.tsx
```

- [ ] **Step 4: Wire the new component in `settings/page.tsx`**

Replace the existing CategoriesSection usage with AccountsSection. Update the data fetch to `chart_of_accounts` instead of `payment_categories`. Update the imports.

- [ ] **Step 5: Build check**

Run: `npm run build` — may still fail because PV form / cfo-reports references aren't updated yet. That's expected; we fix in next tasks.

- [ ] **Step 6: Commit**

```
git add src/app/(portal)/settings/
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(settings): Accounts UI driven by unified chart_of_accounts"
```

---

## Task 5: PV creation flow — payments actions + form

**Files:**
- Modify: `src/app/(portal)/payments/actions.ts`
- Modify: `src/app/(portal)/payments/_components/NewPaymentForm.tsx`

- [ ] **Step 1: Update `payments/actions.ts`**

Replace every reference to `category_code` with `account_code`. The two FormData reads (line 31 + line 570 per earlier exploration) read `account_code` instead. The two `payment_voucher_sources` insert/update blocks set `account_code` instead. The credit-direction required-category check stays — same logic, new field name. The required-category guard from the earlier branch (`fix: require category_code on credit voucher source rows`) keeps its error message but reads `account_code`.

Key diff (illustrative):
```ts
const accountCode = (formData.get('account_code') as string) || null
// ... later, in source-row insert:
.insert({ voucher_id: data.id, pool: targetPool, amount, account_code: accountCode })
// credit-direction guard:
if (!accountCode) {
  throw new Error('Account is required on inbound (credit) vouchers')
}
```

Also drop the second `const categoryCode = ...` near line 570 in `updateVoucher` — replace with `accountCode`.

- [ ] **Step 2: Update `NewPaymentForm.tsx`**

The "Category" select becomes an "Account" select. Source is `chart_of_accounts` (not `payment_categories`), filtered to `is_active = true`, grouped by `type` with `typeLabel(type)` headers (use `<optgroup>`). Pass accounts as a prop from the parent server page.

Form change snippet:
```tsx
<select name="account_code" required={direction === 'credit'}>
  <option value="">Select account…</option>
  {ACCOUNT_TYPES.map((t) => {
    const group = accounts.filter((a) => a.type === t && a.is_active)
    if (group.length === 0) return null
    return (
      <optgroup key={t} label={typeLabel(t)}>
        {group.map((a) => (
          <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
        ))}
      </optgroup>
    )
  })}
</select>
```

The parent server component (`payments/new/page.tsx` or wherever) fetches `accounts` and passes to the form. Update any prop types accordingly.

- [ ] **Step 3: Build check**

`npm run build` — still likely fails on cfo-reports / other call sites. Continue.

- [ ] **Step 4: Commit**

```
git add "src/app/(portal)/payments/"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(payments): PV form + actions use account_code from unified COA"
```

---

## Task 6: Other write paths — voucher-paid-helpers, fund-out, billing

**Files:**
- Modify: `src/lib/voucher-paid-helpers.ts`
- Modify: `src/app/(portal)/fund-out/actions.ts`
- Modify: `src/lib/loan-disbursement.ts`
- Modify: `src/app/(portal)/fund-out/_components/NewLoanForm.tsx`
- Modify: `src/app/(portal)/fund-out/new/page.tsx`
- Modify: `src/app/(portal)/billing/actions.ts` (only if it references `category_code` — grep first)

- [ ] **Step 1: voucher-paid-helpers.ts**

Search the file for `category_code` and replace with `account_code`. Any `payment_categories` join becomes a `chart_of_accounts` join — same fields (`gl_account_code` doesn't exist on chart_of_accounts anymore since the COA IS the GL; `code` itself is the GL account). Update any code that called `category.gl_account_code` to use the source row's `account_code` directly. (If the helper currently looks up the category to get a GL account code for posting a journal entry, the journal account code IS now `payment_voucher_sources.account_code`. Simplifies the path — no join needed.)

- [ ] **Step 2: fund-out flow**

In `src/app/(portal)/fund-out/actions.ts` and `src/lib/loan-disbursement.ts`:
- Variable `disbursementCategoryCode` → `disbursementAccountCode`. FormData key `disbursement_category_code` → `disbursement_account_code`.
- `bsCategoriesForDisbursement(categories)` → `bsAccountsForDisbursement(accounts)`. Filter: `account_type IN ('asset','fixed_asset','liability','equity')` and `is_active`. (Note: the new enum has 4 BS-side types now, was 3.)
- In `validateDisbursementCategory`, the allowed account_type list becomes `['asset', 'fixed_asset', 'liability', 'equity']`.
- The post-RPC UPDATE patch (`payment_voucher_sources.category_code = ...`) becomes `account_code = ...` because of the column rename. Once mig 238 lands and includes the column-rename, this works.
- The `create_loan_with_approval` RPC signature change from mig 236 is no longer in scope (236 is superseded). Instead, the rename in mig 238 means the existing 9-arg RPC still inserts into the renamed column. The post-RPC UPDATE remains the way to set `account_code`.

In `NewLoanForm.tsx` and `fund-out/new/page.tsx`: prop name `bsCategories` → `bsAccounts`, dropdown label "Disbursement category" → "Disbursement account", select name `disbursement_category_code` → `disbursement_account_code`.

Update `loan-disbursement.test.ts` accordingly (function rename + new allowed type list).

- [ ] **Step 3: billing/actions.ts**

Grep `category_code` in this file. If `invoice.category_code` is read or written (per mig 230 `invoice_category_code`), rename the variable to track consistency with other code. The DB column on `invoices` table stays `category_code` for now (we're not renaming it in this migration — only `payment_voucher_sources.category_code` got renamed). Add a clear inline comment noting the column name vs the unified COA.

> **Note for executor:** The `invoices.category_code` column was added by mig 230 to drive `invoice_paid → revenue GL` mapping. It SHOULD eventually be renamed too, but that's out of scope for this plan (more cross-cutting). Keep the DB column name `category_code` for now; the values in it become chart_of_accounts codes after seeding.

- [ ] **Step 4: Run tests**

`npx vitest run src/lib/loan-disbursement.test.ts` — should still pass (after renames).

- [ ] **Step 5: Build check**

`npm run build` — by this point only cfo-reports.ts and the report pages should be the remaining holdouts.

- [ ] **Step 6: Commit**

```
git add src/lib/voucher-paid-helpers.ts src/lib/loan-disbursement.ts src/lib/loan-disbursement.test.ts "src/app/(portal)/fund-out/" "src/app/(portal)/billing/actions.ts"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat: remaining write paths read account_code from unified COA"
```

---

## Task 7: cfo-reports.ts rewrite — read account_code, group by COA type, new report shapes

**Files:**
- Modify: `src/lib/cfo-reports.ts`
- Modify: `src/lib/cfo-reports.test.ts`

This is the biggest single change. The function `classifyRows` and the three `fetch*` wrappers all reference `category_code` / `payment_categories` / 5-value `account_type`. They become: read `account_code` from PV sources, join `chart_of_accounts` for `name` + `type` + `cash_flow_category`, and route by the 8-type enum and the cash_flow_category for CFS.

- [ ] **Step 1: Update `Raw*` input types**

```ts
import type { AccountType, CashFlowCategory } from './coa'

export interface RawPvSourceRow {
  voucherId: string
  voucherType: string
  direction: 'credit' | 'debit'
  pool: string
  accountCode: string                   // was: categoryCode
  accountName: string                   // was: categoryLabel — now chart_of_accounts.name
  accountType: AccountType              // 8-value enum now
  cashFlowCategory: CashFlowCategory    // NEW: drives Op/Inv/Fin bucketing in CFS
  amount: number
}

export interface RawInvoiceRow {
  invoiceNo: string
  companyShortCode: string
  pool: string
  amount: number
}

export interface RawTreasury {
  interestIncome: number
  penaltyIncome: number
  interestExpense: number
}
```

- [ ] **Step 2: Update `classifyRows` output shapes**

P&L gets explicit cost and other_income slots:

```ts
export interface PoolPnl {
  pool: string
  poolLabel: string
  revenueLines: Line[]
  costLines: Line[]           // NEW
  otherIncomeLines: Line[]    // NEW
  expenseLines: Line[]
  revenue: number
  cost: number                // NEW
  otherIncome: number         // NEW
  expense: number
  grossProfit: number         // NEW = revenue - cost
  margin: number              // = grossProfit + otherIncome - expense
}

export interface IncomeStatement {
  pools: PoolPnl[]
  treasury: TreasuryBreakdown
  groupRevenue: number
  groupCost: number           // NEW
  groupOtherIncome: number    // NEW
  groupExpense: number
  groupGrossProfit: number    // NEW
  groupNetProfit: number      // = groupGrossProfit + groupOtherIncome - groupExpense
}
```

Cash Flow gets Op/Inv/Fin sections:

```ts
export interface CashflowPoolBlock {
  pool: string
  poolLabel: string
  inflowLines: Line[]
  outflowLines: Line[]
  net: number
}
export interface CashflowSection {
  category: CashFlowCategory  // 'operating' | 'investing' | 'financing'
  pools: CashflowPoolBlock[]
  net: number
}
export interface CashflowStatement {
  sections: CashflowSection[]  // length 3, always in [operating, investing, financing] order
  netChange: number
}
```

`balanceMovements` stays similar.

- [ ] **Step 3: Update `classifyRows` routing logic**

Routing rules (replace existing per-account_type branches):
- For each PV source row: skip `voucher_type='internal_transfer'`; apply the existing loan_repayment/disbursement double-count guard; apply the existing billing_payment AR-collection special case.
- Then route by `accountType`:
  - `revenue` → P&L revenue
  - `cost` → P&L cost
  - `other_income` → P&L other income
  - `expense` → P&L expense
  - `asset`, `fixed_asset`, `liability`, `equity` → Balance Sheet movement (sign rules unchanged from existing code)
- For the CFS, classify the cash side by `cashFlowCategory` of the row's account:
  - `operating` → operating section
  - `investing` → investing section
  - `financing` → financing section
- Treasury interest (the `treasury` input) still folds into Venture Pool revenue / expense lines for the P&L. For the CFS, the treasury interest cash flow is already captured via PV source rows when interest is paid/received; the journal-derived treasury figure is for the P&L only.

The invoice loop (`for inv of invoices`) keeps adding to P&L revenue only (NOT to cashflow — same as the fix from the prior session).

- [ ] **Step 4: Update fetch wrappers**

`gatherPvSources`: query `payment_voucher_sources` for `account_code` (renamed). Build a `Map<code, {name, accountType, cashFlowCategory}>` from `chart_of_accounts.select('code, name, type, cash_flow_category')`. Throw on unknown account_code (same as before; the FK + NOT NULL on PVS guarantees it shouldn't happen).

`fetchBalanceSheet`: still aggregates by COA `type` from `journal_lines`, but the ranges of asset-type accounts change (now 2xxx fixed + 3xxx current). Refactor the existing GL-net helper to iterate by COA type from a single fetch of `chart_of_accounts`:

```ts
// Pseudocode:
const { data: coaRows } = await supabase
  .from('chart_of_accounts').select('code, type, cash_flow_category')
const codesByType = groupByType(coaRows)
const totalAssets = await sumGlNetAcrossCodes({jeIds, codes: [...codesByType.asset, ...codesByType.fixed_asset], sign: 'dr-cr'})
const fixedAssets = await sumGlNetAcrossCodes({jeIds, codes: codesByType.fixed_asset, sign: 'dr-cr'})
const currentAssets = totalAssets - fixedAssets
// Named line items: bank (active bank_accounts.gl_account_code), AR (3030), Loans Receivable (3020), etc.
// These specific codes come from coa.ts NAMED-ACCOUNT constants or from the seed.
```

For named line item codes, define them as constants in `src/lib/coa.ts` (e.g. `AR_CODE = '3030'`, `LOANS_RECEIVABLE_CODE = '3020'`). Add and export them; update the test file to assert the constants.

- [ ] **Step 5: Update test cases**

Existing test cases in `cfo-reports.test.ts` use `categoryCode`/`categoryLabel`/`accountType: 'revenue'` shapes. Rename to `accountCode`/`accountName`. Where tests use `accountType: 'asset'`, those still work (asset is still a valid type). Add new tests:

```ts
it('routes cost rows into the P&L cost section', () => {
  const out = classifyRows({
    pvSources: [
      pv({ accountType: 'cost', direction: 'debit', amount: 3000, pool: 'venture_pool', accountName: 'Cost of services' }),
    ],
    invoices: [], treasury: noTreasury,
  })
  const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
  expect(vp.cost).toBe(3000)
  expect(vp.grossProfit).toBe(-3000)  // no revenue yet
})

it('routes other_income rows into the P&L other income section', () => {
  const out = classifyRows({
    pvSources: [
      pv({ accountType: 'other_income', direction: 'credit', amount: 200, pool: 'venture_pool', accountName: 'Penalty income' }),
    ],
    invoices: [], treasury: noTreasury,
  })
  const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
  expect(vp.otherIncome).toBe(200)
  expect(vp.margin).toBe(200)
})

it('groups CFS lines into operating / investing / financing by cashFlowCategory', () => {
  const out = classifyRows({
    pvSources: [
      // Loans Receivable: cash flow category = investing
      pv({ accountType: 'asset', cashFlowCategory: 'investing', direction: 'debit', amount: 50000, pool: 'venture_pool', accountName: 'Loans Receivable', voucherType: 'other' }),
      // Operating expense
      pv({ accountType: 'expense', cashFlowCategory: 'operating', direction: 'debit', amount: 500, pool: 'venture_pool', accountName: 'Postage' }),
      // Financing: fund_sources deposit (would normally come via fundSourceInflows but force one)
      pv({ accountType: 'liability', cashFlowCategory: 'financing', direction: 'credit', amount: 100000, pool: 'venture_pool', accountName: 'Director loan', voucherType: 'other' }),
    ],
    invoices: [], treasury: noTreasury,
  })
  const sections = out.cashflow.sections
  expect(sections.find((s) => s.category === 'investing')!.net).toBe(-50000)
  expect(sections.find((s) => s.category === 'operating')!.net).toBe(-500)
  expect(sections.find((s) => s.category === 'financing')!.net).toBe(100000)
  expect(out.cashflow.netChange).toBe(100000 - 50000 - 500)
})

it('Gross Profit = revenue - cost for each pool', () => {
  const out = classifyRows({
    pvSources: [
      pv({ accountType: 'cost', direction: 'debit', amount: 3000, pool: 'dept_pool_marketing', accountName: 'Cost' }),
    ],
    invoices: [
      { invoiceNo: 'INV-1', companyShortCode: 'CAR', pool: 'dept_pool_marketing', amount: 10000 },
    ],
    treasury: noTreasury,
  })
  const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
  expect(mk.revenue).toBe(10000)
  expect(mk.cost).toBe(3000)
  expect(mk.grossProfit).toBe(7000)
})
```

Update the helper `pv()` factory to require `cashFlowCategory` (with sensible default like `'operating'`).

- [ ] **Step 6: Verify**

`npx vitest run src/lib/cfo-reports.test.ts` — all tests pass (existing + new ones).
`npm run test:ci` — full suite green.

- [ ] **Step 7: Commit**

```
git add src/lib/cfo-reports.ts src/lib/cfo-reports.test.ts src/lib/coa.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(reports): cfo-reports reads unified COA, adds Gross Profit + CFS Op/Inv/Fin sections"
```

---

## Task 8: Income Statement page — Gross Profit + Other Income render

**Files:**
- Modify: `src/app/(portal)/reports/income-statement/page.tsx`

Render structure:

```
PER POOL (existing per-pool blocks, updated):
  ┌─ <Pool name>
  │   Revenue            ┃ Lines (label · amount)
  │   Cost               ┃ Lines
  │   Gross profit       ┃ = Rev − Cost
  │   Other income       ┃ Lines
  │   Operating Expense  ┃ Lines
  │   Pool margin        ┃
  └─

SUMMARY (new):
  Revenue          (sum)
  − Cost           (sum)
  ───────────
  Gross Profit
  + Other Income   (sum)
  − Expense        (sum)
  ───────────
  Net Profit
```

- [ ] **Step 1: Render per-pool block with Cost / Other Income / Gross Profit**

For each `stmt.pools[i]`, render 4 ledger-table sections (Revenue / Cost / Other Income / Expense). Show "Gross Profit" between Cost and Other Income. Use existing `.sect-head` + `.ledger-table` patterns; negatives wrapped in `<span className="neg">`. Mirror the layout in `cash-flow/page.tsx` for consistency.

- [ ] **Step 2: Render Summary block**

Below the per-pool blocks, render a final summary section:
```
Group revenue: <amount>
Group cost: <amount>     <-- if > 0
─── Gross profit ───
Group other income: <amount>
Group expense: <amount>
─── Net profit ───
```

- [ ] **Step 3: Build + manual check**

`npm run build`. Open `/reports/income-statement` (when dev server runs post-migration). Empty state is fine; data fields render the structure even without data.

- [ ] **Step 4: Commit**

```
git add "src/app/(portal)/reports/income-statement/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(income-statement): Gross Profit + Other Income structure"
```

---

## Task 9: Cash Flow page — Operating / Investing / Financing sections

**Files:**
- Modify: `src/app/(portal)/reports/cash-flow/page.tsx`

Render:
```
A. OPERATING ACTIVITIES
   Per-pool blocks (each with inflow/outflow lines + pool net)
   Operating subtotal: <amount>

B. INVESTING ACTIVITIES
   Per-pool blocks
   Investing subtotal: <amount>

C. FINANCING ACTIVITIES
   Per-pool blocks
   Financing subtotal: <amount>

Net cash change: <amount>
```

- [ ] **Step 1: Outer-section + nested per-pool render**

Three top-level sections (A/B/C). Within each: iterate `section.pools[]`. Each pool block lists inflow lines (positive) and outflow lines (negative). Bottom of each section: subtotal. Bottom of page: net change of the three subtotals.

Use `.sect-head` for the three section headers ("OPERATING ACTIVITIES" etc.). Within each section, use `.ledger-table` for the pool-level breakdown. Style consistent with current cashflow page.

- [ ] **Step 2: Empty section handling**

If a section has no pools / no lines, render a placeholder paragraph "No activity in this period." (italic muted text). Section subtotal shows 0.

- [ ] **Step 3: Build + manual check**

`npm run build`. Open `/reports/cash-flow`.

- [ ] **Step 4: Commit**

```
git add "src/app/(portal)/reports/cash-flow/page.tsx"
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(cash-flow): Operating / Investing / Financing sections"
```

---

## Task 10: Balance Sheet page — Fixed Assets section + type-based grouping

**Files:**
- Modify: `src/app/(portal)/reports/balance-sheet/page.tsx`

- [ ] **Step 1: Add Fixed Assets line in the Assets section**

The Assets section currently shows: Bank cash / Invoice receivable / Loan receivable / Other assets. Add a "Fixed Assets" sub-line between "Loans Receivable" and "Other assets":
- `fixedAssets = sumGlNetAcrossCodes({ jeIds, codes: codesByType.fixed_asset, sign: 'dr-cr' })`
- Only render if `Math.abs(fixedAssets) > 0.005`

Update `BalanceSheet` interface in `cfo-reports.ts` to add `fixedAssets: number`. Update `totalAssets = bank + invoiceReceivable + loanReceivable + fixedAssets + otherAssets` (otherAssets is the residual, recomputed).

- [ ] **Step 2: Equity section refinement**

The existing "Pool / equity balances" row stays. Add a sentence in the page commentary: "Equity now includes nine pool accounts (1000-1080) + retained earnings YTD."

- [ ] **Step 3: Build + manual check**

`npm run build`. Open `/reports/balance-sheet`.

- [ ] **Step 4: Commit**

```
git add "src/app/(portal)/reports/balance-sheet/page.tsx" src/lib/cfo-reports.ts
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "feat(balance-sheet): Fixed Assets section + sub-line"
```

---

## Task 11: Final sweep — verify, full test, build

**Files:**
- Grep across `src/` and `supabase/migrations/` for stragglers

- [ ] **Step 1: Grep for stragglers**

```
git grep "category_code\|payment_categories\|categoryCode\|categoryLabel"
```
Expected: zero hits in `src/` and `supabase/migrations/` AFTER mig 237+238 (the only allowed remnant is `invoices.category_code` per Task 6 Step 3 — flagged as out of scope). Fix anything else.

- [ ] **Step 2: Full test + build**

```
npm run test:ci
npm run build
```
Expected: tests green; build compiles.

- [ ] **Step 3: Verify migration order**

Cross-check `supabase/migrations/` filenames are in order:
- 237: schema extensions (additive)
- 238: bigbang (drop / rename / reseed)

The previous batch's mig 234/235/236 should be DELETED or kept depending on whether they were ever applied:
- If never applied (current state per the user): DELETE these three files. They're superseded by 237+238.
- If applied: keep them. Mig 238's safety check on PVS empty will guard.

Per current state (user deferred 234/235/236), DELETE them in this task:
```
git rm supabase/migrations/20260101000234_payment_categories_account_type_not_null.sql
git rm supabase/migrations/20260101000235_pvs_category_code_required.sql
git rm supabase/migrations/20260101000236_create_loan_with_approval_category_code.sql
```

Confirm with the user before deleting — if they HAVE applied them, the answer is different.

- [ ] **Step 4: Commit**

```
git add -A
git -c user.email="chew.acchouzs@gmail.com" -c user.name="wenwei4046" commit -m "chore: remove superseded migrations 234/235/236; final sweep"
```

- [ ] **Step 5: Hand back to the user**

Report: branch state with all new code, migrations 237 + 238 ready but NOT applied. User runs:
1. Confirm 234/235/236 were not applied (or roll them back).
2. `node --env-file=.env.local scripts/wipe-all-business-data.mjs --confirm`.
3. Apply mig 237 then mig 238 via Supabase Dashboard or `supabase db push`.
4. Re-enter business data using the new account picker.

---

## Self-Review

- **Spec §1 (data model — 8 types, ranges, cash_flow_category, drop payment_categories, PVS rename + FK):** Tasks 2 + 3. ✔
- **Spec §2 (auto-code RPC):** Task 2 step 1, function in migration 237. ✔
- **Spec §3 (seed COA — 28 accounts):** Task 3 step 1, INSERT block. ✔
- **Spec §4 (UI: Settings → Accounts; PV form account dropdown):** Tasks 4 + 5. ✔
- **Spec §5 (P&L Gross Profit + Other Income; BS Fixed Asset section; CFS Op/Inv/Fin):** Tasks 7 + 8 + 9 + 10. ✔
- **Spec §6 (migration sequence with safety check on empty PVS / journal_lines):** Task 3 step 1, the `DO $$ ... RAISE EXCEPTION` block. ✔
- **Spec §7 (testing — pure fn + RPC + classifyRows + IS smoke + migration smoke):** Tasks 1 + 7 step 5. Migration smoke is a manual check at the end (Task 11). ✔
- **Placeholder scan:** A few "fill in JSX" notes in Task 4 step 2 — these are skeleton with structure described; full JSX expected per DESIGN.md. Acceptable for UI (the structure is determined). Confirm no "TBD/implement later" in actual code blocks — none found. ✔
- **Type consistency:** `accountCode` / `accountName` / `accountType` / `cashFlowCategory` field names match across Tasks 5, 6, 7. `AccountType` / `CashFlowCategory` types from `coa.ts` used consistently. `next_account_code` RPC name matches `createAccount` action. ✔
- **Open spec items:** All three (bank_accounts split, salary_pool/dept_pools sub-ledger merge, cash_flow_category PV-level override) are noted as out of scope. ✔
