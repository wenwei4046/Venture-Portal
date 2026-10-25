import { describe, expect, it } from 'vitest'
import {
  adsCard, adsEventText, adsPageFromRow, adsPatch, adsPatchOf, adsPeriod, adsPeriods, adsRows, adsValues, adsValuesOf, choicesFromRow,
  draftOf, draftProblems, figureText, lastChoices, metaSum, NO_TARGETS, reportCards, reportDay, reportDays, reportRange, setupFromRow, targetOf,
  typedValues, valueText, type AdsSetup,
} from './ads'

// 2026-10-25 — a project's Ads report (the user's answer 57: from the CRM's Ads Performance; each Ads project picks its
// own ads; its cadence and its figures set by the Ads person, who publishes it to the PIC's link; an ad not in the CRM
// keeps typed figures). What the database keeps and refuses is validate-marketing-ads-reports.mjs's.

const SETUP: AdsSetup = {
  ads: ['120210000000000001', '120210000000000002'], every: '2w', startsOn: '2026-10-06',
  figures: ['spendToDate', 'cpl', 'appt', 'roas'], targets: { budget: 6000, cpl: 20, roas: 3, apptRate: 25 }, lastNo: null,
}

describe('its periods', () => {
  it('runs by its cadence from its first day — a month’s from the same day, the 31st on a shorter month’s last', () => {
    expect(adsPeriod('2w', '2026-10-06', 1)).toEqual({ no: 1, from: '2026-10-06', until: '2026-10-19' })
    expect(adsPeriod('2w', '2026-10-06', 2)).toEqual({ no: 2, from: '2026-10-20', until: '2026-11-02' })
    expect(adsPeriod('1w', '2026-10-06', 3)).toEqual({ no: 3, from: '2026-10-20', until: '2026-10-26' })
    expect(adsPeriod('4w', '2026-10-06', 2)).toEqual({ no: 2, from: '2026-11-03', until: '2026-11-30' })
    expect([1, 2, 3].map(n => adsPeriod('1m', '2026-01-31', n))).toEqual([
      { no: 1, from: '2026-01-31', until: '2026-02-27' },
      { no: 2, from: '2026-02-28', until: '2026-03-30' },
      { no: 3, from: '2026-03-31', until: '2026-04-29' },
    ])
  })

  it('lists them to the one today is in, the newest first — none before its first day', () => {
    expect(adsPeriods('2w', '2026-10-06', '2026-10-25').map(p => p.no)).toEqual([2, 1])
    expect(adsPeriods('2w', '2026-10-06', '2026-10-05')).toEqual([])
    expect(adsPeriods('1w', '2026-01-01', '2026-12-31', 3).map(p => p.no)).toEqual([53, 52, 51])
  })

  it('says its days in short words', () => {
    expect([reportRange({ from: '2026-10-06', until: '2026-10-19' }), reportRange({ from: '2026-10-20', until: '2026-11-02' }),
      reportRange({ from: '2026-12-29', until: '2027-01-11' })]).toEqual(['6 – 19 Oct', '20 Oct – 2 Nov', '29 Dec 2026 – 11 Jan 2027'])
  })

  it('pairs each with its report — due once over and not published, never the one running', () => {
    const page = adsPageFromRow({ today: '2026-10-25', link: true, setup: { ...SETUP }, reports: [
      { no: 1, from: '2026-10-06', until: '2026-10-19', values: { spendToDate: 1410, cpl: 22.1 }, targets: { cpl: 20 }, note: 'First', by: 'Wei Lun', at: '2026-10-20T02:00:00Z' },
    ] })
    expect(page.setup?.every).toBe('2w')
    expect(adsRows(page.setup as AdsSetup, page.reports, '2026-10-25').map(r => [r.no, !!r.report, r.due])).toEqual([[2, false, false], [1, true, false]])
    expect(adsRows(SETUP, [], '2026-11-03').map(r => [r.no, r.due])).toEqual([[3, false], [2, true], [1, true]])
  })

  it('stops at its last report (⑤-3c) — none after it, however long after', () => {
    expect(adsPeriods('2w', '2026-10-06', '2027-03-01', 60, 3).map(p => p.no)).toEqual([3, 2, 1])
    expect(adsRows({ ...SETUP, lastNo: 2 }, [], '2026-12-01').map(r => [r.no, r.due])).toEqual([[2, true], [1, true]])
    expect(adsPeriods('2w', '2026-10-06', '2026-10-25', 60, 3).map(p => p.no)).toEqual([2, 1])
  })

  it('puts each Report day the day after its period’s last — to its last report, else a year on', () => {
    expect(reportDay({ until: '2026-11-02' })).toBe('2026-11-03')
    expect(reportDays('2w', '2026-10-06', 3, '2026-10-25').map(r => `#${r.no} ${r.day}`)).toEqual(['#1 2026-10-20', '#2 2026-11-03', '#3 2026-11-17'])
    const monthly = reportDays('1m', '2026-10-01', null, '2026-10-25')
    expect([monthly.length, monthly[0].day, monthly.at(-1)?.day]).toEqual([12, '2026-11-01', '2027-10-01'])
    // Begun long ago: its days from the first.
    expect(reportDays('4w', '2026-01-05', null, '2026-10-25')[0]).toEqual({ no: 1, from: '2026-01-05', until: '2026-02-01', day: '2026-02-02' })
  })

  it('offers a year of its periods to pick the last from — as far as one already out', () => {
    const two = lastChoices('2w', '2026-10-06')
    expect([two.length, two[0].label, two[1].label, two[6].label, two[7].label]).toEqual(
      [26, '#1 · 6 – 19 Oct', '#2 · 20 Oct – 2 Nov', '#7 · 29 Dec 2026 – 11 Jan 2027', '#8 · 12 – 25 Jan 2027'])
    expect([lastChoices('1w', '2026-10-06').length, lastChoices('4w', '2026-10-06').length, lastChoices('1m', '2026-10-06').length]).toEqual([52, 13, 12])
    expect(lastChoices('1m', '2026-10-06', 30).length).toBe(30)
    expect(lastChoices('2w', '')).toEqual([])
  })
})

