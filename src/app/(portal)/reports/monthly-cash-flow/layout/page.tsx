import { redirect } from 'next/navigation'

// Both cash-flow views share ONE pair of layouts (`cash_flow_in` /
// `cash_flow_out`) since 2026-07-30 — the statement is the reference and the
// monthly matrix mirrors it. This old per-matrix editor (report_key
// `cash_flow`) would have let the two drift, so it now forwards to the shared
// one. The stale `cash_flow` row is left in report_layouts, unread.
export default function MonthlyCashFlowLayoutRedirect() {
  redirect('/reports/cash-flow/layout')
}
