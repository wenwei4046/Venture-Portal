import { describe, it, expect } from 'vitest'
import {
  calcAll,
  allowStatTopUpBase,
  hrPayout,
  hrPayoutTotal,
  billingAccum,
  savingAccum,
  allowStatAccum,
  billingDeductAdjustment,
  computeContra,
  contraOffset,
  getFixed,
  showAllowStat,
  r2,
  type DpSettings,
  type DpDirector,
  type DpMonth,
  type DirectorInputMap,
} from './director-pool-engine'

// Default fixture mirrors the HTML tool's defaults: 4 directors whose
// weights sum to 400, RM14,400 fixed, 5% saving, 75/25 split.
const settings: DpSettings = {
  fixedSalary: 14400,
  savingPct: 5,
  gbPct: 75,
  billingStartMonthId: null,
  allowStatUntil: '2026-06-01',
}

const directors: DpDirector[] = [
  { id: 'WL', code: 'WL', name: 'WL', weight: 85, color: '#4C72B0' },
  { id: 'MK', code: 'MK', name: 'MK', weight: 94.5, color: '#DD8452' },
  { id: 'WS', code: 'WS', name: 'WS', weight: 105, color: '#55A868' },
  { id: 'WW', code: 'WW', name: 'WW', weight: 115.5, color: '#C44E52' },
]

function mkMonth(
  id: string,
  month: string,
  totals: { salary: number; kpi: number; allowance: number },
  flags: Partial<Pick<DpMonth, 'fullPayout' | 'includeBilling' | 'billingDeductAdv'>> = {},
): DpMonth {
  return {
    id,
    month,
    name: id,
    fullPayout: flags.fullPayout ?? false,
    includeBilling: flags.includeBilling ?? false,
    billingDeductAdv: flags.billingDeductAdv ?? false,
    // Single company row carrying the whole pool — the engine only uses sums.
    cos: [{ companyId: 'c1', ...totals }],
  }
}

describe('calcAll — weight split / saving / 75-25 chain', () => {
  it('computes the full chain for WS (105/400) on a 120k+10k pool', () => {
    const months = [mkMonth('m1', '2026-02-01', { salary: 100000, kpi: 20000, allowance: 10000 })]
    const [m] = calcAll(settings, directors, months, {})
    const ws = m.dirRes.find((d) => d.id === 'WS')!

    // Ratio 105/400 = 0.2625
    expect(ws.salGross).toBe(26250) // 100000 × .2625
    expect(ws.kpiGross).toBe(5250) // 20000 × .2625
    expect(ws.salKpiGross).toBe(31500)
    expect(ws.allowGross).toBe(2625)
    expect(ws.salKpiSaving).toBe(1575) // 5%
    expect(ws.salKpiBalance).toBe(29925) // 95%
    expect(ws.allowSaving).toBe(131.25)
    expect(ws.allowBalance).toBe(2493.75)
    expect(ws.totalSaving).toBe(1706.25)
    expect(ws.salKpiGB).toBe(22443.75) // 75%
    expect(ws.salKpiBillInv).toBe(7481.25) // 25%
    expect(ws.allowGB).toBe(1870.31) // r2(2493.75 × .75)
    expect(ws.allowBillInv).toBe(623.44) // r2(2493.75 × .25)
    expect(ws.totalPay).toBe(24314.06) // GB + Allow GB
    expect(ws.vrKpi).toBe(9914.06) // − 14,400 → surplus
    expect(ws.advThisMonth).toBe(0)
    expect(ws.accumulated).toBe(0)
  })

  it('pool totals reconcile across directors', () => {
    const months = [mkMonth('m1', '2026-02-01', { salary: 100000, kpi: 20000, allowance: 10000 })]
    const [m] = calcAll(settings, directors, months, {})
    expect(m.poolTotal).toBe(130000)
    const grossSum = r2(m.dirRes.reduce((s, d) => s + d.salKpiGross + d.allowGross, 0))
    expect(grossSum).toBe(130000)
  })
})

