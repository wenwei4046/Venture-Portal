import { describe, expect, it } from 'vitest'
import { groupDoubleClaims, type DoubleClaimBill } from './double-claims'
import {
  claimMoment, explainDoubleClaim,
  type ClaimBillEvidence, type ClaimContext, type ClaimLine,
} from './double-claim-reasons'

/**
 * The groups on Fair's September 2026 page, as production had them on
 * 2026-09-30 — every reason below is one the page now prints.
 */
const CTX: ClaimContext = { firstPaidMonth: '2026-09-01', cutoverNote: 'June–August paid from the claim forms' }
const FORM = "SALARY CLAIM FORM_AUGUST'26.xlsx"

function bill(billRef: string, orderNo: string, periodMonth: string, orderDate: string, orderTotal: number,
  extra: Partial<DoubleClaimBill> = {}): DoubleClaimBill {
  return {
    billRef, orderId: orderNo, orderNo, periodMonth, orderDate, staffId: 'ethan', employeeName: 'ETHAN', agentName: 'ETHAN',
    orderTotal, source: 'erp_sync', paidByRun: false, dismissed: false, ...extra,
  }
}

const line = (code: string, amount: number, qty = 1, earns = true, name = code): ClaimLine => ({ code, name, qty, amount, earns })
const formLine = (amount: number) => line('CLAIM FORM', amount, 1, true, 'August claim form — sales amount')

function ev(orderId: string, extra: Partial<ClaimBillEvidence> = {}): ClaimBillEvidence {
  return {
    orderId, customer: null, fair: null, fairSource: null, venue: null, soDate: null, erpOpenedAt: null,
    importFile: null, importedAt: null, paidAmount: null, lines: [], deliveries: [], adjustments: [],
    paidByRun: null, closed: null, ...extra,
  }
}

const BCCK = { place: 'BORNEO CONVENTION CENTRE KUCHING', start: '2026-08-28', end: '2026-08-31', organiser: null }

function explain(bills: DoubleClaimBill[], evidence: ClaimBillEvidence[]) {
  const [group] = groupDoubleClaims(bills)
  return explainDoubleClaim(group, new Map(evidence.map(e => [e.orderId, e])), CTX)
}

/** ETHAN's HC11357: paid on August's claim form, keyed into the ERP again on 28 Sep. */
function hc11357() {
  return explain(
    [
      bill('HC11357', 'HC11357', '2026-08-01', '2026-08-29', 12_005, { source: 'file' }),
      bill('HC11357', 'HC-SO-2609-287', '2026-09-01', '2026-09-28', 13_000),
    ],
    [
      ev('HC11357', {
        fair: BCCK, fairSource: 'manual', venue: 'BORNEO CONVENTION CENTRE KUCHING', paidAmount: 6_500,
        importFile: FORM, importedAt: '2026-09-26T10:08:58.341Z', lines: [formLine(12_005)],
      }),
      ev('HC-SO-2609-287', {
        customer: 'Alan Yew Wee Kian', fair: BCCK, fairSource: 'erp', venue: 'BORNEO CONVENTION CENTRE KUCHING',
        soDate: '2026-09-28', erpOpenedAt: '2026-09-28T08:48:37.998Z', paidAmount: 6_500,
        lines: [line('AKEMI ARMOUR MATT (K)', 13_000), line('AKEMI GUARDIAN MATT (SS)', 0, 2), line('TRION (A)-(K)', 0)],
        deliveries: [
          { at: '2026-09-28T08:49:21.485Z', status: 'skipped', message: 'draft — not a sale yet', month: '2026-09-01' },
          { at: '2026-09-29T15:46:35.537Z', status: 'skipped', message: 'draft — not a sale yet', month: '2026-09-01' },
          { at: '2026-09-29T15:47:05.201Z', status: 'applied', message: 'created', month: '2026-09-01' },
        ],
      }),
    ],
  )
}

describe('claimMoment', () => {
  it('reads a moment on the Malaysian clock', () => {
    expect(claimMoment('2026-09-28T08:48:37.998Z')).toBe('28 Sep 2026, 16:48')
    // 20:30 UTC is already the next day in Kuala Lumpur.
    expect(claimMoment('2026-09-27T20:30:00Z')).toBe('28 Sep 2026, 04:30')
  })
})

