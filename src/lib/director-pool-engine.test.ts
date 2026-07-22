import { describe, it, expect } from 'vitest'
import {
  calcAll,
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
    expect(billingDeductAdjustment('WL', 'm1', results, {}, settings)).toBe(2018.75)
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
