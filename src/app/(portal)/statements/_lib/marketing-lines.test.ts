import { describe, expect, it } from 'vitest'
import { importResultOf, importWords, marketingLinesFromRow, mktLineState, mktParties, mktSummary, NO_MARKETING } from './marketing-lines'

// Marketing's billing as the Invoice hub reads it (2026-10-26, ②b-2h — the user's "A"): mkt_bill_import_preview's
// lines and the invoices typed by hand, the parties the import makes a draft each for, the card's figures, what an
// import did in words.

const ROW = {
  month: '2026-10-01',
  locked: false,
  lines: [
    { bill: 'b1', project: 'p1', track: 'PRJ-CAR-2610-001', title: 'Pack', words: "Post pack - Oct'26", amount: 500, sub: { id: 's-car', code: 'CAR', name: 'Carres' },
      party: { kind: 'subsidiary', id: 'co-car', name: 'Carres', code: 'CAR' }, account: { code: '5019', name: 'Design Income' }, invoice: null },
    { bill: 'b2', project: 'p2', track: 'PRJ-CAR-2610-002', title: 'Leads', words: "Lead Gen - Oct'26", amount: '2500.00', sub: { id: 's-car', code: 'CAR', name: 'Carres' },
      party: { kind: 'subsidiary', id: 'co-car', name: 'Carres', code: 'CAR' }, account: { code: '5012', name: 'Revenue - Lead Gen' },
      invoice: { id: 'i1', no: 'HV-INV-202610-0040', status: 'draft' } },
    { bill: 'b3', project: 'p3', track: 'PRJ-REDT-2610-001', title: 'Social', words: "Social Media - Oct'26", amount: 3000, sub: { id: 's-rt', code: 'REDT', name: 'Red Truck' },
      party: { kind: 'client', id: 's-rt', name: 'Red Truck Sdn Bhd', code: 'REDT' }, account: null, invoice: { id: 'i2', no: 'HV-INV-202610-0041', status: 'paid_via_netting' } },
  ],
  typed: [{ id: 't1', no: 'HV-INV-202610-0013', status: 'paid', total: '2000.00', party: 'Rygis Private Gym', code: null, words: 'Marketing Service - 1st Oct to 15th Oct\n- Graphic Ads ×4' }],
}

describe('mkt_bill_import_preview, read', () => {
  it('each line: its words, amount, party, account and invoice; the invoices typed by hand, their first line', () => {
    const m = marketingLinesFromRow(ROW)!
    expect([m.month, m.locked, m.lines.length]).toEqual(['2026-10-01', false, 3])
    expect(m.lines[1]).toEqual({
      bill: 'b2', project: 'p2', track: 'PRJ-CAR-2610-002', title: 'Leads', words: "Lead Gen - Oct'26", amount: 2500,
      sub: { id: 's-car', code: 'CAR', name: 'Carres' }, party: { kind: 'subsidiary', id: 'co-car', name: 'Carres', code: 'CAR' },
      account: { code: '5012', name: 'Revenue - Lead Gen' }, invoice: { id: 'i1', no: 'HV-INV-202610-0040', status: 'draft' },
    })
    expect(m.lines[2].party.kind).toBe('client')
    expect(m.typed).toEqual([{ id: 't1', no: 'HV-INV-202610-0013', status: 'paid', total: 2000, party: 'Rygis Private Gym', code: null, words: 'Marketing Service - 1st Oct to 15th Oct' }])
  })

  it('a closed month says so; what is not a preview reads as none', () => {
    expect(marketingLinesFromRow({ ...ROW, locked: true })!.locked).toBe(true)
    expect(marketingLinesFromRow(null)).toBeNull()
    expect(marketingLinesFromRow([])).toBeNull()
    expect(marketingLinesFromRow({ lines: [] })).toBeNull()
    expect(marketingLinesFromRow({ month: '2026-10-01' })).toEqual(NO_MARKETING('2026-10-01'))
  })

  it('a line without an account or an invoice has none; an invoice without its id is none', () => {
    const m = marketingLinesFromRow({ ...ROW, lines: [{ ...ROW.lines[0], account: { code: '' }, invoice: { no: 'HV-INV-202610-0040' } }] })!
    expect([m.lines[0].account, m.lines[0].invoice]).toEqual([null, null])
  })
})

describe('the parties, the figures, the words', () => {
  it('a party each, in the order read: its lines, total, what is still to import and the invoices it is on', () => {
    const parties = mktParties(marketingLinesFromRow(ROW)!)
    expect(parties.map((p) => [p.key, p.kind, p.name, p.lines.length, p.total, p.toImport, p.toImportAmount, p.invoices.map((i) => i.no)])).toEqual([
      ['subsidiary:co-car', 'subsidiary', 'Carres (CAR)', 2, 3000, 1, 500, ['HV-INV-202610-0040']],
      ['client:s-rt', 'client', 'Red Truck Sdn Bhd', 1, 3000, 0, 0, ['HV-INV-202610-0041']],
    ])
  })

  it('the card’s figures: every confirmed line, what is to import, what is imported', () => {
    expect(mktSummary(marketingLinesFromRow(ROW)!)).toEqual({ lines: 3, amount: 6000, toImport: 1, toImportAmount: 500, imported: 2 })
    expect(mktSummary(NO_MARKETING('2026-10-01'))).toEqual({ lines: 0, amount: 0, toImport: 0, toImportAmount: 0, imported: 0 })
  })

  it('a line’s state; what an import did', () => {
    const [a, b, c] = marketingLinesFromRow(ROW)!.lines
    expect([mktLineState(a), mktLineState(b), mktLineState(c)]).toEqual(['To import', 'On HV-INV-202610-0040 · draft', 'On HV-INV-202610-0041 · paid via netting'])
    expect(importResultOf({ made: 2, added: 1, lines: 4, invoices: [{ no: 'HV-INV-202610-0040' }, { no: '' }, 'x'] })).toEqual({ made: 2, added: 1, lines: 4, invoices: ['HV-INV-202610-0040'] })
    expect(importResultOf(null)).toEqual({ made: 0, added: 0, lines: 0, invoices: [] })
    expect(importWords({ made: 2, added: 1, lines: 4 })).toBe('Marketing billing imported · 2 drafts made · 1 draft added to · 4 lines')
    expect(importWords({ made: 0, added: 1, lines: 1 })).toBe('Marketing billing imported · 1 draft added to · 1 line')
    expect(importWords({ made: 0, added: 0, lines: 0 })).toBe('Nothing new to import — every confirmed line is on an invoice')
  })
})