describe('allowStatTopUpBase — 75% Allowance Statutory top-up rule (2026-08-01)', () => {
  it('WW July 2026: 13,721.23 Sal+KPI GB + 1,113.89 Allow GB → base 678.77', () => {
    // Real July 2026 pool: salary 50,900 / KPI 15,793.87 / allowance 5,414.25
    const months = [
      mkMonth('jul', '2026-07-01', { salary: 50900, kpi: 15793.87, allowance: 5414.25 }),
    ]
    const [m] = calcAll(settings, directors, months, {})
    const ww = m.dirRes.find((d) => d.id === 'WW')!
    expect(ww.salKpiGB).toBe(13721.23)
    expect(ww.allowGB).toBe(1113.89)
    expect(allowStatTopUpBase(ww)).toBe(678.77) // 14,400 − 13,721.23
  })

  it('returns 0 when the Sal+KPI stream already covers the fixed salary', () => {
    expect(allowStatTopUpBase({ salKpiGB: 14400, allowGB: 1000, dirFixed: 14400 })).toBe(0)
    expect(allowStatTopUpBase({ salKpiGB: 20000, allowGB: 1000, dirFixed: 14400 })).toBe(0)
  })

  it('caps the base at the allowance 75% gross balance when the gap is bigger', () => {
    expect(allowStatTopUpBase({ salKpiGB: 12000, allowGB: 1500, dirFixed: 14400 })).toBe(1500)
  })

  it('honours a per-director fixed salary override via dirFixed', () => {
    expect(allowStatTopUpBase({ salKpiGB: 14500, allowGB: 1000, dirFixed: 15000 })).toBe(500)
  })
})

describe('calcAll — advance accumulation', () => {
  // Small pool: WL (85/400 = 0.2125) of 40,000 Sal+KPI:
  // gross 8500 → bal 8075 → GB 6056.25 → vs 14400 → advance −8343.75
  const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })

  it('books a shortfall as advance and accumulates it', () => {
    const [m] = calcAll(settings, directors, [feb], {})
    const wl = m.dirRes.find((d) => d.id === 'WL')!
    expect(wl.totalPay).toBe(6056.25)
    expect(wl.vrKpi).toBe(-8343.75)
    expect(wl.advThisMonth).toBe(-8343.75)
    expect(wl.accumulated).toBe(-8343.75)
  })

  it('offsets accumulated advance with the next surplus month', () => {
    // Mar big pool: WL gross 21250 → bal 20187.5 → GB 15140.63 → vr +740.63
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 })
    const results = calcAll(settings, directors, [feb, mar], {})
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    expect(wlMar.vrKpi).toBe(740.63)
    expect(wlMar.advanceOffset).toBe(740.63) // fully consumed by debt
    expect(wlMar.advanceSurplus).toBe(0)
    expect(wlMar.accumulated).toBe(-7603.12) // −8343.75 + 740.63
  })

  it('keyed advance statutory and 75% allow statutory add to the debt', () => {
    const inputs: DirectorInputMap = {
      m1_WL: { advStat: 500, allowPayStat: 200 },
    }
    const [m] = calcAll(settings, directors, [feb], inputs)
    const wl = m.dirRes.find((d) => d.id === 'WL')!
    expect(wl.accumulated).toBe(-9043.75) // −8343.75 − 500 − 200
  })

  it('manual override wins over the auto calculation', () => {
    const inputs: DirectorInputMap = {
      m1_WL: { advOverrideThis: -1950.79, advOverrideAccum: -1950.79, advStat: 500 },
    }
    const [m] = calcAll(settings, directors, [feb], inputs)
    const wl = m.dirRes.find((d) => d.id === 'WL')!
    expect(wl.advThisMonth).toBe(-1950.79)
    expect(wl.accumulated).toBe(-1950.79) // advStat skipped under override
    expect(wl.hasOverride).toBe(true)
  })
})

