---
flow: dept-opex-full-cycle
amount_rm: 5499.00
trigger_role: dept_manager
observer_roles: [principal, finance, dept_manager]
expected_duration_min: 8
---

# Flow: Dept OPEX Full Cycle (HR RM 5499 — the motivating case)

> The canonical P0-1 test case. A Dept Manager submits an OPEX expense request; Principal approves the expense (Stage 2, accrual); Finance generates a PV; Principal approves the PV (Stage 4, payment). After mig 198 + mig 199, two JEs total must exist and reconcile.

## Setup preconditions
- Test data: a Dept Pool for Marketing with balance ≥ RM 5499 (check `dept_pool_balances` view)
- Period `DATE_TRUNC('month', NOW())` must be OPEN (not in `period_locks`)
- `bank_accounts.current_balance` on the primary (HL) bank ≥ RM 5499

## Steps

### Step 1 — Dept Manager submits
- Login as `dept_manager@venture.my / 123456`
- Navigate `/dept-pool/marketing` → click "Request Payment"
- Fill: payee name "Test Vendor", amount `5499.00`, description "QA OPEX test"
- Submit

**Assert (DB)**:
- 1 row in `dept_payment_requests` with `status='pending_principal_expense'`, `amount=5499.00`
- 1 row in `approval_requests` with `request_type='dept_payment_request'`, `status='pending'`
- 0 new rows in `dept_pools` yet (Stage 1 doesn't drain pool)
- 0 new rows in `journal_entries` yet

### Step 2 — Principal approves Stage 2 (expense)
- Logout → login as `principal@venture.my / 123456`
- Navigate `/approvals` → find the dept_payment_request row → click Approve

**Assert (DB)**:
- `dept_payment_requests.status = 'pending_finance_pv'`
- 1 new row in `dept_pools` with `transaction_type='expense_out'`, `amount=5499.00`, Marketing dept
- **1 new JE** with `reference_type='dept_expense_request'`:
  - `dr 3030 Dept Pool — Marketing 5499.00`
  - `cr 2060 AP General 5499.00`
- `dept_pool_balances.balance` for Marketing ↓ by 5499

### Step 3 — Finance generates PV
- Logout → login as `finance@venture.my / 123456`
- Navigate `/payments/dept-requests` → find the row → "Generate PV"
- Fill bank: HL (or primary), method: `bank_transfer`
- Submit

**Assert (DB)**:
- `dept_payment_requests.status = 'pending_principal_pv'`, `pv_id` set
- 1 new `payment_vouchers` row, `voucher_type='expense'`, `reference_type='dept_payment_request'`, `status='pending_approval'`
- 1 new `approval_requests` row for the PV
- 0 new JEs at this step

### Step 4 — Principal approves PV (Stage 4)
- Logout → login as principal
- Navigate `/approvals` → find the new `payment_voucher` approval → Approve

**Assert (DB)**:
- `payment_vouchers.status = 'paid'`, `payment_date = CURRENT_DATE`
- `dept_payment_requests.status = 'completed'` (via trigger `complete_dept_payment_request_on_pv_paid`)
- `bank_accounts.current_balance` for HL ↓ by 5499
- **1 new JE** with `reference_type='payment_voucher'`:
  - `dr 2060 AP General 5499.00` (mig 199 CASE detects `reference_type='dept_payment_request'` → routes to 2060, NOT 5050)
  - `cr 1010 Bank 5499.00`
- `apply_pool_adjustment` does NOT fire for dept pools (voucher sources route is `dept_pool_marketing` → drains Marketing pool again — **this is a known double-drain** — Phase 3 cleanup will address)

### Step 5 — Reconcile
Run the tally check:
```sql
SELECT
  SUM(jl.debit) FILTER (WHERE jl.account_code='3030') AS marketing_dr,
  SUM(jl.credit) FILTER (WHERE jl.account_code='3030') AS marketing_cr,
  SUM(jl.debit) FILTER (WHERE jl.account_code='2060') AS ap_dr,
  SUM(jl.credit) FILTER (WHERE jl.account_code='2060') AS ap_cr,
  SUM(jl.debit) FILTER (WHERE jl.account_code='1010') AS bank_dr,
  SUM(jl.credit) FILTER (WHERE jl.account_code='1010') AS bank_cr
FROM journal_entries je
JOIN journal_lines jl ON jl.entry_id = je.id
WHERE je.reference_id IN (<request_id>, <pv_id>)
   OR je.reference_type IN ('dept_expense_request', 'payment_voucher');
```

**Invariant**: `marketing_dr - marketing_cr = 5499` (pool drained), `ap_dr - ap_cr = 0` (AP cycled), `bank_dr - bank_cr = -5499` (bank drained).

## Cross-role view consistency

| Field | Principal sees | Finance sees | Dept Mgr sees | Tolerance |
|---|---|---|---|---|
| Pending approval row amount | 5499.00 | — | 5499.00 (in /submissions) | 0.00 |
| Marketing pool balance (after Step 2) | dashboard + /dept-pool | /dept-pool | /dept-pool/marketing, /dashboard | 0.00 |
| Bank balance (after Step 4) | dashboard | /payments | — | 0.00 |

## Verdict mapping
- All asserts pass → 🟢 GREEN
- Any DB asserts fail but UI flows → 🟡 YELLOW (flag for Phase 3)
- Cross-role amount mismatch → 🔴 RED P0
- JE missing or unbalanced → 🔴 RED P0
