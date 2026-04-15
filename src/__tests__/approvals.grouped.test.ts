import { describe } from 'vitest'

// Phase 7 Step 9 — Combined approval card (loan + voucher group_id).
//
// Coverage lives in scripts/step9-e2e.mjs (E2E against remote Supabase):
//   - Criterion A: Finance submit → 2 approval_requests with shared group_id,
//     voucher in pending_approval, pvs row, bank unchanged.
//   - Criterion B: Principal /approvals renders ONE combined card (verified
//     via Preview MCP snapshot in session).
//   - Criterion C: approveRequestGroup → loan active, voucher paid, bank
//     debited, hv_fund fund_out posted, all atomic.
//   - Criterion D: rejectRequestGroup → loan cancelled, voucher voided, no
//     money movement.
//   - Criterion E: legacy non-grouped approvals still render as single cards.
//
// Grouping logic in approvals/page.tsx is inline in the server component —
// extracting it for unit testing would add an abstraction we don't otherwise
// need (Karpathy #3). The E2E script is authoritative; this placeholder keeps
// the expected file indexed without breaking CI.
describe.todo('grouped approvals — covered end-to-end by scripts/step9-e2e.mjs')
