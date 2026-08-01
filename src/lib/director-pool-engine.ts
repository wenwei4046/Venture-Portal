// Director Pool calculation engine — faithful TypeScript port of calcAll()
// from the standalone HTML tool (Salary_Pool_Combined). Every intermediate
// value is rounded with r2() exactly where the original rounds, so results
// match the HTML tool to the cent.
//
// Business chain per director per month (two independent streams):
//   Sal+KPI pool × weight → gross → −saving% → balance → gb% paid / rest billed
//   Allowance pool × weight → gross → −saving% → balance → gb% paid / rest billed
//   Total Pay = paid portions (+ keyed billing statutory when includeBilling)
//   Vr KPI = Total Pay − fixed salary; negative accumulates as Advance,
//   positive surplus offsets accumulated Advance. Keyed Advance Statutory and
//   75% Allowance Statutory also add to the Advance debt.

export interface DpSettings {
  fixedSalary: number
  savingPct: number // percent, e.g. 5
  gbPct: number // percent, e.g. 75
  billingStartMonthId: string | null
  allowStatUntil: string | null // ISO date; months BEFORE this show/count 25% Allowance Statutory
}

export interface DpDirector {
  id: string
  code: string
  name: string
  weight: number
  color: string
}

export interface DpCompanyInput {
  companyId: string
  salary: number
  kpi: number
  allowance: number
}

export interface DpMonth {
  id: string
  month: string // ISO yyyy-mm-01
  name: string // display label, e.g. "Feb"
  fullPayout: boolean
  includeBilling: boolean
  billingDeductAdv: boolean
  cos: DpCompanyInput[]
}

export interface DpDirectorInput {
  billingStat?: number | null // 25% Statutory (Sal+KPI)
  allowBillingStat?: number | null // 25% Statutory (Allowance)
  allowPayStat?: number | null // 75% Allowance Statutory → advance debt
  advStat?: number | null // Advance Statutory → advance debt
  savingWithdrawal?: number | null
  advOverrideThis?: number | null
  advOverrideAccum?: number | null
}

/** Keyed `${monthId}_${directorId}` — same key scheme as the HTML tool. */
export type DirectorInputMap = Record<string, DpDirectorInput>

export interface DpFixedOverride {
  directorId: string
  fromMonth: string // ISO yyyy-mm-01
  salary: number
}

export interface DpContraEvent {
  directorId: string
  amount: number
  fromMonthId: string
}

export interface DirectorMonthResult {
  id: string // director id
  code: string
  name: string
  color: string
  weight: number
  salGross: number
  kpiGross: number
  allowGross: number
  salKpiGross: number
  salKpiSaving: number
  salKpiBalance: number
  salKpiGB: number
  salKpiBillInv: number
  allowSaving: number
  allowBalance: number
  allowGB: number
  allowBillInv: number
  billInv: number
  billingUserInput: number
  statutoryInput: number
  totalSaving: number
  totalPay: number
  dirFixed: number
  vrKpi: number
  advThisMonth: number
  advStatAmount: number
  allowStatAmount: number
  /** Keyed statutory covered by this month's positive Vr KPI (user ruling
   *  2026-07-31): paid from the excess instead of becoming advance debt.
   *  Deducted from the HR payout alongside advanceOffset. */
  statFromSurplus: number
  /** This month's billing-deduct repayment (billingDeductAdv months):
   *  min(this month's advance additions, this month's 25% billing total). */
  billingDeduct: number
  prevAccum: number
  advanceSurplus: number
  advanceOffset: number
  accumulated: number
  hasOverride: boolean
  statKey: string
}

export interface MonthResult {
  id: string
  month: string
  name: string
  fullPayout: boolean
  includeBilling: boolean
  billingDeductAdv: boolean
  poolSal: number
  poolKpi: number
  poolAllow: number
  poolTotal: number
  dirRes: DirectorMonthResult[]
  cos: DpCompanyInput[]
}

export function r2(v: number): number {
  return Math.round(v * 100) / 100
}

const n = (v: number | null | undefined): number => (v == null || Number.isNaN(v) ? 0 : Number(v))

