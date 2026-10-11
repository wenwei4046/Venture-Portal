'use server'

// Director Pool calculator — server actions. Principal + HR (matches dp_* RLS).
// Every mutation revalidates /director-pool so server-rendered data stays fresh;
// the client keeps its own optimistic state for instant recalc (HTML-tool UX).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { calcAll, computeContra, r2 } from '@/lib/director-pool-engine'
import { loadDirectorPoolData } from '@/lib/director-pool-data'

const PATH = '/director-pool'

export async function saveDpSettings(patch: {
  fixedSalary?: number
  savingPct?: number
  gbPct?: number
  billingStartMonth?: string | null
  allowStatUntil?: string | null
}): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const update: {
    updated_at: string
    fixed_salary?: number
    saving_pct?: number
    gb_pct?: number
    billing_start_month?: string | null
    allow_stat_until?: string | null
  } = { updated_at: new Date().toISOString() }
  if (patch.fixedSalary !== undefined) update.fixed_salary = patch.fixedSalary
  if (patch.savingPct !== undefined) update.saving_pct = patch.savingPct
  if (patch.gbPct !== undefined) update.gb_pct = patch.gbPct
  if (patch.billingStartMonth !== undefined) update.billing_start_month = patch.billingStartMonth
  if (patch.allowStatUntil !== undefined) update.allow_stat_until = patch.allowStatUntil
  const { error } = await supabase.from('dp_settings').update(update).eq('id', 1)
  if (error) throw new Error(`Failed to save settings: ${error.message}`)
  revalidatePath(PATH)
}

export async function saveDpDirectorWeight(directorId: string, weight: number): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.from('dp_directors').update({ weight }).eq('id', directorId)
  if (error) throw new Error(`Failed to save weight: ${error.message}`)
  revalidatePath(PATH)
}

export async function addDpMonth(month: string): Promise<{ id: string }> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('dp_months')
    .insert({ month })
    .select('id')
    .single()
  if (error) throw new Error(`Failed to add month: ${error.message}`)
  revalidatePath(PATH)
  return { id: data.id }
}

export async function updateDpMonth(
  monthId: string,
  patch: {
    month?: string
    full_payout?: boolean
    include_billing?: boolean
    billing_deduct_adv?: boolean
    allow_excl_full_payout?: boolean
  },
): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  // Full payout month never counts billing into Total Pay (HTML behaviour)
  const update = { ...patch }
  if (update.full_payout === true) update.include_billing = false
  const { error } = await supabase.from('dp_months').update(update).eq('id', monthId)
  if (error) throw new Error(`Failed to update month: ${error.message}`)
  revalidatePath(PATH)
}

export async function deleteDpMonth(monthId: string): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.from('dp_months').delete().eq('id', monthId)
  if (error) throw new Error(`Failed to delete month: ${error.message}`)
  revalidatePath(PATH)
}

/** Clears one month's NUMBERS (company inputs + keyed director inputs) but keeps the month row. */
export async function clearDpMonthData(monthId: string): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const { error: iErr } = await supabase.from('dp_inputs').delete().eq('month_id', monthId)
  if (iErr) throw new Error(`Failed to clear inputs: ${iErr.message}`)
  const { error: dErr } = await supabase.from('dp_director_inputs').delete().eq('month_id', monthId)
  if (dErr) throw new Error(`Failed to clear director inputs: ${dErr.message}`)
  revalidatePath(PATH)
}

export async function upsertDpInput(
  monthId: string,
  companyId: string,
  field: 'salary' | 'kpi' | 'allowance',
  value: number,
): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const row: { month_id: string; company_id: string; salary?: number; kpi?: number; allowance?: number } = {
    month_id: monthId,
    company_id: companyId,
  }
  row[field] = value
  const { error } = await supabase
    .from('dp_inputs')
    .upsert(row, { onConflict: 'month_id,company_id' })
  if (error) throw new Error(`Failed to save input: ${error.message}`)
  revalidatePath(PATH)
}

export type DpDirectorInputField =
  | 'billing_stat'
  | 'allow_billing_stat'
  | 'allow_pay_stat'
  | 'adv_stat'
  | 'saving_withdrawal'
  | 'adv_override_this'
  | 'adv_override_accum'