describe('explainDoubleClaim', () => {
  it('a claim-form bill keyed into the ERP again: already claimed, and September would pay it twice', () => {
    const x = hc11357()
    expect(x.verdict).toBe('paid_again')
    expect(x.pattern).toBe('copy')
    expect(x.label).toBe('Would pay twice')
    expect(x.headline).toBe('Already claimed in August 2026 — HC-SO-2609-287 would pay the same sale again')
    expect(x.reasons).toEqual([
      'Paper HC11357 is on 2 bills: HC11357 (August 2026) and HC-SO-2609-287 (September 2026).',
      `HC11357 was already paid on the August 2026 claim form (${FORM}) — RM 12,005.00 under ETHAN.`,
      'HC-SO-2609-287 is an ERP document opened on 28 Sep 2026, for a sale at BORNEO CONVENTION CENTRE KUCHING, 28–31 Aug — 28 days after that fair closed. Nothing has paid it yet — it is in September 2026’s commission.',
      'Both have the same salesperson (ETHAN), fair (BORNEO CONVENTION CENTRE KUCHING, 28–31 Aug) and deposit (RM 6,500.00 paid).',
      'Sales value differs: RM 12,005.00 on HC11357 and RM 13,000.00 on HC-SO-2609-287 — RM 995.00 more on the later one.',
      'A claim form names no customer and lists no items, so those cannot be compared for HC11357.',
    ])
    expect(x.action).toBe('If it is the same sale, take HC-SO-2609-287 out of September 2026: right-click it on All bills or on ETHAN’s ledger › Don’t count this bill. If the customer really did add to the order, only the RM 995.00 above HC11357 is new. If it is a different sale, its paper number is wrong in the ERP — correct it there, then mark this checked.')
    expect(x.atRisk).toBe(13_000)
    expect(x.copies).toEqual(['HC-SO-2609-287'])
  })

  it('lays the two bills side by side, saying which facts match', () => {
    const facts = Object.fromEntries(hc11357().facts.map(f => [f.label, f]))
    expect(facts['Came from'].values).toEqual(['Claim form', 'ERP document'])
    expect(facts['Came from'].notes).toEqual([FORM, null])
    expect(facts['Salesperson'].same).toBe('same')
    expect(facts['Customer']).toMatchObject({ values: ['—', 'Alan Yew Wee Kian'], same: 'unknown', notes: ['Not on the claim form', null] })
    expect(facts['Fair']).toMatchObject({ same: 'same', notes: ['Placed by hand', 'Named by the ERP'] })
    expect(facts['Date on the bill']).toMatchObject({ same: 'differs', gap: '30 days apart' })
    expect(facts['Opened in the ERP'].values).toEqual(['—', '28 Sep 2026, 16:48'])
    expect(facts['Sales value']).toMatchObject({ same: 'differs', gap: 'RM 995.00 more on the later' })
    expect(facts['Paid so far']).toMatchObject({ values: ['RM 6,500.00', 'RM 6,500.00'], same: 'same', notes: ['54% of the bill', '50% of the bill'] })
    expect(facts['Items']).toMatchObject({ values: ['—', 'AKEMI ARMOUR MATT (K) + 2 more'], same: 'unknown' })
    expect(facts['Items'].notes[1]).toBe('AKEMI ARMOUR MATT (K) ×1 · AKEMI GUARDIAN MATT (SS) ×2 · TRION (A)-(K) ×1')
    expect(facts['Where it stands'].values).toEqual(['Paid on the August 2026 claim form', 'Not paid yet — September 2026 pays it'])
  })

  it('tells each bill’s history, from the claim form or the ERP’s first save to where it stands', () => {
    const { history } = hc11357()
    expect(history.HC11357.map(e => [e.when, e.text])).toEqual([
      ['29 Aug 2026', 'Sold at BORNEO CONVENTION CENTRE KUCHING, 28–31 Aug.'],
      ['26 Sep 2026, 18:08', `Entered from ${FORM} into August 2026.`],
      [null, 'Paid: August 2026 was paid from the claim form — the portal pays from September 2026.'],
    ])
    expect(history['HC-SO-2609-287'].map(e => [e.when, e.text])).toEqual([
      ['28 Sep 2026, 16:48', 'Opened in the ERP, dated 28 Sep 2026, on paper HC11357.'],
      ['28 Sep 2026, 16:49', 'Saved as a draft 2 times — a draft is not a sale yet, so nothing was counted.'],
      ['29 Sep 2026, 23:47', 'Became a sale in the portal, counted in September 2026.'],
      [null, 'The ERP names BORNEO CONVENTION CENTRE KUCHING, 28–31 Aug — an August 2026 fair; August 2026 is settled, so the bill stays in September 2026.'],
      [null, 'Not paid yet — September 2026’s commission counts it.'],
    ])
  })

  it('names the transport when the only difference is a charge that never earns', () => {
    const x = explain(
      [
        bill('HC11568', 'HC11568', '2026-08-01', '2026-08-30', 10_944, { source: 'file' }),
        bill('HC11568', 'HC-SO-2609-286', '2026-09-01', '2026-09-28', 12_000),
      ],
      [
        ev('HC11568', { importFile: FORM, fair: BCCK, fairSource: 'manual', paidAmount: 6_000, lines: [formLine(10_944)] }),
        ev('HC-SO-2609-286', {
          fair: BCCK, fairSource: 'erp', erpOpenedAt: '2026-09-28T08:48:20.207Z', paidAmount: 6_000,
          lines: [line('AKEMI ARMOUR MATT (K)', 10_944), line('TRANSPORTATION CHARGES', 1_056, 1, false)],
        }),
      ],
    )
    expect(x.verdict).toBe('paid_again')
    expect(x.reasons).toContain('Both have the same salesperson (ETHAN), fair (BORNEO CONVENTION CENTRE KUCHING, 28–31 Aug), RM 10,944.00 that earns commission and deposit (RM 6,000.00 paid).')
    expect(x.reasons).toContain('Sales value differs: RM 10,944.00 on HC11568 and RM 12,000.00 on HC-SO-2609-286 — RM 1,056.00 more on the later one, all of it TRANSPORTATION CHARGES, which never earns.')
    // Nothing new earns, so there is no "only the difference is new".
    expect(x.action).not.toContain('above HC11568 is new')
    const earns = x.facts.find(f => f.label === 'Earns commission on')!
    expect(earns).toMatchObject({ same: 'same', notes: [null, 'RM 1,056.00 TRANSPORTATION CHARGES never earns'] })
  })

  it('a July bill placed by hand, and the same paper keyed again in September: every fact the same', () => {
    const KLCC = { place: 'KUALA LUMPUR CONVENTION CENTRE', start: '2026-07-09', end: '2026-07-12', organiser: null }
    const items = [line('HAPPI SLEEP SOLITUDE MATT (Q)', 2_500), line('JAGER-(Q)', 0), line('AK-HAPPY SLEEP EASY', 0, 2), line('AERO-MP (Q)', 0)]
    const x = explain(
      [
        bill('HC11025', 'HC-SO-2609-174', '2026-07-01', '2026-09-22', 2_500, { staffId: 'shawn', employeeName: 'SHAWN' }),
        bill('HC11025', 'HC-SO-2609-303', '2026-09-01', '2026-09-28', 2_500, { staffId: 'shawn', employeeName: 'SHAWN' }),
      ],
      [
        ev('HC-SO-2609-174', {
          customer: 'Cecilia Siew', fair: KLCC, fairSource: 'manual', venue: 'KUALA LUMPUR CONVENTION CENTRE',
          soDate: '2026-09-22', erpOpenedAt: '2026-09-22T09:28:25.737Z', paidAmount: 2_500, lines: items,
          deliveries: [
            { at: '2026-09-22T09:28:27.029Z', status: 'skipped', message: 'draft — not a sale yet', month: '2026-09-01' },
            { at: '2026-09-22T09:43:17.514Z', status: 'applied', message: 'created', month: '2026-09-01' },
          ],
        }),
        ev('HC-SO-2609-303', {
          customer: 'Cecilia Siew', fair: { place: 'SUNWAY CARNIVAL', start: '2026-09-25', end: '2026-09-29', organiser: null },
          fairSource: 'erp', venue: 'KUALA LUMPUR CONVENTION CENTRE', soDate: '2026-09-28',
          erpOpenedAt: '2026-09-28T09:43:05.129Z', paidAmount: 2_500, lines: items,
        }),
      ],
    )
    expect(x.verdict).toBe('paid_again')
    expect(x.headline).toBe('Already claimed in July 2026 — HC-SO-2609-303 would pay the same sale again')
    expect(x.reasons).toContain('HC-SO-2609-174 counts in July 2026, a month paid outside the portal (June–August paid from the claim forms). Somebody placed it there by hand, at KUALA LUMPUR CONVENTION CENTRE, 9–12 Jul.')
    expect(x.reasons).toContain('Both have the same salesperson (SHAWN), customer (Cecilia Siew), venue written on the bill (KUALA LUMPUR CONVENTION CENTRE), 4 items (HAPPI SLEEP SOLITUDE MATT (Q) ×1 · JAGER-(Q) ×1 · AK-HAPPY SLEEP EASY ×2 · AERO-MP (Q) ×1), sales value (RM 2,500.00) and payment (paid in full).')
    expect(x.reasons).toContain('Different fairs: KUALA LUMPUR CONVENTION CENTRE, 9–12 Jul on HC-SO-2609-174 and SUNWAY CARNIVAL, 25–29 Sep on HC-SO-2609-303.')
    expect(x.history['HC-SO-2609-174'].map(e => e.text)).toContain(
      'Moved from September 2026 to July 2026: somebody placed it by hand at KUALA LUMPUR CONVENTION CENTRE, 9–12 Jul.')
    expect(x.facts.find(f => f.label === 'Fair')!.notes).toEqual(['Placed by hand', 'Named by the ERP · written on the bill: KUALA LUMPUR CONVENTION CENTRE'])
  })

  it('two documents opened minutes apart with nothing in common: one sale, not a double claim', () => {
    const SPCC = { place: 'SUNWAY PYRAMID CONVENTION CENTRE', start: '2026-09-04', end: '2026-09-06', organiser: null }
    const x = explain(
      [
        bill('HC13241', 'HC-SO-2609-067', '2026-09-01', '2026-09-14', 2_300, { staffId: 'melvin', employeeName: 'MELVIN CHONG' }),
        bill('HC13241', 'HC-SO-2609-068', '2026-09-01', '2026-09-14', 7_000, { staffId: 'melvin', employeeName: 'MELVIN CHONG' }),
      ],
      [
        ev('HC-SO-2609-067', {
          customer: 'Clary Ho', fair: SPCC, fairSource: 'erp', erpOpenedAt: '2026-09-13T17:13:21.498Z', paidAmount: 1_150,
          lines: [line('AKEMI BASTION MATT (SS)', 2_300), line('JAGER-(SS)', 0), line('NTYR-CS LTX PIL + CSC', 0, 5), line('JM-CL JAC WP MP (Q)', 0, 2), line('JM-CL JAC WP MP (S)', 0)],
        }),
        ev('HC-SO-2609-068', {
          customer: 'Clary Ho', fair: SPCC, fairSource: 'erp', erpOpenedAt: '2026-09-13T17:16:19.910Z', paidAmount: 3_500,
          lines: [line('AKEMI ULTIMATE MATT (Q)', 7_000, 2)],
        }),
      ],
    )
    expect(x.verdict).toBe('split')
    expect(x.label).toBe('One sale, two documents')
    expect(x.headline).toBe('One sale written as 2 documents — nothing is paid twice')
    expect(x.reasons).toContain('The documents were opened in the ERP 3 minutes apart and numbered one after the other, and no item is on more than one of them (HC-SO-2609-067: AKEMI BASTION MATT (SS) + 4 more, RM 2,300.00; HC-SO-2609-068: AKEMI ULTIMATE MATT (Q), RM 7,000.00) — one sale written as 2, each earning only on its own lines, RM 9,300.00 together.')
    // A split's parts differ in money by nature; that is not listed as a finding.
    expect(x.reasons.some(r => r.startsWith('Sales value differs'))).toBe(false)
    expect(x.atRisk).toBe(0)
    expect(x.facts.find(f => f.label === 'Opened in the ERP')!.gap).toBe('3 minutes apart')
    expect(x.facts.find(f => f.label === 'Items')!.gap).toBe('None in common')
  })

  it('the same customer twenty days later at another fair: a second bill on the paper, held by the deposit gate', () => {
    const x = explain(
      [
        bill('PG10457', 'HC-SO-013505', '2026-09-01', '2026-09-07', 10_788, { staffId: 'shawn', employeeName: 'SHAWN' }),
        bill('PG10457', 'HC-SO-2609-222', '2026-09-01', '2026-09-27', 5_000, { staffId: 'shawn', employeeName: 'SHAWN' }),
      ],
      [
        ev('HC-SO-013505', {
          customer: 'ROY', fair: { place: 'SETIA SPICE CONVENTION CENTRE', start: '2026-09-04', end: '2026-09-06', organiser: null },
          fairSource: 'erp', erpOpenedAt: '2026-09-07T10:33:31.616Z', paidAmount: 5_788,
          lines: [line('DUNLOPILLO CLASSIC DREAM VALLEY MATT (K)', 10_788), line('DUNLOPILLO CLASSIC DREAM VALLEY MATT (Q)', 0, 3), line('DL-SLEEP WELL PILLOW', 0, 6)],
        }),
        ev('HC-SO-2609-222', {
          customer: 'Roy', fair: { place: 'SUNWAY CARNIVAL', start: '2026-09-25', end: '2026-09-29', organiser: null },
          fairSource: 'venue_match', erpOpenedAt: '2026-09-26T17:30:54.866Z', paidAmount: 0,
          lines: [line('DUNLOPILLO CLASSIC DREAM VALLEY MATT (Q)', 5_000, 2)],
        }),
      ],
    )
    expect(x.verdict).toBe('second_sale')
    expect(x.headline).toBe('A second bill on the same paper, 20 days later')
    expect(x.reasons).toContain('Both have the same salesperson (SHAWN) and customer (ROY).')
    expect(x.reasons).toContain('HC-SO-2609-222 is dated 20 days after HC-SO-013505 at another fair (SUNWAY CARNIVAL, 25–29 Sep — HC-SO-013505 was at SETIA SPICE CONVENTION CENTRE, 4–6 Sep), for RM 5,000.00 against HC-SO-013505’s RM 10,788.00. It repeats DUNLOPILLO CLASSIC DREAM VALLEY MATT (Q) from HC-SO-013505.')
    expect(x.reasons.at(-1)).toBe('Nothing is paid on HC-SO-2609-222 yet, so the deposit gate holds its commission for now.')
    expect(x.action).toBe('If HC-SO-2609-222 adds to HC-SO-013505’s sale, only what was added should earn — correct it in the ERP. If it is a separate purchase, mark this checked.')
  })

  it('both bills in a month settled by hand: said once, and nothing is paid again', () => {
    const SOLO = { place: 'SUTERA MALL SOLO', start: '2026-07-24', end: '2026-07-26', organiser: null }
    const x = explain(
      [
        bill('HC12828', 'HC-SO-013245', '2026-07-01', '2026-08-13', 4_016, { staffId: 'melvin', employeeName: 'MELVIN CHONG' }),
        bill('HC12828', 'HC-SO-013246', '2026-07-01', '2026-08-13', 2_372, { staffId: 'melvin', employeeName: 'MELVIN CHONG' }),
      ],
      [
        ev('HC-SO-013245', {
          customer: 'eng li kean', fair: SOLO, fairSource: 'manual', erpOpenedAt: '2026-08-28T08:11:26.205Z', paidAmount: 1_789,
          lines: [line('AKEMI GUARDIAN MATT (K)', 3_460), line('CODY-(K)', 0), line('TRANSPORTATION CHARGES', 556, 1, false)],
        }),
        ev('HC-SO-013246', {
          customer: 'Eng Li Kean', fair: SOLO, fairSource: 'manual', erpOpenedAt: '2026-08-28T08:11:26.205Z', paidAmount: 1_411,
          lines: [line('HAPPI SLEEP SOLITUDE MATT (Q)', 2_000), line('JAGER-(Q)', 0), line('TRANSPORTATION CHARGES', 372, 1, false)],
        }),
      ],
    )
    expect(x.verdict).toBe('settled')
    expect(x.pattern).toBe('split')
    expect(x.headline).toBe('One sale written as 2 documents, in a month already settled — nothing is paid again')
    expect(x.reasons[1]).toBe('HC-SO-013245 and HC-SO-013246 count in July 2026, a month paid outside the portal (June–August paid from the claim forms). Somebody placed them there by hand, at SUTERA MALL SOLO, 24–26 Jul.')
    // Transport is not an item: it does not make the two documents share goods.
    expect(x.facts.find(f => f.label === 'Items')!.gap).toBe('None in common')
    expect(x.atRisk).toBe(0)
  })

  it('a bill a run has paid, and the same paper in a later month', () => {
    const x = explain(
      [
        bill('HC20001', 'HC-SO-2610-001', '2026-10-01', '2026-10-03', 4_000, { paidByRun: true }),
        bill('HC20001', 'HC-SO-2611-001', '2026-11-01', '2026-11-02', 4_000),
      ],
      [
        ev('HC-SO-2610-001', { paidByRun: { month: '2026-10-01', at: '2026-11-15T03:00:00Z' }, lines: [line('SOFA', 4_000)], paidAmount: 4_000 }),
        ev('HC-SO-2611-001', { lines: [line('SOFA', 4_000)], paidAmount: 4_000 }),
      ],
    )
    expect(x.verdict).toBe('paid_again')
    expect(x.reasons).toContain('HC-SO-2610-001 was already paid by the October 2026 run on 15 Nov 2026.')
    expect(x.history['HC-SO-2610-001'].at(-1)).toEqual({ when: '15 Nov 2026, 11:00', tone: 'paid', text: 'Paid by the October 2026 run.' })
  })

  it('a bill locked in a salesperson’s close counts as claimed', () => {
    const x = explain(
      [
        bill('HC20002', 'HC-SO-2610-010', '2026-10-01', '2026-10-03', 4_000),
        bill('HC20002', 'HC-SO-2610-011', '2026-10-01', '2026-10-20', 4_000),
      ],
      [
        ev('HC-SO-2610-010', { closed: { month: '2026-10-01', at: '2026-10-25T02:00:00Z', by: 'Principal' }, lines: [line('SOFA', 4_000)] }),
        ev('HC-SO-2610-011', { lines: [line('SOFA', 4_000)] }),
      ],
    )
    expect(x.verdict).toBe('paid_again')
    expect(x.reasons).toContain('HC-SO-2610-010 is locked in ETHAN’s October 2026 close (25 Oct 2026, by Principal).')
    expect(x.copies).toEqual(['HC-SO-2610-011'])
  })

  it('without evidence it still says what it can: the number, and where each bill stands', () => {
    const [group] = groupDoubleClaims([
      bill('HC30000', 'HC30000', '2026-08-01', '2026-08-10', 1_000, { source: 'file' }),
      bill('HC30000', 'HC-SO-2609-900', '2026-09-01', '2026-09-20', 1_000),
    ])
    const x = explainDoubleClaim(group, new Map(), CTX)
    expect(x.verdict).toBe('paid_again')
    expect(x.reasons[0]).toBe('Paper HC30000 is on 2 bills: HC30000 (August 2026) and HC-SO-2609-900 (September 2026).')
    expect(x.reasons[1]).toBe('HC30000 counts in August 2026, a month paid outside the portal (June–August paid from the claim forms).')
    expect(x.history['HC-SO-2609-900'].map(e => e.text)).toEqual(['No delivery of it from the ERP is logged.', 'Not paid yet — September 2026’s commission counts it.'])
  })
})