/** 25% Allowance Statutory applies only to months strictly before allowStatUntil. */
export function showAllowStat(monthDate: string, settings: Pick<DpSettings, 'allowStatUntil'>): boolean {
  if (!settings.allowStatUntil) return true
  return monthDate < settings.allowStatUntil
}

/**
 * 75% Allowance Statutory top-up base (user ruling 2026-08-01): statutory is
 * due only on the slice of the allowance 75% gross balance used to top the
 * Sal+KPI 75% gross balance up to the fixed salary. Returns that base for the
 * manual table lookup — 0 when the Sal+KPI stream already covers the fixed
 * salary (no allowance statutory needed).
 */
export function allowStatTopUpBase(
  d: Pick<DirectorMonthResult, 'salKpiGB' | 'allowGB' | 'dirFixed'>,
): number {
  const gap = r2(d.dirFixed - d.salKpiGB)
  if (gap <= 0) return 0
  return r2(Math.min(gap, d.allowGB))
}

/** Fixed salary for a director in a month, honouring from-month overrides. */
export function getFixed(
  directorId: string,
  monthDate: string,
  base: number,
  overrides: DpFixedOverride[],
): number {
  let result = base
  let bestFrom = ''
  for (const ov of overrides) {
    if (ov.directorId !== directorId) continue
    if (ov.fromMonth <= monthDate && ov.fromMonth >= bestFrom) {
      result = ov.salary
      bestFrom = ov.fromMonth
    }
  }
  return result
}

/**
 * Core engine — port of the HTML tool's calcAll(). Months must be the full
 * set (accumulated advance carries across months); they are sorted
 * chronologically here.
 */