export async function upsertDpDirectorInput(
  monthId: string,
  directorId: string,
  field: DpDirectorInputField,
  value: number | null,
): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const patch: {
    month_id: string
    director_id: string
    is_contra_override?: boolean
  } & { [K in DpDirectorInputField]?: number | null } = {
    month_id: monthId,
    director_id: directorId,
  }
  patch[field] = value
  // Keying a manual advance override by hand un-marks any contra provenance
  if (field === 'adv_override_this' || field === 'adv_override_accum') {
    patch.is_contra_override = false
  }
  const { error } = await supabase
    .from('dp_director_inputs')
    .upsert(patch, { onConflict: 'month_id,director_id' })
  if (error) throw new Error(`Failed to save: ${error.message}`)
  revalidatePath(PATH)
}

export interface ContraSummaryLine {
  code: string
  billing: number
  advance: number
  contra: number
  newBilling: number
  newAdvance: number
}

export async function performDpContra(): Promise<ContraSummaryLine[]> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const data = await loadDirectorPoolData()
  if (!data.months.length) return []

  const results = calcAll(data.settings, data.directors, data.months, data.dirInputs, data.fixedOverrides)
  const lastMonth = results[results.length - 1]
  const summary = computeContra(results, data.directors, data.dirInputs, data.contra, data.settings)

  for (const line of summary) {
    if (line.contra <= 0) continue
    const { error: cErr } = await supabase.from('dp_contra').insert({
      director_id: line.directorId,
      amount: line.contra,
      from_month_id: lastMonth.id,
    })
    if (cErr) throw new Error(`Contra failed: ${cErr.message}`)

    // Persist the advance adjustment as an override on the latest month —
    // same as the HTML tool. Keep the auto advThisMonth; pin the new accum.
    const dd = lastMonth.dirRes.find((x) => x.id === line.directorId)
    const key = `${lastMonth.id}_${line.directorId}`
    const existing = data.dirInputs[key]
    const hadManualOverride = existing?.advOverrideThis != null || existing?.advOverrideAccum != null
    const { error: oErr } = await supabase.from('dp_director_inputs').upsert(
      {
        month_id: lastMonth.id,
        director_id: line.directorId,
        adv_override_this: hadManualOverride ? (existing?.advOverrideThis ?? 0) : r2(dd?.advThisMonth ?? 0),
        adv_override_accum: line.newAdvance,
        is_contra_override: !hadManualOverride,
      },
      { onConflict: 'month_id,director_id' },
    )
    if (oErr) throw new Error(`Contra override failed: ${oErr.message}`)
  }

  revalidatePath(PATH)
  return summary.map(({ code, billing, advance, contra, newBilling, newAdvance }) => ({
    code,
    billing,
    advance,
    contra,
    newBilling,
    newAdvance,
  }))
}

export async function resetDpContra(): Promise<void> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  const supabase = await createClient()
  const { error: dErr } = await supabase.from('dp_contra').delete().gte('amount', -1e15)
  if (dErr) throw new Error(`Reset contra failed: ${dErr.message}`)
  // Only clear overrides that contra itself created — manual ones stay
  const { error: oErr } = await supabase
    .from('dp_director_inputs')
    .update({ adv_override_this: null, adv_override_accum: null, is_contra_override: false })
    .eq('is_contra_override', true)
  if (oErr) throw new Error(`Reset contra overrides failed: ${oErr.message}`)
  revalidatePath(PATH)
}

// ── JSON import (the HTML tool's saveData() format, version 2) ──────────────

