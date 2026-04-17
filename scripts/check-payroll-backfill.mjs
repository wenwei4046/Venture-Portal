import { createClient } from '@supabase/supabase-js'

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: payroll, error } = await supa
  .from('hr_monthly_payroll')
  .select('id, staff_id, period_month, basic_salary, statutory_allowance, non_statutory_allowance, ot_amount, commission_amount, prorata_days_worked, prorata_days_in_month, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, gross, net, status, source')
  .order('period_month', { ascending: false })

if (error) { console.error(error); process.exit(1) }

const { data: staff } = await supa.from('hr_staff_costs').select('id, employee_name')
const staffMap = Object.fromEntries(staff.map(s => [s.id, s.employee_name]))

console.log(`Rows: ${payroll.length}`)
console.table(payroll.map(p => ({
  staff: staffMap[p.staff_id] ?? p.staff_id.slice(0, 8),
  period: p.period_month,
  basic: Number(p.basic_salary),
  nonStat: Number(p.non_statutory_allowance),
  days: `${p.prorata_days_worked}/${p.prorata_days_in_month}`,
  epfER: Number(p.epf_er),
  epfEE: Number(p.epf_ee),
  socER: Number(p.socso_er),
  socEE: Number(p.socso_ee),
  eisER: Number(p.eis_er),
  eisEE: Number(p.eis_ee),
  pcb: Number(p.pcb),
  gross: Number(p.gross),
  net: Number(p.net),
  status: p.status,
  source: p.source,
})))