describe('calcAll — month flags', () => {
  it('full payout pays 100% of balance with no billing', () => {
    const months = [mkMonth('m1', '2026-02-01', { salary: 100000, kpi: 20000, allowance: 10000 }, { fullPayout: true })]
    const [m] = calcAll(settings, directors, months, {})
    const ws = m.dirRes.find((d) => d.id === 'WS')!
    expect(ws.salKpiGB).toBe(29925) // whole 95% balance
    expect(ws.salKpiBillInv).toBe(0)
    expect(ws.allowGB).toBe(2493.75)
    expect(ws.allowBillInv).toBe(0)
    expect(ws.totalPay).toBe(32418.75)
  })

  it('full payout never offsets prior accumulated advance', () => {
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 }, { fullPayout: true })
    const results = calcAll(settings, directors, [feb, mar], {})
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    // Mar full payout: bal 20187.5 all paid → vr +5787.5 but NO offset
    expect(wlMar.vrKpi).toBe(5787.5)
    expect(wlMar.advanceOffset).toBe(0)
    expect(wlMar.accumulated).toBe(-8343.75) // untouched
  })

  it('include billing adds the keyed statutory into Total Pay', () => {
    const months = [mkMonth('m1', '2026-02-01', { salary: 100000, kpi: 20000, allowance: 0 }, { includeBilling: true })]
    const inputs: DirectorInputMap = { m1_WS: { billingStat: 1000 } }
    const [m] = calcAll(settings, directors, months, inputs)
    const ws = m.dirRes.find((d) => d.id === 'WS')!
    expect(ws.billingUserInput).toBe(1000)
    expect(ws.totalPay).toBe(r2(ws.salKpiGB + ws.allowGB + 1000))
  })
})

describe('ledger accumulations', () => {
  const feb = mkMonth('m1', '2026-02-01', { salary: 100000, kpi: 20000, allowance: 10000 })
  const mar = mkMonth('m2', '2026-03-01', { salary: 80000, kpi: 0, allowance: 0 })
  const inputs: DirectorInputMap = {
    m1_WS: { billingStat: 900, allowBillingStat: 100, savingWithdrawal: 500, allowPayStat: 250 },
    m2_WS: { billingStat: 700 },
  }

  it('billing accumulates system + keyed statutory across months', () => {
    const results = calcAll(settings, directors, [feb, mar], inputs)
    // Feb WS: salKpiBillInv 7481.25 + stat 900 + allowBillInv 623.44 + allowStat 100 = 9104.69
    // Mar WS: gross 21000 → bal 19950 → bill 4987.5 + stat 700 = 5687.5 (no allowance)
    expect(billingAccum('WS', 'm1', results, inputs, settings)).toBe(9104.69)
    expect(billingAccum('WS', 'm2', results, inputs, settings)).toBe(14792.19)
  })

  it('billing skips full-payout / include-billing / deduct months and honours start month', () => {
    const marFp = { ...mar, fullPayout: true }
    const results = calcAll(settings, directors, [feb, marFp], inputs)
    expect(billingAccum('WS', 'm2', results, inputs, settings)).toBe(9104.69) // Mar skipped
    const startMar: DpSettings = { ...settings, billingStartMonthId: 'm2' }
    const results2 = calcAll(startMar, directors, [feb, mar], inputs)
    expect(billingAccum('WS', 'm2', results2, inputs, startMar)).toBe(5687.5) // Feb skipped
  })

  it('25% allowance statutory only counts before allow_stat_until', () => {
    const jun = mkMonth('m3', '2026-06-01', { salary: 0, kpi: 0, allowance: 10000 })
    const junInputs: DirectorInputMap = { m3_WS: { allowBillingStat: 300 } }
    const results = calcAll(settings, directors, [jun], junInputs)
    expect(showAllowStat('2026-06-01', settings)).toBe(false)
    // allowBillInv still counts (623.44), keyed 300 does not
    expect(billingAccum('WS', 'm3', results, junInputs, settings)).toBe(623.44)
  })

  it('saving accumulates minus withdrawals', () => {
    const results = calcAll(settings, directors, [feb, mar], inputs)
    // Feb WS saving 1706.25 − 500 wd = 1206.25; Mar saving 1050 → 2256.25
    expect(savingAccum('WS', 'm1', results, inputs)).toBe(1206.25)
    expect(savingAccum('WS', 'm2', results, inputs)).toBe(2256.25)
  })

  it('allow statutory accumulates keyed values', () => {
    const results = calcAll(settings, directors, [feb, mar], inputs)
    expect(allowStatAccum('WS', 'm2', results, inputs)).toBe(250)
  })
})