export function calcAll(
  settings: DpSettings,
  directors: DpDirector[],
  months: DpMonth[],
  dirInputs: DirectorInputMap,
  fixedOverrides: DpFixedOverride[] = [],
): MonthResult[] {
  const savePct = n(settings.savingPct) / 100
  const gbP = n(settings.gbPct) / 100
  const biP = 1 - gbP
  const totalW = directors.reduce((s, d) => s + n(d.weight), 0)
  if (!totalW) return []

  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const accumulated: Record<string, number> = {}
  // Cumulative billing-deduct repayments per director. These live OUTSIDE the
  // raw accumulated (they were a display-layer adjustment historically); the
  // TRUE remaining debt is accumulated + billingRepaid. Offsetting Vr KPI
  // against the raw figure alone re-collected debt that billing had already
  // repaid (user-spotted 2026-07-31, WW July).
  const billingRepaid: Record<string, number> = {}
  directors.forEach((d) => {
    accumulated[d.id] = 0
    billingRepaid[d.id] = 0
  })

  return sorted.map((month) => {
    const poolSal = r2(month.cos.reduce((s, c) => s + n(c.salary), 0))
    const poolKpi = r2(month.cos.reduce((s, c) => s + n(c.kpi), 0))
    const poolAllow = r2(month.cos.reduce((s, c) => s + n(c.allowance), 0))
    const poolTotal = r2(poolSal + poolKpi + poolAllow)

    const dirRes = directors.map((d): DirectorMonthResult => {
      const wRatio = n(d.weight) / totalW
      const salGross = r2(poolSal * wRatio)
      const kpiGross = r2(poolKpi * wRatio)
      const allowGross = r2(poolAllow * wRatio)
      const salKpiGross = r2(salGross + kpiGross)

      const salKpiSaving = r2(salKpiGross * savePct)
      const salKpiBalance = r2(salKpiGross * (1 - savePct))
      const allowSaving = r2(allowGross * savePct)
      const allowBalance = r2(allowGross * (1 - savePct))
      const totalSaving = r2(salKpiSaving + allowSaving)

      const salKpiGB = month.fullPayout ? salKpiBalance : r2(salKpiBalance * gbP)
      const salKpiBillInv = month.fullPayout ? 0 : r2(salKpiBalance * biP)
      const allowGB = month.fullPayout ? allowBalance : r2(allowBalance * gbP)
      const allowBillInv = month.fullPayout ? 0 : r2(allowBalance * biP)
      const billInv = r2(salKpiBillInv + allowBillInv)

      const statKey = `${month.id}_${d.id}`
      const inp = dirInputs[statKey] ?? {}
      const statutoryInput = n(inp.billingStat)
      const billingUserInput = month.includeBilling && !month.fullPayout ? statutoryInput : 0
      const totalPay = r2(salKpiGB + allowGB + billingUserInput)
      const dirFixed = getFixed(d.id, month.month, n(settings.fixedSalary), fixedOverrides)
      const vrKpi = r2(totalPay - dirFixed)

      let advThisMonth = 0
      let advanceSurplus = 0
      let advanceOffset = 0
      let statFromSurplus = 0
      let billingDeduct = 0
      const prevAccum = accumulated[d.id]
      const hasOverride = inp.advOverrideThis != null || inp.advOverrideAccum != null
      // True remaining debt = raw accumulated + billing-deduct repayments.
      const trueDebt = r2(accumulated[d.id] + billingRepaid[d.id])

      if (month.fullPayout) {
        // Full payout: track this month's shortfall but never offset prior debt
        if (hasOverride) {
          advThisMonth = n(inp.advOverrideThis)
          accumulated[d.id] = n(inp.advOverrideAccum)
        } else if (vrKpi < 0) {
          advThisMonth = vrKpi
          accumulated[d.id] = r2(accumulated[d.id] + vrKpi)
        }
      } else if (hasOverride) {
        advThisMonth = n(inp.advOverrideThis)
        accumulated[d.id] = n(inp.advOverrideAccum)
      } else if (vrKpi < 0) {
        advThisMonth = vrKpi
        accumulated[d.id] = r2(accumulated[d.id] + vrKpi)
      } else if (trueDebt < 0) {
        // Surplus Vr KPI offsets the TRUE remaining advance (cap at 0) — debt
        // already repaid by billing deducts must not be collected again.
        advanceOffset = Math.min(vrKpi, Math.abs(trueDebt))
        accumulated[d.id] = r2(accumulated[d.id] + advanceOffset)
        if (vrKpi > advanceOffset) advanceSurplus = r2(vrKpi - advanceOffset)
      }

      // Keyed statutory amounts add to the advance debt (unless overridden).
      // User ruling 2026-07-31: a positive Vr KPI left after the debt offset
      // pays this month's keyed statutory FIRST (deducted from the payout);
      // only the uncovered part becomes debt.
      const advStatAmount = n(inp.advStat)
      const allowStatAmount = n(inp.allowPayStat)
      const statApplied = r2(
        (advStatAmount > 0 && !hasOverride ? advStatAmount : 0) +
          (allowStatAmount > 0 && !hasOverride ? allowStatAmount : 0),
      )
      if (statApplied > 0) {
        const surplusAvail =
          !month.fullPayout && !hasOverride && vrKpi > 0 ? r2(vrKpi - advanceOffset) : 0
        statFromSurplus = r2(Math.min(surplusAvail, statApplied))
        accumulated[d.id] = r2(accumulated[d.id] - r2(statApplied - statFromSurplus))
      }
      if (statFromSurplus > 0 && advanceSurplus > 0) {
        // The paid-out surplus shrinks by whatever it spent on statutory.
        advanceSurplus = r2(Math.max(0, advanceSurplus - statFromSurplus))
      }

      // Billing-deduct month: this month's advance additions are repaid from
      // the month's 25% billing total (mirrors billingRow). Tracked so later
      // months' Vr KPI offsets see the true remaining debt.
      if (month.billingDeductAdv) {
        const totalAdv = r2(Math.abs(advThisMonth) + r2(advStatAmount + allowStatAmount) - statFromSurplus)
        if (totalAdv > 0) {
          const dedStatSal = month.fullPayout ? 0 : n(inp.billingStat)
          const dedStatAl =
            month.fullPayout || !showAllowStat(month.month, settings) ? 0 : n(inp.allowBillingStat)
          const dedSalSys = month.fullPayout ? 0 : salKpiBillInv
          const dedAlSys = month.fullPayout ? 0 : allowBillInv
          const billTotal = r2(dedSalSys + dedStatSal + dedAlSys + dedStatAl)
          billingDeduct = r2(Math.min(totalAdv, billTotal))
          billingRepaid[d.id] = r2(billingRepaid[d.id] + billingDeduct)
        }
      }

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        color: d.color,
        weight: n(d.weight),
        salGross,
        kpiGross,
        allowGross,
        salKpiGross,
        salKpiSaving,
        salKpiBalance,
        salKpiGB,
        salKpiBillInv,
        allowSaving,
        allowBalance,
        allowGB,
        allowBillInv,
        billInv,
        billingUserInput,
        statutoryInput,
        totalSaving,
        totalPay,
        dirFixed,
        vrKpi,
        advThisMonth,
        advStatAmount,
        allowStatAmount,
        statFromSurplus,
        billingDeduct,
        prevAccum,
        advanceSurplus,
        advanceOffset,
        accumulated: accumulated[d.id],
        hasOverride,
        statKey,
      }
    })

    return {
      id: month.id,
      month: month.month,
      name: month.name,
      fullPayout: month.fullPayout,
      includeBilling: month.includeBilling,
      billingDeductAdv: month.billingDeductAdv,
      poolSal,
      poolKpi,
      poolAllow,
      poolTotal,
      dirRes,
      cos: month.cos,
    }
  })
}