describe('its figures', () => {
  const crm = { leads: 176, appt: 46, showup: 30, won: 9, wonAmount: 10368 }
  const meta = { spend: 3240, impr: 120000, reach: 54000, clicks: 2400, msgconv: 180 }

  it('built from what the CRM counts and what Meta says — none where what it needs is missing', () => {
    const v = adsValues(crm, meta, 3240)
    expect([v.cpl, v.apptRate, v.cpa, v.showRate, v.winRate, v.roas, v.ctr, v.cpmsg].map(x => (x == null ? x : Math.round(x * 100) / 100)))
      .toEqual([18.41, 26.14, 70.43, 65.22, 5.11, 3.2, 2, 18])
    const noMeta = adsValues(crm, null, null)
    expect([noMeta.spend, noMeta.cpl, noMeta.roas, noMeta.leads, noMeta.apptRate === null]).toEqual([null, null, null, 176, false])
    expect(adsValues({ ...crm, leads: 0, appt: 0 }, meta, null).cpl).toBeNull()
    expect(metaSum([meta, null, { ...meta, spend: 10 }])?.spend).toBe(3250)
    expect(metaSum([null, undefined])).toBeNull()
  })

  it('written as the handoff writes them', () => {
    expect([figureText('spendToDate', 3240.4), figureText('cpl', 18.4), figureText('appt', 46), figureText('apptRate', 26.14),
      figureText('roas', 3.2), figureText('impr', 120000), figureText('cpl', null)]).toEqual(['RM 3,240', 'RM 18.40', '46', '26.1%', '3.2', '120,000', '—'])
  })

  it('read against its target — the handoff’s four cards', () => {
    const v = { spendToDate: 3240, cpl: 18.4, appt: 46, apptRate: 26, roas: 3.2 }
    expect(['spendToDate', 'cpl', 'appt', 'roas'].map(k => adsCard(k as 'cpl', v, SETUP.targets)).map(c => [c.label, c.value, c.sub, c.tone])).toEqual([
      ['Spend so far', 'RM 3,240', 'of RM 6,000 budget', 'muted'],
      ['Cost per lead', 'RM 18.40', 'Target RM 20 · on target', 'good'],
      ['Appointments', '46', 'Appointment rate 26%', 'good'],
      ['ROAS', '3.2', 'Min 3.0 · on target', 'good'],
    ])
    const off = { cpl: 22.1, appt: 17, apptRate: 21, roas: 2.7 }
    expect(['cpl', 'appt', 'roas', 'apptRate'].map(k => adsCard(k as 'cpl', off, SETUP.targets)).map(c => [c.sub, c.tone])).toEqual([
      ['Target RM 20 · above', 'bad'], ['Appointment rate 21%', 'muted'], ['Min 3.0 · below', 'bad'], ['Target 25% · below', 'bad'],
    ])
    expect(adsCard('cpl', { cpl: 18.4 }, NO_TARGETS)).toEqual({ key: 'cpl', label: 'Cost per lead', value: 'RM 18.40', sub: '', tone: 'muted' })
    expect(adsCard('cpl', {}, SETUP.targets).sub).toBe('Target RM 20')
  })

  it('lays a published report’s cards out in its setup’s order — a figure since taken off last', () => {
    const r = { values: { roas: 3.2, leads: 40, spendToDate: 3240, cpl: 18.4 }, targets: SETUP.targets }
    expect(reportCards(r, SETUP.figures).map(c => c.label)).toEqual(['Spend so far', 'Cost per lead', 'ROAS', 'Leads'])
  })
})