interface LegacyJson {
  version?: number
  settings?: { fixed?: number; savingPct?: number; gbPct?: number }
  directors?: { id: string; name?: string; weight: number }[]
  months?: {
    id: string
    name: string
    fullPayout?: boolean
    includeBilling?: boolean
    cos: { salary?: number; kpi?: number; allowance?: number }[]
  }[]
  billingInputs?: Record<string, number>
  advStatInputs?: Record<string, number>
  allowPayStatInputs?: Record<string, number>
  advanceOverrides?: Record<string, { advThisMonth?: number; accumulated?: number }>
  billingContraOffsets?: Record<string, number | { amount: number; fromMonthId: string | null }>
  contraAdvKeys?: string[]
  savingWithdrawals?: Record<string, number>
  billingDeductAdvMonths?: Record<string, boolean>
  billingStartMonth?: string
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface ImportResult {
  months: number
  directorInputs: number
  contraEvents: number
}

export type ImportOutcome = ({ ok: true } & ImportResult) | { ok: false; error: string }

/**
 * Replaces ALL existing calculator data with the uploaded JSON. Month names
 * (Jan..Dec) map to first-of-month dates in the given year; companies map by
 * position (the HTML tool's fixed company order = dp_companies sort order);
 * directors map by code.
 *
 * Returns failures as { ok: false, error } instead of throwing — production
 * masks thrown server-action messages, which makes import errors undebuggable.
 */
export async function importDpJson(jsonText: string, year: number): Promise<ImportOutcome> {
  await requireActionOn('/director-pool', 'director_pool', 'edit')
  try {
    const result = await runImport(jsonText, year)
    revalidatePath(PATH)
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Import failed' }
  }
}

async function runImport(jsonText: string, year: number): Promise<ImportResult> {
  const supabase = await createClient()

  let parsed: LegacyJson
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Invalid JSON file')
  }
  if (!parsed.months || !parsed.directors) throw new Error('Invalid file format — months/directors missing')

  const { data: dbDirectors, error: dirErr } = await supabase.from('dp_directors').select('id, code')
  if (dirErr) throw new Error(dirErr.message)
  const { data: dbCompanies, error: coErr } = await supabase
    .from('dp_companies')
    .select('id, sort')
    .eq('is_active', true)
    .order('sort')
  if (coErr) throw new Error(coErr.message)
  const dirByCode = new Map((dbDirectors ?? []).map((d) => [d.code, d.id]))

  // 1. Settings + weights
  if (parsed.settings) {
    await saveSettingsRaw(supabase, parsed.settings)
  }
  for (const d of parsed.directors ?? []) {
    const id = dirByCode.get(d.id)
    if (id) await supabase.from('dp_directors').update({ weight: d.weight }).eq('id', id)
  }

  // 2. Wipe existing months (cascades inputs / director inputs / contra)
  const { error: wipeErr } = await supabase.from('dp_months').delete().gte('month', '1900-01-01')
  if (wipeErr) throw new Error(`Wipe failed: ${wipeErr.message}`)

  // 3. Months — legacy id → new uuid map
  const idMap = new Map<string, string>()
  let monthCount = 0
  for (const m of parsed.months) {
    const idx = MONTH_NAMES.findIndex((n) => m.name.startsWith(n))
    if (idx < 0) throw new Error(`Unrecognised month name: ${m.name}`)
    const month = `${year}-${String(idx + 1).padStart(2, '0')}-01`
    const { data: row, error } = await supabase
      .from('dp_months')
      .insert({
        month,
        full_payout: m.fullPayout ?? false,
        include_billing: m.includeBilling ?? false,
        billing_deduct_adv: parsed.billingDeductAdvMonths?.[m.id] ?? false,
      })
      .select('id')
      .single()
    if (error) throw new Error(`Month ${m.name}: ${error.message}`)
    idMap.set(m.id, row.id)
    monthCount++

    // Company inputs by position
    const inputRows = m.cos
      .map((c, ci) => ({
        month_id: row.id,
        company_id: (dbCompanies ?? [])[ci]?.id,
        salary: c.salary ?? 0,
        kpi: c.kpi ?? 0,
        allowance: c.allowance ?? 0,
      }))
      .filter((r) => r.company_id && (r.salary || r.kpi || r.allowance))
    if (inputRows.length) {
      const { error: iErr } = await supabase.from('dp_inputs').insert(inputRows)
      if (iErr) throw new Error(`Inputs ${m.name}: ${iErr.message}`)
    }
  }