// ── Ledger accumulations ────────────────────────────────────────────────────

/** Sum of contra amounts applying at a given month (events apply from their from-month onwards). */
export function contraOffset(
  directorId: string,
  uptoMonthId: string,
  results: MonthResult[],
  contra: DpContraEvent[],
): number {
  const idxOf = (id: string) => results.findIndex((m) => m.id === id)
  const uptoIdx = idxOf(uptoMonthId)
  if (uptoIdx < 0) return 0
  let sum = 0
  for (const ev of contra) {
    if (ev.directorId !== directorId) continue
    const fromIdx = idxOf(ev.fromMonthId)
    if (fromIdx >= 0 && uptoIdx >= fromIdx) sum += n(ev.amount)
  }
  return r2(sum)
}

export interface BillingRow {
  salSys: number // 25% invoice (Sal+KPI) system-calculated
  statSal: number // 25% statutory (Sal+KPI) keyed
  alSys: number // 25% invoice (Allowance) system-calculated
  statAl: number // 25% statutory (Allowance) keyed
  total: number
}

/** Per-month billing row for one director (mirrors the Billing tab columns). */
export function billingRow(
  m: MonthResult,
  d: DirectorMonthResult,
  dirInputs: DirectorInputMap,
  settings: Pick<DpSettings, 'allowStatUntil'>,
): BillingRow {
  const inp = dirInputs[d.statKey] ?? {}
  const statSal = m.fullPayout ? 0 : n(inp.billingStat)
  const statAl = m.fullPayout || !showAllowStat(m.month, settings) ? 0 : n(inp.allowBillingStat)
  const salSys = m.fullPayout ? 0 : d.salKpiBillInv
  const alSys = m.fullPayout ? 0 : d.allowBillInv
  return { salSys, statSal, alSys, statAl, total: r2(salSys + statSal + alSys + statAl) }
}

/**
 * Accumulated 25% billing for a director up to a month (inclusive), before
 * contra. Skips full-payout / include-billing / billing-deduct-adv months and
 * months before billing_start_month — same rules as the HTML dashboard.
 */
export function billingAccum(
  directorId: string,
  uptoMonthId: string,
  results: MonthResult[],
  dirInputs: DirectorInputMap,
  settings: DpSettings,
): number {
  const uptoIdx = results.findIndex((m) => m.id === uptoMonthId)
  if (uptoIdx < 0) return 0
  const startIdx = settings.billingStartMonthId
    ? results.findIndex((m) => m.id === settings.billingStartMonthId)
    : -1
  let sum = 0
  results.slice(0, uptoIdx + 1).forEach((m, i) => {
    if (startIdx >= 0 && i < startIdx) return
    if (m.fullPayout || m.includeBilling || m.billingDeductAdv) return
    const d = m.dirRes.find((x) => x.id === directorId)
    if (!d) return
    sum += billingRow(m, d, dirInputs, settings).total
  })
  return r2(sum)
}

