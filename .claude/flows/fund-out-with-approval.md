---
flow: fund-out-with-approval
amount_rm: 100000.00
trigger_role: finance
observer_roles: [principal, finance]
expected_duration_min: 5
---

# Flow: Fund OUT — New Loan with Combined Approval

> Tests the P0-2 drift fix (mig 199 + approvals/actions.ts). Finance creates a loan; Principal approves the combined group (loan + paired PV) in one action. Post-mig-199 a `reference_type='loan'` JE must land with `dr 1020 Loans Receivable / cr 1010 Bank`.

## Setup preconditions
- An active base rate row in `base_rate_history` with `approved_at IS NOT NULL`
- A target company (e.g. HOUZS Century — "House") with `is_active=TRUE`
- Primary bank balance ≥ RM 100,000

## Steps

### Step 1 — Finance creates loan
- Login as `finance@venture.my / 123456`
- Navigate `/fund-out` → click "New Loan"
- Select company, principal `100000`, tenure `3` months, custom rate `1.5%`, terms "Monthly"
- Submit

**Assert (DB)**:
- 1 new `loans` row, `status='pending_approval'`, `principal=100000.00`
- 1 new `approval_requests` row with `request_type='new_loan'`, `group_id` set (non-null)
- 1 new `payment_vouchers` row paired under same `group_id`, `voucher_type='other'` or similar, `loan_id` set, `status='pending_approval'`

### Step 2 — Principal approves combined group
- Logout → login as `principal@venture.my / 123456`
- Navigate `/approvals` → find the combined card (loan + voucher) → Approve

**Assert (DB)**:
- Both `approval_requests` rows flipped to `status='approved'`
- `loans.status='active'`, `disbursement_date=CURRENT_DATE`
- `payment_vouchers.status='paid'`, `payment_date=CURRENT_DATE`
- `bank_accounts.current_balance` (primary) ↓ by 100000
- 1 new `venture_pool` row, `transaction_type='fund_out'`, `amount=100000`
- **1 new JE** with `reference_type='loan'`, `reference_id=loan.id`:
  - `dr 1020 Loans Receivable 100000.00`
  - `cr 1010 Bank 100000.00`

### Step 3 — Reconcile
```sql
SELECT jl.account_code, jl.debit, jl.credit
  FROM journal_entries je
  JOIN journal_lines jl ON jl.entry_id = je.id
 WHERE je.reference_type = 'loan'
   AND je.reference_id = '<loan_id>';
```

**Invariant**: Exactly 2 lines, one dr 1020 for 100000, one cr 1010 for 100000. Sum of dr = Sum of cr = 100000.

## Cross-role consistency

| Field | Principal sees | Finance sees | Tolerance |
|---|---|---|---|
| `loans.principal` | dashboard `loans_outstanding` | `/fund-out` list | 0.00 |
| Bank balance (post-approval) | dashboard | `/payments`, `/fund-out/{id}` | 0.00 |
| Venture Pool balance | dashboard | `/operating-fund` | 0.00 |

## Verdict mapping
- 2-line JE lands with dr 1020 / cr 1010 = 100000 → 🟢 GREEN
- JE lands but debit account is 5050 (not 1020) → 🔴 RED — means mig 199 CASE map isn't detecting loan disbursement
- JE missing entirely → 🔴 RED P0 — approveRequestGroup didn't call postJournalEntry
- Venture Pool amount or Bank amount off by any cent → 🔴 RED