describe('setting it up', () => {
  it('starts every two weeks from today on the handoff’s four, no ads', () => {
    expect(draftOf(null, '2026-10-25')).toEqual({ ads: [], every: '2w', startsOn: '2026-10-25', figures: ['spendToDate', 'cpl', 'appt', 'roas'],
      targets: { budget: '', cpl: '', roas: '', apptRate: '' }, lastNo: null })
  })

  it('takes targets as numbers from 0 — an appointment rate at most 100', () => {
    expect([targetOf('budget', '6,000'), targetOf('cpl', ' 20.5 '), targetOf('roas', ''), targetOf('apptRate', '101'), targetOf('cpl', 'abc'), targetOf('cpl', '-1')])
      .toEqual([6000, 20.5, null, undefined, undefined, undefined])
    const d = draftOf(SETUP, '2026-10-25')
    expect(draftProblems({ ...d, figures: [], targets: { ...d.targets, apptRate: '120' } })).toEqual([
      'Pick at least one figure.', 'An appointment rate is a number from 0 to 100.'])
    expect(draftProblems(d)).toEqual([])
  })

  it('sends a new one in full, else only what changed — a target taken off as null', () => {
    const fresh = draftOf(null, '2026-10-25')
    expect(adsPatch(null, { ...fresh, ads: ['2', '1', '2'] })).toEqual({ ads: ['1', '2'], every: '2w', startsOn: '2026-10-25',
      figures: ['spendToDate', 'cpl', 'appt', 'roas'], targets: { budget: null, cpl: null, roas: null, apptRate: null } })
    const d = draftOf(SETUP, '2026-10-25')
    expect(adsPatch(SETUP, d)).toBeNull()
    expect(adsPatch(SETUP, { ...d, ads: [...SETUP.ads].reverse() })).toBeNull()
    expect(adsPatch(SETUP, { ...d, every: '1m', figures: ['cpl', 'roas'], targets: { ...d.targets, cpl: '18', budget: '' } }))
      .toEqual({ every: '1m', figures: ['cpl', 'roas'], targets: { budget: null, cpl: 18 } })
    expect(adsPatchOf({ ads: ['1', 2], every: 'daily', startsOn: '2026-10-25T00:00', figures: ['cpl', 'nope'], targets: { cpl: '18', roas: 3, budget: null }, x: 1 }))
      .toEqual({ ads: ['1'], startsOn: '2026-10-25', figures: ['cpl'], targets: { roas: 3, budget: null } })
    expect(adsPatchOf('x')).toBeNull()
  })

  it('its last report (⑤-3c): sent with a new one only when picked; changed, or taken off as null', () => {
    const fresh = draftOf(null, '2026-10-25')
    expect(adsPatch(null, fresh)).not.toHaveProperty('lastNo')
    expect(adsPatch(null, { ...fresh, lastNo: 3 })).toMatchObject({ lastNo: 3 })
    const d = draftOf({ ...SETUP, lastNo: 3 }, '2026-10-25')
    expect(d.lastNo).toBe(3)
    expect(adsPatch({ ...SETUP, lastNo: 3 }, d)).toBeNull()
    expect(adsPatch({ ...SETUP, lastNo: 3 }, { ...d, lastNo: 5 })).toEqual({ lastNo: 5 })
    expect(adsPatch({ ...SETUP, lastNo: 3 }, { ...d, lastNo: null })).toEqual({ lastNo: null })
    expect([adsPatchOf({ lastNo: 4 }), adsPatchOf({ lastNo: null })]).toEqual([{ lastNo: 4 }, { lastNo: null }])
    expect([adsPatchOf({ lastNo: 0 }), adsPatchOf({ lastNo: 2.5 }), adsPatchOf({ lastNo: '3' }), adsPatchOf({ lastNo: 1001 })]).toEqual([null, null, null, null])
    expect([setupFromRow({ ...SETUP, lastNo: 4 })?.lastNo, setupFromRow({ ...SETUP, lastNo: 'x' })?.lastNo, setupFromRow({ ...SETUP, lastNo: undefined })?.lastNo])
      .toEqual([4, null, null])
    expect(adsEventText('Mei', 'ads changed', { what: ['lastNo', 'targets'] })).toBe('Mei changed the Ads report · its last report, its targets')
  })
})

