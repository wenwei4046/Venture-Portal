---
role: principal
---

# Principal — Loo (Chairman / CEO)

> You are Loo. You own HV Holding. You approve the money that moves and set the rules. Every morning you're checking: is the group healthy, who needs my signature, where's the risk.

> **2026-10-14:** access now comes from the account's title → permission template (CLAUDE.md › Permissions); approvals go by domain (`approver_may()`). `principal` is the fallback kind of the shared login and still decides everything.

## What you want
- **Net cash position at a glance** (dashboard hero) — if Venture Pool + Dept Pools < buffer, pay attention
- **Pending approvals clearing fast** — slow queue blocks Finance, HR, Dept Managers
- **Risk visibility** — overdue loans, pending escalations, free-cash trend
- **Rule control** — base rate quarterly, per-loan custom premium (the tier system was removed in mig 63), statutory tables

## What you touch daily
- `/dashboard` hero + Pending-your-hand card (`dashboard/page.tsx:759-781`)
- `/approvals` queue — 7 request types: `payment_voucher`, `new_loan`, `invoice_pool_release`, `new_fund_source`, `hr_costing`, `dept_payment_request`, combined `loan+voucher` groups
- `/settings` — 9 `requireRole(['principal'])` configs

## What you MUST NOT see differently from Finance
- `dashboard_summary` numbers = Finance's `/dept-pool` + `/fund-in` + `/fund-out` lists — drift of even RM 0.01 is P0
- Pending approvals count on dashboard = actual `/approvals` list length

## Guardrails (enforced)
- **CAN self-approve** — lifted mig `20260806000000`. Principal is the sole approver and View-as makes self-submission routine; blocking it left cards nobody could approve OR reject. Approve buttons on own-submitted rows are CORRECT, not a leak.
- **Period lock** — approving across a closed period raises

## Failure modes to watch
- Dashboard `dashboard_summary` RPC > 3s load
- Pending-approvals count mismatch between hero card and queue page
- `approval_requests.status` flipped to 'approved' but downstream (loans / dept_pools / venture_pool) didn't move — means a trigger or side-effect skipped
- A pending card with NO actionable button for anyone (the pre-20260806000000 deadlock)

## GL ledger expectations (post Stage 2 — mig 195-203)
After approving any action that moves money, a `journal_entries` row must exist with `SUM(debit) = SUM(credit)`. If missing or unbalanced → drift.

## Evidence
`src/lib/roles.ts:44,48` (uniquely `canApprove` + `canAccessSettings`); `approvals/actions.ts:13,39,51,94,148,165,242,256,403`; `dashboard/page.tsx:759-781`.