  // 4. Per-director manual inputs — merge every legacy map into one row per
  //    (month, director). Legacy keys: `${mid}_${CODE}` and `al_${mid}_${CODE}`.
  interface MergedRow {
    month_id: string
    director_id: string
    billing_stat?: number
    allow_billing_stat?: number
    allow_pay_stat?: number
    adv_stat?: number
    saving_withdrawal?: number
    adv_override_this?: number
    adv_override_accum?: number
    is_contra_override?: boolean
  }
  type MergedField = Exclude<keyof MergedRow, 'month_id' | 'director_id'>
  const merged = new Map<string, MergedRow>()
  const put = (legacyKey: string, field: MergedField, value: number | boolean) => {
    const isAllow = legacyKey.startsWith('al_')
    const key = isAllow ? legacyKey.slice(3) : legacyKey
    const us = key.lastIndexOf('_')
    if (us < 0) return
    const legacyMid = key.slice(0, us)
    const code = key.slice(us + 1)
    const monthId = idMap.get(legacyMid)
    const directorId = dirByCode.get(code)
    if (!monthId || !directorId) return
    const mk = `${monthId}|${directorId}`
    // is_contra_override must be present on EVERY row: a bulk insert with
    // heterogeneous rows null-fills missing columns (bypassing the DB
    // default) and violates the NOT NULL constraint.
    if (!merged.has(mk)) merged.set(mk, { month_id: monthId, director_id: directorId, is_contra_override: false })
    const row = merged.get(mk)!
    if (field === 'is_contra_override') row.is_contra_override = Boolean(value)
    else row[field] = Number(value)
  }

  for (const [k, v] of Object.entries(parsed.billingInputs ?? {})) {
    if (!v) continue
    put(k, k.startsWith('al_') ? 'allow_billing_stat' : 'billing_stat', v)
  }
  for (const [k, v] of Object.entries(parsed.advStatInputs ?? {})) if (v) put(k, 'adv_stat', v)
  for (const [k, v] of Object.entries(parsed.allowPayStatInputs ?? {})) if (v) put(k, 'allow_pay_stat', v)
  for (const [k, v] of Object.entries(parsed.savingWithdrawals ?? {})) if (v) put(k, 'saving_withdrawal', v)
  const contraKeys = new Set(parsed.contraAdvKeys ?? [])
  for (const [k, v] of Object.entries(parsed.advanceOverrides ?? {})) {
    if (v.advThisMonth !== undefined) put(k, 'adv_override_this', v.advThisMonth)
    if (v.accumulated !== undefined) put(k, 'adv_override_accum', v.accumulated)
    if (contraKeys.has(k)) put(k, 'is_contra_override', true)
  }

  const dirInputRows = Array.from(merged.values())
  if (dirInputRows.length) {
    const { error: diErr } = await supabase.from('dp_director_inputs').insert(dirInputRows)
    if (diErr) throw new Error(`Director inputs: ${diErr.message}`)
  }

  // 5. Contra offsets → one event per director
  let contraCount = 0
  for (const [code, co] of Object.entries(parsed.billingContraOffsets ?? {})) {
    const directorId = dirByCode.get(code)
    if (!directorId) continue
    const amount = typeof co === 'number' ? co : co.amount
    if (!amount) continue
    const legacyFrom = typeof co === 'number' ? null : co.fromMonthId
    const fromMonthId =
      (legacyFrom ? idMap.get(legacyFrom) : undefined) ?? Array.from(idMap.values())[0]
    if (!fromMonthId) continue
    const { error: cErr } = await supabase
      .from('dp_contra')
      .insert({ director_id: directorId, amount, from_month_id: fromMonthId })
    if (cErr) throw new Error(`Contra: ${cErr.message}`)
    contraCount++
  }

  // 6. Billing start month
  if (parsed.billingStartMonth) {
    const mapped = idMap.get(parsed.billingStartMonth)
    if (mapped) {
      const { data: mRow } = await supabase.from('dp_months').select('month').eq('id', mapped).single()
      if (mRow) await supabase.from('dp_settings').update({ billing_start_month: mRow.month }).eq('id', 1)
    }
  }

  return { months: monthCount, directorInputs: dirInputRows.length, contraEvents: contraCount }
}

async function saveSettingsRaw(
  supabase: Awaited<ReturnType<typeof createClient>>,
  s: NonNullable<LegacyJson['settings']>,
): Promise<void> {
  const { error } = await supabase
    .from('dp_settings')
    .update({
      fixed_salary: s.fixed ?? 14400,
      saving_pct: s.savingPct ?? 5,
      gb_pct: s.gbPct ?? 75,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (error) throw new Error(`Settings: ${error.message}`)
}