/** Accumulated saving (Sal+KPI + Allowance savings − withdrawals) up to a month inclusive. */
export function savingAccum(
  directorId: string,
  uptoMonthId: string,
  results: MonthResult[],
  dirInputs: DirectorInputMap,
): number {
  const uptoIdx = results.findIndex((m) => m.id === uptoMonthId)
  if (uptoIdx < 0) return 0
  let sum = 0
  results.slice(0, uptoIdx + 1).forEach((m) => {
    const d = m.dirRes.find((x) => x.id === directorId)
    if (d) sum += d.totalSaving
    sum -= n(dirInputs[`${m.id}_${directorId}`]?.savingWithdrawal)
  })
  return r2(sum)
}

/** Accumulated 75% Allowance Statutory keyed for a director up to a month inclusive. */
export function allowStatAccum(
  directorId: string,
  uptoMonthId: string,
  results: MonthResult[],
  dirInputs: DirectorInputMap,
): number {
  const uptoIdx = results.findIndex((m) => m.id === uptoMonthId)
  if (uptoIdx < 0) return 0
  let sum = 0
  results.slice(0, uptoIdx + 1).forEach((m) => {
    sum += n(dirInputs[`${m.id}_${directorId}`]?.allowPayStat)
  })
  return r2(sum)
}

/**
 * Advance adjustment from billing-deduct-adv months up to a month inclusive:
 * the part of each flagged month's advance covered by that month's billing.
 * Displayed accumulated advance = engine accumulated + this adjustment.
 * Since 2026-07-31 the per-month deduct is computed inside calcAll (so the
 * Vr KPI offset sees the true remaining debt) — this just sums it.
 */
export function billingDeductAdjustment(
  directorId: string,
  uptoMonthId: string,
  results: MonthResult[],
): number {
  const uptoIdx = results.findIndex((m) => m.id === uptoMonthId)
  if (uptoIdx < 0) return 0
  let adj = 0
  results.slice(0, uptoIdx + 1).forEach((m) => {
    const d = m.dirRes.find((x) => x.id === directorId)
    if (d) adj += d.billingDeduct
  })
  return r2(adj)
}

// ── Contra computation (pure part of the ⚡ button) ─────────────────────────

export interface ContraResult {
  directorId: string
  code: string
  billing: number
  advance: number
  contra: number
  newBilling: number
  newAdvance: number
}

/**
 * Compute a contra run at the latest month: min(accumulated billing after
 * previous contras, |accumulated advance|) per director. Note: the HTML
 * performContra() accumulates billing WITHOUT the keyed 25% Allowance
 * Statutory (unlike the display accumulation) — preserved faithfully.
 */
export function computeContra(
  results: MonthResult[],
  directors: DpDirector[],
  dirInputs: DirectorInputMap,
  contra: DpContraEvent[],
  settings: DpSettings,
): ContraResult[] {
  if (!results.length) return []
  const lastMonth = results[results.length - 1]
  return directors.map((dir) => {
    let accumBill = 0
    results.forEach((m) => {
      if (m.fullPayout || m.includeBilling || m.billingDeductAdv) return
      const d = m.dirRes.find((x) => x.id === dir.id)
      if (!d) return
      accumBill += d.salKpiBillInv + n(dirInputs[d.statKey]?.billingStat) + d.allowBillInv
    })
    const prevContra = contra
      .filter((ev) => ev.directorId === dir.id)
      .reduce((s, ev) => s + n(ev.amount), 0)
    accumBill = r2(accumBill - prevContra)
    if (accumBill < 0) accumBill = 0

    const dd = lastMonth.dirRes.find((x) => x.id === dir.id)
    const accumAdv = dd ? dd.accumulated : 0
    const absAdv = accumAdv < 0 ? Math.abs(accumAdv) : 0
    const contraAmt = r2(Math.min(accumBill, absAdv))

    return {
      directorId: dir.id,
      code: dir.code,
      billing: accumBill,
      advance: accumAdv,
      contra: contraAmt,
      newBilling: r2(accumBill - contraAmt),
      newAdvance: r2(accumAdv + contraAmt),
    }
  })
}