describe('publishing a period', () => {
  it('starts each value from the worked-out figure — money to the sen, a rate a tenth, a count whole; typed numbers from 0, an empty one none', () => {
    expect([valueText('spend', 3240.4), valueText('cpl', 18.4091), valueText('apptRate', 26.136), valueText('roas', 3.2), valueText('leads', null)])
      .toEqual(['3240.4', '18.41', '26.1', '3.2', ''])
    expect([valueText('spendToDate', 1234.567), valueText('wonAmount', 8800), valueText('impr', 15078.4)]).toEqual(['1234.57', '8800', '15078'])
    expect(typedValues(['spend', 'cpl', 'apptRate', 'roas'], { spend: 'RM 3,240', cpl: '18.41', apptRate: '26%', roas: '' }))
      .toEqual({ spend: 3240, cpl: 18.41, apptRate: 26, roas: null })
    expect(typedValues(['cpl'], { cpl: '-3' })).toBeUndefined()
    expect(adsValuesOf({ cpl: 18.4, roas: null, leads: -1, nope: 3, spend: 'x' })).toEqual({ cpl: 18.4, roas: null })
    expect(adsValuesOf({ nope: 1 })).toBeNull()
  })

  // Production, 11 – 24 Oct, two Carres ads: Meta's spend started the window whole (`517`) and was kept so, while the
  // cost per lead beside it was worked out from Meta's own figure — 517 ÷ 12 leads is not the 43.06 the report kept.
  it('keeps Meta’s spend to the sen, so the cost per lead kept beside it is worked out from what is kept', () => {
    const values = adsValues({ leads: 12, appt: 0, showup: 0, won: 0, wonAmount: 0 }, { spend: 516.74, impr: 15078, reach: 9100, clicks: 56, msgconv: 10 }, 516.74)
    const figures = ['spendToDate', 'spend', 'cpl', 'cpmsg'] as const
    const typed = Object.fromEntries(figures.map(k => [k, valueText(k, values[k])]))
    expect(typed).toEqual({ spendToDate: '516.74', spend: '516.74', cpl: '43.06', cpmsg: '51.67' })
    const kept = typedValues(figures, typed)!
    expect(kept.cpl).toBe(Math.round((kept.spend! / 12) * 100) / 100)
    expect(kept.cpmsg).toBe(Math.round((kept.spend! / 10) * 100) / 100)
    expect(figures.map(k => figureText(k, kept[k]))).toEqual(['RM 517', 'RM 517', 'RM 43.06', 'RM 51.67'])
  })
})

describe('the CRM’s ads and the trail', () => {
  it('reads the ads to pick — a real ad id each, its name else its id', () => {
    expect(choicesFromRow([
      { id: '120210000000000001', name: ' Raya rental ', page: 'The Conts', status: 'ACTIVE', leads: 34, hidden: false },
      { id: '5261000000000', name: null, page: null, status: null, leads: '2', hidden: true },
      { id: 'abc', name: 'x' }, null,
    ])).toEqual([
      { id: '120210000000000001', name: 'Raya rental', page: 'The Conts', status: 'ACTIVE', leads: 34, hidden: false },
      { id: '5261000000000', name: '5261000000000', page: null, status: null, leads: 2, hidden: true },
    ])
  })

  it('words its lines on the trail', () => {
    expect(adsEventText('Wei Lun', 'ads set up', { every: '2w', ads: 2 })).toBe('Wei Lun set up the Ads report · every 2 weeks · 2 CRM ads')
    expect(adsEventText('Wei Lun', 'ads changed', { what: ['ads', 'targets', 'x'] })).toBe('Wei Lun changed the Ads report · its ads, its targets')
    expect(adsEventText('Wei Lun', 'ads report', { no: 2, from: '2026-10-20', until: '2026-11-02' })).toBe('Wei Lun published Ads report #2 · 20 Oct – 2 Nov')
    expect(adsEventText('Wei Lun', 'ads report again', { no: 2 })).toBe('Wei Lun published Ads report #2 again')
    expect(adsEventText('Wei Lun', 'approved', {})).toBeNull()
  })
})