describe('contra', () => {
  // WL under-earns → advance; billing accumulates → contra offsets the two
  const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
  const mar = mkMonth('m2', '2026-03-01', { salary: 40000, kpi: 0, allowance: 0 })

  it('computes min(billing, |advance|) per director', () => {
    const results = calcAll(settings, directors, [feb, mar], {})
    const out = computeContra(results, directors, {}, [], settings)
    const wl = out.find((c) => c.code === 'WL')!
    // Per month: bill 2018.75, advance −8343.75 → billing 4037.5, adv −16687.5
    expect(wl.billing).toBe(4037.5)
    expect(wl.advance).toBe(-16687.5)
    expect(wl.contra).toBe(4037.5)
    expect(wl.newBilling).toBe(0)
    expect(wl.newAdvance).toBe(-12650)
  })

  it('a second contra run subtracts previous contra events', () => {
    const results = calcAll(settings, directors, [feb, mar], {})
    const events = [{ directorId: 'WL', amount: 4037.5, fromMonthId: 'm2' }]
    const out = computeContra(results, directors, {}, events, settings)
    const wl = out.find((c) => c.code === 'WL')!
    expect(wl.billing).toBe(0) // fully consumed by the previous run
    expect(wl.contra).toBe(0)
  })

  it('contraOffset applies from its from-month onwards only', () => {
    const results = calcAll(settings, directors, [feb, mar], {})
    const events = [{ directorId: 'WL', amount: 1000, fromMonthId: 'm2' }]
    expect(contraOffset('WL', 'm1', results, events)).toBe(0)
    expect(contraOffset('WL', 'm2', results, events)).toBe(1000)
  })
})

