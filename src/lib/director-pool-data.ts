// Server-side loader for the Director Pool calculator — fetches all dp_*
// tables and maps them into the engine's input shape. Used by the page and
// by server actions that need to run the engine (contra).
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type {
  DpDirector,
  DpMonth,
  DirectorInputMap,
  DpContraEvent,
  DpFixedOverride,
  DpSettings,
} from '@/lib/director-pool-engine'

export interface DpCompany {
  id: string
  name: string
  sort: number
}

export interface DirectorPoolData {
  settings: DpSettings & { billingStartMonth: string | null }
  directors: DpDirector[]
  companies: DpCompany[]
  months: DpMonth[]
  dirInputs: DirectorInputMap
  contra: DpContraEvent[]
  fixedOverrides: DpFixedOverride[]
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(isoDate: string, multiYear: boolean): string {
  const [y, m] = isoDate.split('-')
  const name = MONTH_LABELS[Number(m) - 1] ?? isoDate
  return multiYear ? `${name} ${y.slice(2)}` : name
}

export async function loadDirectorPoolData(): Promise<DirectorPoolData> {
  const supabase = await createClient()

  const [
    { data: settingsRow },
    { data: directorRows },
    { data: companyRows },
    { data: monthRows },
    { data: inputRows },
    { data: dirInputRows },
    { data: contraRows },
    { data: overrideRows },
  ] = await Promise.all([
    supabase.from('dp_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('dp_directors').select('*').order('sort'),
    supabase.from('dp_companies').select('*').eq('is_active', true).order('sort'),
    supabase.from('dp_months').select('*').order('month'),
    supabase.from('dp_inputs').select('*'),
    supabase.from('dp_director_inputs').select('*'),
    supabase.from('dp_contra').select('*').order('created_at'),
    supabase.from('dp_fixed_overrides').select('*'),
  ])

  const companies: DpCompany[] = (companyRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sort: c.sort,
  }))

  const directors: DpDirector[] = (directorRows ?? []).map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    weight: Number(d.weight),
    color: d.color,
  }))

  const years = new Set((monthRows ?? []).map((m) => m.month.slice(0, 4)))
  const multiYear = years.size > 1

  const inputsByMonth = new Map<string, Map<string, { salary: number; kpi: number; allowance: number }>>()
  for (const row of inputRows ?? []) {
    if (!inputsByMonth.has(row.month_id)) inputsByMonth.set(row.month_id, new Map())
    inputsByMonth.get(row.month_id)!.set(row.company_id, {
      salary: Number(row.salary),
      kpi: Number(row.kpi),
      allowance: Number(row.allowance),
    })
  }

  const months: DpMonth[] = (monthRows ?? []).map((m) => ({
    id: m.id,
    month: m.month,
    name: monthLabel(m.month, multiYear),
    fullPayout: m.full_payout,
    includeBilling: m.include_billing,
    billingDeductAdv: m.billing_deduct_adv,
    cos: companies.map((c) => {
      const v = inputsByMonth.get(m.id)?.get(c.id)
      return { companyId: c.id, salary: v?.salary ?? 0, kpi: v?.kpi ?? 0, allowance: v?.allowance ?? 0 }
    }),
  }))

  const dirInputs: DirectorInputMap = {}
  for (const row of dirInputRows ?? []) {
    dirInputs[`${row.month_id}_${row.director_id}`] = {
      billingStat: row.billing_stat == null ? null : Number(row.billing_stat),
      allowBillingStat: row.allow_billing_stat == null ? null : Number(row.allow_billing_stat),
      allowPayStat: row.allow_pay_stat == null ? null : Number(row.allow_pay_stat),
      advStat: row.adv_stat == null ? null : Number(row.adv_stat),
      savingWithdrawal: row.saving_withdrawal == null ? null : Number(row.saving_withdrawal),
      advOverrideThis: row.adv_override_this == null ? null : Number(row.adv_override_this),
      advOverrideAccum: row.adv_override_accum == null ? null : Number(row.adv_override_accum),
    }
  }

  const contra: DpContraEvent[] = (contraRows ?? []).map((c) => ({
    directorId: c.director_id,
    amount: Number(c.amount),
    fromMonthId: c.from_month_id,
  }))

  const fixedOverrides: DpFixedOverride[] = (overrideRows ?? []).map((o) => ({
    directorId: o.director_id,
    fromMonth: o.from_month,
    salary: Number(o.salary),
  }))

  const billingStartMonth = settingsRow?.billing_start_month ?? null
  const billingStartMonthId = billingStartMonth
    ? (months.find((m) => m.month === billingStartMonth)?.id ?? null)
    : null

  return {
    settings: {
      fixedSalary: Number(settingsRow?.fixed_salary ?? 14400),
      savingPct: Number(settingsRow?.saving_pct ?? 5),
      gbPct: Number(settingsRow?.gb_pct ?? 75),
      billingStartMonthId,
      billingStartMonth,
      allowStatUntil: settingsRow?.allow_stat_until ?? null,
    },
    directors,
    companies,
    months,
    dirInputs,
    contra,
    fixedOverrides,
  }
}
