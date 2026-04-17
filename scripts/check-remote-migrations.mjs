import { createClient } from '@supabase/supabase-js'

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: directors, error: de } = await supa
  .from('directors')
  .select('id, code, name, weightage, min_payout, pcb_category, children_count, status')
  .order('code')
if (de) { console.error(de); process.exit(1) }
console.log('Directors:')
console.table(directors)

const total = directors.filter(d => d.status === 'active').reduce((s, d) => s + Number(d.weightage), 0)
console.log('Total weightage (active):', total)

// Latest payouts
const { data: payouts, error: pe } = await supa
  .from('director_payouts')
  .select('director_id, period_month, gross_amount, payroll_gross, invoice_base, payroll_net, status, calculation_snapshot')
  .order('period_month', { ascending: false })
  .order('director_id')
  .limit(8)
if (pe) { console.error(pe); process.exit(1) }
console.log('\nLatest payouts:')
const dirMap = Object.fromEntries(directors.map(d => [d.id, d.code]))
console.table(payouts.map(p => ({
  dir: dirMap[p.director_id] ?? p.director_id.slice(0, 8),
  period: p.period_month,
  gross: Number(p.gross_amount),
  payroll: Number(p.payroll_gross),
  invoice: Number(p.invoice_base),
  net: Number(p.payroll_net),
  status: p.status,
  weightage: p.calculation_snapshot?.director?.weightage,
  totalWeightage: p.calculation_snapshot?.total_weightage,
  pool: p.calculation_snapshot?.pool?.totalPool,
})))