describe('billing-deduct-adv display adjustment', () => {
  it('covers the flagged month advance up to that month billing', () => {
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [feb], {})
    // WL advance 8343.75, billing row total 2018.75 → adjustment 2018.75
    expect(billingDeductAdjustment('WL', 'm1', results)).toBe(2018.75)
    expect(results[0].dirRes.find((d) => d.id === 'WL')!.billingDeduct).toBe(2018.75)
  })

  // User ruling 2026-07-31 (WW July): debt already repaid by billing deducts
  // must not be collected again by a later positive Vr KPI.
  it('a later Vr KPI surplus does not re-collect billing-repaid debt', () => {
    // WL feb: shortfall 3044.53, billing 3785.16 covers it fully (deduct
    // 3044.53) → true remaining debt 0 although the raw accumulated is −3044.53.
    const feb = mkMonth('m1', '2026-02-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 })
    const results = calcAll(settings, directors, [feb, mar], {})
    const wlFeb = results[0].dirRes.find((d) => d.id === 'WL')!
    expect(wlFeb.billingDeduct).toBe(3044.53)
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    expect(wlMar.vrKpi).toBe(740.63)
    expect(wlMar.advanceOffset).toBe(0) // nothing left to offset
    // Displayed accumulated (raw + adjustment) stays cleared.
    expect(r2(wlMar.accumulated + billingDeductAdjustment('WL', 'm2', results))).toBe(0)
  })

  it('keyed statutory is paid from the Vr KPI surplus, not added to debt', () => {
    const feb = mkMonth('m1', '2026-02-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 })
    const inputs: DirectorInputMap = { m2_WL: { advStat: 500 } }
    const results = calcAll(settings, directors, [feb, mar], inputs)
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    // Surplus 740.63 covers the 500 statutory in full → debt untouched.
    expect(wlMar.statFromSurplus).toBe(500)
    expect(r2(wlMar.accumulated + billingDeductAdjustment('WL', 'm2', results))).toBe(0)
  })

  it('statutory beyond the surplus still becomes debt', () => {
    const feb = mkMonth('m1', '2026-02-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 })
    const inputs: DirectorInputMap = { m2_WL: { advStat: 1000 } }
    const results = calcAll(settings, directors, [feb, mar], inputs)
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    // Surplus 740.63 covers part; the remaining 259.37 adds to the debt.
    expect(wlMar.statFromSurplus).toBe(740.63)
    expect(r2(wlMar.accumulated + billingDeductAdjustment('WL', 'm2', results))).toBe(-259.37)
  })

  // User ruling 2026-08-03 (WL July): billing left over after covering this
  // month's additions pays down the OLD accumulated advance too.
  it('leftover billing repays old accumulated advance', () => {
    // Feb (unflagged): WL debt −8343.75. Mar (flagged): additions 3044.53,
    // billing 3785.16 → deduct the full 3785.16 (3044.53 this month +
    // 740.63 off the old debt), not just this month's additions.
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
    const mar = mkMonth('m2', '2026-03-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [feb, mar], {})
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    expect(wlMar.vrKpi).toBe(-3044.53)
    expect(wlMar.billingDeduct).toBe(3785.16)
    // Displayed accumulated: −8343.75 − 3044.53 + 3785.16 = −7603.12
    expect(r2(wlMar.accumulated + billingDeductAdjustment('WL', 'm2', results))).toBe(-7603.12)
  })

  it('a flagged month with no new advance still repays old debt from billing', () => {
    // Feb (unflagged): debt −8343.75. Mar (flagged): vr +740.63 offsets first,
    // then the whole 5046.88 billing goes to the remaining old debt.
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
    const mar = mkMonth('m2', '2026-03-01', { salary: 100000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [feb, mar], {})
    const wlMar = results[1].dirRes.find((d) => d.id === 'WL')!
    expect(wlMar.advanceOffset).toBe(740.63)
    expect(wlMar.billingDeduct).toBe(5046.88)
    // −8343.75 + 740.63 + 5046.88 = −2556.24
    expect(r2(wlMar.accumulated + billingDeductAdjustment('WL', 'm2', results))).toBe(-2556.24)
  })

  it('a later Vr KPI surplus still sees the billing-repaid old debt', () => {
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
    const mar = mkMonth('m2', '2026-03-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const apr = mkMonth('m3', '2026-04-01', { salary: 100000, kpi: 0, allowance: 0 })
    const results = calcAll(settings, directors, [feb, mar, apr], {})
    const wlApr = results[2].dirRes.find((d) => d.id === 'WL')!
    // True debt after Mar = −7603.12; Apr surplus 740.63 offsets, no re-collect.
    expect(wlApr.advanceOffset).toBe(740.63)
    expect(r2(wlApr.accumulated + billingDeductAdjustment('WL', 'm3', results))).toBe(-6862.49)
  })
})

describe('billingAccum — net accumulation for deduct months (user ruling 2026-08-03, option 2)', () => {
  it('a flagged month before 2026-07 is consumed whole (legacy — June stays settled)', () => {
    // WL Feb: billing 3785.16, deduct only 3044.53 — but the month is before
    // the cutoff, so NONE of it accumulates.
    const feb = mkMonth('m1', '2026-02-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [feb], {})
    expect(results[0].dirRes.find((d) => d.id === 'WL')!.billingDeduct).toBe(3044.53)
    expect(billingAccum('WL', 'm1', results, {}, settings)).toBe(0)
  })

  it('a flagged month from 2026-07 accumulates the net after deduct', () => {
    // Same pool in July: deduct 3044.53 of the 3785.16 billing → net 740.63
    // stays owed to the director.
    const jul = mkMonth('m1', '2026-07-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [jul], {})
    expect(results[0].dirRes.find((d) => d.id === 'WL')!.billingDeduct).toBe(3044.53)
    expect(billingAccum('WL', 'm1', results, {}, settings)).toBe(740.63)
  })

  it('a fully-consumed flagged month from 2026-07 contributes nothing', () => {
    // Old debt exceeds billing → deduct = whole billing → net 0.
    const feb = mkMonth('m1', '2026-02-01', { salary: 40000, kpi: 0, allowance: 0 })
    const jul = mkMonth('m2', '2026-07-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [feb, jul], {})
    expect(results[1].dirRes.find((d) => d.id === 'WL')!.billingDeduct).toBe(3785.16)
    // Feb (unflagged) still accumulates its 2018.75; July nets to 0.
    expect(billingAccum('WL', 'm2', results, {}, settings)).toBe(2018.75)
  })

  it('computeContra sees the same net billing', () => {
    const jul = mkMonth('m1', '2026-07-01', { salary: 75000, kpi: 0, allowance: 0 }, { billingDeductAdv: true })
    const results = calcAll(settings, directors, [jul], {})
    const wl = computeContra(results, directors, {}, [], settings).find((c) => c.code === 'WL')!
    expect(wl.billing).toBe(740.63)
  })
})

describe('fixed salary overrides', () => {
  it('applies from the override month onwards', () => {
    const ovs = [{ directorId: 'WL', fromMonth: '2026-05-01', salary: 16000 }]
    expect(getFixed('WL', '2026-04-01', 14400, ovs)).toBe(14400)
    expect(getFixed('WL', '2026-05-01', 14400, ovs)).toBe(16000)
    expect(getFixed('WL', '2026-07-01', 14400, ovs)).toBe(16000)
    expect(getFixed('WS', '2026-07-01', 14400, ovs)).toBe(14400)
  })

  it('the latest applicable override wins', () => {
    const ovs = [
      { directorId: 'WL', fromMonth: '2026-03-01', salary: 15000 },
      { directorId: 'WL', fromMonth: '2026-06-01', salary: 17000 },
    ]
    expect(getFixed('WL', '2026-04-01', 14400, ovs)).toBe(15000)
    expect(getFixed('WL', '2026-06-01', 14400, ovs)).toBe(17000)
  })
})
describe('excludeFromPay — allowance transferred after the payout (2026-09-18)', () => {
  // HV pays its allowance on the 15th, after the month's payout has gone out.
  // It is pooled, saved and split like any allowance, but must not feed Total
  // Pay — so it can never repay an advance the main payout already settled.
  const mkSplit = (normalAllow: number, hvAllow: number): DpMonth => ({
    id: 'm1',
    month: '2026-08-01',
    name: 'Aug',
    fullPayout: false,
    includeBilling: false,
    billingDeductAdv: false,
    cos: [
      { companyId: 'others', salary: 60900, kpi: 0, allowance: normalAllow },
      { companyId: 'hv', salary: 0, kpi: 0, allowance: hvAllow, excludeFromPay: true },
    ],
  })

  it('leaves Total Pay, Vr KPI and advance exactly as if HV had paid nothing', () => {
    const [without] = calcAll(settings, directors, [mkSplit(8058.15, 0)], {})
    const [withHv] = calcAll(settings, directors, [mkSplit(8058.15, 20429.36)], {})
    for (const d of withHv.dirRes) {
      const base = without.dirRes.find((x) => x.code === d.code)!
      expect(d.totalPay).toBe(base.totalPay)
      expect(d.vrKpi).toBe(base.vrKpi)
      expect(d.advThisMonth).toBe(base.advThisMonth)
      expect(d.accumulated).toBe(base.accumulated)
    }
  })

  it('still pools, saves and 75/25-splits the excluded allowance', () => {
    const [m] = calcAll(settings, directors, [mkSplit(8058.15, 20429.36)], {})
    expect(m.poolAllow).toBe(28487.51)
    const ws = m.dirRes.find((d) => d.code === 'WS')!
    // 105/400 of the whole allowance pool, saved and split as usual
    expect(ws.allowGross).toBe(7477.97)
    expect(ws.allowSaving).toBe(373.9)
    expect(ws.allowGB).toBe(5328.05)
    expect(ws.allowBillInv).toBe(1776.02)
    // …of which HV's slice is the remainder once the in-pay slice is taken
    expect(ws.allowExcl.gb).toBe(3820.92)
    expect(r2(ws.salKpiGB + r2(ws.allowGB - ws.allowExcl.gb))).toBe(ws.totalPay)
  })

  it('keeps the excluded slice out of the 75% top-up statutory base', () => {
    const [m] = calcAll(settings, directors, [mkSplit(8058.15, 20429.36)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    const inPayAllow = r2(wl.allowGB - wl.allowExcl.gb)
    // Gap to the fixed salary exceeds the in-pay allowance, so the base is
    // that allowance alone — HV's slice must not inflate it.
    expect(r2(wl.dirFixed - wl.salKpiGB)).toBeGreaterThan(inPayAllow)
    expect(allowStatTopUpBase(wl)).toBe(inPayAllow)
  })

  it('behaves exactly as before when no company is flagged', () => {
    const plain = [mkMonth('m1', '2026-08-01', { salary: 60900, kpi: 0, allowance: 28487.51 })]
    const [a] = calcAll(settings, directors, plain, {})
    for (const d of a.dirRes) {
      expect(d.allowExcl.gb).toBe(0)
      expect(d.totalPay).toBe(r2(d.salKpiGB + d.allowGB))
    }
  })
})

describe('allowExclFullPayout — HV pays out 100%, bills nothing (2026-09-18)', () => {
  const mk = (hvFull: boolean): DpMonth => ({
    id: 'm1',
    month: '2026-08-01',
    name: 'Aug',
    fullPayout: false,
    includeBilling: false,
    billingDeductAdv: false,
    allowExclFullPayout: hvFull,
    cos: [
      { companyId: 'others', salary: 60900, kpi: 0, allowance: 8058.15 },
      { companyId: 'hv', salary: 0, kpi: 0, allowance: 20429.36, excludeFromPay: true },
    ],
  })

  it('hands the director the whole 95% balance and bills none of it', () => {
    const [m] = calcAll(settings, directors, [mk(true)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    const mkd = m.dirRes.find((d) => d.code === 'MK')!
    expect(wl.allowExcl.gb).toBe(4124.18)
    expect(wl.allowExcl.gb).toBe(wl.allowExcl.balance)
    expect(mkd.allowExcl.gb).toBe(4585.11)
    expect(m.dirRes.every((d) => d.allowExcl.billInv === 0)).toBe(true)
  })

  it('drops the excluded slice out of the 25% invoice', () => {
    const split = calcAll(settings, directors, [mk(false)], {})[0]
    const full = calcAll(settings, directors, [mk(true)], {})[0]
    const sum = (r: typeof split) => r2(r.dirRes.reduce((s, d) => s + d.salKpiBillInv + d.allowBillInv, 0))
    // 23,394.35 − keyed statutory (2,164.80) = 21,229.55 system-calculated
    expect(sum(split)).toBe(21229.55)
    // …of which HV's 4,851.97 disappears when it pays out in full
    expect(sum(full)).toBe(r2(21229.55 - 4851.97))
  })

  it('still keeps Total Pay, Vr KPI and advance untouched either way', () => {
    const split = calcAll(settings, directors, [mk(false)], {})[0]
    const full = calcAll(settings, directors, [mk(true)], {})[0]
    for (const d of full.dirRes) {
      const base = split.dirRes.find((x) => x.code === d.code)!
      expect(d.totalPay).toBe(base.totalPay)
      expect(d.vrKpi).toBe(base.vrKpi)
      expect(d.accumulated).toBe(base.accumulated)
    }
  })

  it('adds the bigger payout into the pooled 75% Allowance column', () => {
    const split = calcAll(settings, directors, [mk(false)], {})[0]
    const full = calcAll(settings, directors, [mk(true)], {})[0]
    const pooled = (r: typeof split) => r2(r.dirRes.reduce((s, d) => s + d.allowGB, 0))
    expect(pooled(split)).toBe(20297.35)
    expect(pooled(full)).toBe(r2(5741.44 + 19407.89))
  })
})

describe('billing-deduct months leave the separate transfer alone (2026-09-18)', () => {
  // The whole HV transfer — 75% payout AND its 25% invoice — must stay out of
  // the advance. A billing-deduct month repays from the 25% billing total, so
  // HV's slice has to be excluded there too.
  const mk = (hv: number): DpMonth => ({
    id: 'm1',
    month: '2026-08-01',
    name: 'Aug',
    fullPayout: false,
    includeBilling: false,
    billingDeductAdv: true,
    cos: [
      { companyId: 'others', salary: 60900, kpi: 0, allowance: 8058.15 },
      { companyId: 'hv', salary: 0, kpi: 0, allowance: hv, excludeFromPay: true },
    ],
  })

  it('repays exactly the same amount whether or not HV paid', () => {
    const without = calcAll(settings, directors, [mk(0)], {})[0]
    const withHv = calcAll(settings, directors, [mk(20429.36)], {})[0]
    for (const d of withHv.dirRes) {
      const base = without.dirRes.find((x) => x.code === d.code)!
      expect(d.billingDeduct).toBe(base.billingDeduct)
      expect(d.accumulated).toBe(base.accumulated)
    }
  })

  it('still bills HV’s 25% — it just does not repay the advance', () => {
    const withHv = calcAll(settings, directors, [mk(20429.36)], {})[0]
    const billed = r2(withHv.dirRes.reduce((s, d) => s + d.allowBillInv, 0))
    const hvSlice = r2(withHv.dirRes.reduce((s, d) => s + d.allowExcl.billInv, 0))
    expect(hvSlice).toBe(4851.97)
    expect(billed).toBe(r2(1913.82 + 4851.97))
  })
})

describe('hrPayout — what HR actually transfers (2026-09-18)', () => {
  const mk = (hv: number, hvFull: boolean): DpMonth => ({
    id: 'm1',
    month: '2026-08-01',
    name: 'Aug',
    fullPayout: false,
    includeBilling: false,
    billingDeductAdv: false,
    allowExclFullPayout: hvFull,
    cos: [
      { companyId: 'others', salary: 60900, kpi: 0, allowance: 8058.15 },
      { companyId: 'hv', salary: 0, kpi: 0, allowance: hv, excludeFromPay: true },
    ],
  })

  it('tops a short month up to the fixed salary when nothing else is paid', () => {
    const [m] = calcAll(settings, directors, [mk(0, false)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    expect(wl.totalPay).toBe(10440.7)
    expect(wl.advThisMonth).toBe(-3959.3)
    expect(hrPayout(wl)).toBe(14400)
  })

  it('keeps the first transfer at the fixed salary and totals the two', () => {
    const [m] = calcAll(settings, directors, [mk(20429.36, true)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    expect(wl.allowExcl.gb).toBe(4124.18)
    expect(hrPayout(wl)).toBe(14400)
    expect(hrPayoutTotal(wl)).toBe(r2(14400 + 4124.18))
  })

  it('uses the 75% slice when HV is not on full payout', () => {
    const [m] = calcAll(settings, directors, [mk(20429.36, false)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    expect(wl.allowExcl.gb).toBe(3093.13)
    expect(hrPayout(wl)).toBe(14400)
    expect(hrPayoutTotal(wl)).toBe(r2(14400 + 3093.13))
  })
})

describe('allowInPay / allowExcl split cleanly (2026-09-18)', () => {
  const mk = (hv: number, hvFull: boolean): DpMonth => ({
    id: 'm1',
    month: '2026-08-01',
    name: 'Aug',
    fullPayout: false,
    includeBilling: false,
    billingDeductAdv: false,
    allowExclFullPayout: hvFull,
    cos: [
      { companyId: 'others', salary: 60900, kpi: 0, allowance: 8058.15 },
      { companyId: 'hv', salary: 0, kpi: 0, allowance: hv, excludeFromPay: true },
    ],
  })

  it('each slice adds back up to the pooled allowance columns', () => {
    const [m] = calcAll(settings, directors, [mk(20429.36, true)], {})
    for (const d of m.dirRes) {
      expect(r2(d.allowInPay.gross + d.allowExcl.gross)).toBe(d.allowGross)
      expect(r2(d.allowInPay.saving + d.allowExcl.saving)).toBe(d.allowSaving)
      expect(r2(d.allowInPay.balance + d.allowExcl.balance)).toBe(d.allowBalance)
      expect(r2(d.allowInPay.gb + d.allowExcl.gb)).toBe(d.allowGB)
      expect(r2(d.allowInPay.billInv + d.allowExcl.billInv)).toBe(d.allowBillInv)
    }
  })

  it('splits WL’s Aug allowance into the two transfers', () => {
    const [m] = calcAll(settings, directors, [mk(20429.36, true)], {})
    const wl = m.dirRes.find((d) => d.code === 'WL')!
    // 月头: 8,058.15 × 85/400, saved and split 75/25
    expect(wl.allowInPay).toEqual({
      gross: 1712.36,
      saving: 85.62,
      balance: 1626.74,
      gb: 1220.06,
      billInv: 406.69,
    })
    // 15号: HV's own slice, paid out in full so nothing is billed
    expect(wl.allowExcl).toEqual({
      gross: 4341.24,
      saving: 217.06,
      balance: 4124.18,
      gb: 4124.18,
      billInv: 0,
    })
  })

  it('puts everything in allowInPay when no company transfers separately', () => {
    const plain = [mkMonth('m1', '2026-08-01', { salary: 60900, kpi: 0, allowance: 8058.15 })]
    const [m] = calcAll(settings, directors, plain, {})
    for (const d of m.dirRes) {
      expect(d.allowInPay.gross).toBe(d.allowGross)
      expect(d.allowInPay.gb).toBe(d.allowGB)
      expect(d.allowExcl.gross).toBe(0)
    }
  })
})
