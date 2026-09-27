import { describe, expect, it } from 'vitest'
import {
  PAY_LINE_KINDS,
  checkSavePayLines,
  draftLines,
  draftOf,
  draftTotals,
  draftsDiffer,
  newDraft,
  normalisePayLine,
  parsePayLineAmount,
  payLineLabel,
  payLineTotals,
  payLinesToSave,
  personPayLinesLock,
  seenOf,
  type PayLine,
} from './revenue-pay-lines'

const claim: PayLine = { id: 'a', kind: 'special_claim', description: 'Petrol, Penang fair', amount: 500, version: 1 }
const advance: PayLine = { id: 'b', kind: 'deduction', description: 'Salary advance', amount: 200, version: 3 }

describe('the kinds', () => {
  it('are the four the table allows, in the dropdown’s order, and only one takes money off', () => {
    expect(PAY_LINE_KINDS.map(k => k.kind)).toEqual(['special_claim', 'allowance', 'incentive', 'deduction'])
    expect(PAY_LINE_KINDS.filter(k => k.deduction).map(k => k.kind)).toEqual(['deduction'])
  })

  it('name a line the way a payslip reads it', () => {
    expect(payLineLabel(claim)).toBe('Special claim · Petrol, Penang fair')
    expect(payLineLabel({ kind: 'incentive', description: null })).toBe('Incentive')
  })
})

describe('payLineTotals', () => {
  it('adds earnings and deductions apart, to the sen', () => {
    expect(payLineTotals([claim, advance, { kind: 'allowance', amount: 0.1 }, { kind: 'incentive', amount: 0.2 }]))
      .toEqual({ earnings: 500.3, deductions: 200 })
  })

  it('is nothing for no lines', () => {
    expect(payLineTotals([])).toEqual({ earnings: 0, deductions: 0 })
  })
})

describe('normalisePayLine', () => {
  it('reads PostgREST’s NUMERIC string and drops a blank description', () => {
    expect(normalisePayLine({ id: 'a', staff_id: 's', kind: 'allowance', description: '  ', amount: '120.50', version: 2 }))
      .toEqual({ id: 'a', staffId: 's', kind: 'allowance', description: null, amount: 120.5, version: 2 })
  })

  it('refuses a row that is not a pay line rather than counting it as nothing', () => {
    expect(() => normalisePayLine({ id: 'a', staff_id: 's', kind: 'bonus', amount: '5' })).toThrow()
    expect(() => normalisePayLine({ id: 'a', staff_id: 's', kind: 'allowance', amount: 'x' })).toThrow()
    expect(() => normalisePayLine(null)).toThrow()
  })
})

describe('seenOf', () => {
  it('is what the save RPC compares: id and version', () => {
    expect(seenOf([claim, advance])).toEqual(['a:1', 'b:3'])
  })
})

describe('parsePayLineAmount', () => {
  it('takes what people type', () => {
    expect(parsePayLineAmount('500')).toBe(500)
    expect(parsePayLineAmount(' 1,234.5 ')).toBe(1234.5)
    expect(parsePayLineAmount('0.01')).toBe(0.01)
  })

  it('refuses nothing, zero, a negative, letters and a third decimal', () => {
    for (const text of ['', '0', '0.00', '-5', 'abc', '1.005', '12.3.4']) {
      expect(parsePayLineAmount(text)).toBeNull()
    }
  })
})

describe('payLinesToSave', () => {
  it('sends the lines in order, a new one without an id, descriptions trimmed', () => {
    const drafts = [draftOf(claim), { ...newDraft('n1', 'incentive'), description: '  Fair champion ', amount: '300' }]
    expect(payLinesToSave(drafts)).toEqual({
      ok: true,
      lines: [
        { id: 'a', kind: 'special_claim', description: 'Petrol, Penang fair', amount: 500 },
        { id: null, kind: 'incentive', description: 'Fair champion', amount: 300 },
      ],
    })
  })

  it('names the first line that cannot be saved', () => {
    expect(payLinesToSave([draftOf(claim), newDraft('n1')])).toEqual({ ok: false, key: 'n1', message: 'Line 2: enter an amount.' })
    expect(payLinesToSave([{ ...newDraft('n1'), amount: '0' }]))
      .toEqual({ ok: false, key: 'n1', message: 'Line 1: the amount must be more than 0, to the sen.' })
    expect(payLinesToSave([{ ...newDraft('n1'), amount: '5', description: 'x'.repeat(201) }]))
      .toMatchObject({ ok: false, key: 'n1' })
  })

  it('refuses more lines than a month holds', () => {
    const drafts = Array.from({ length: 51 }, (_, i) => ({ ...newDraft(`n${i}`), amount: '1' }))
    expect(payLinesToSave(drafts)).toMatchObject({ ok: false, key: 'n50' })
  })
})

describe('checkSavePayLines', () => {
  const staffId = '6c8c6df1-a77f-4088-bb79-1ececb0a1041'
  const good = { staffId, period: '2026-09-01', seen: ['a:1'], lines: [
    { id: null, kind: 'special_claim' as const, description: ' Petrol ', amount: 0.29 },
  ] }

  it('passes a save through, descriptions trimmed — and a sen amount survives binary floats', () => {
    expect(checkSavePayLines(good)).toEqual({ ...good, lines: [{ id: null, kind: 'special_claim', description: 'Petrol', amount: 0.29 }] })
  })

  it('refuses what could not be a save', () => {
    expect(() => checkSavePayLines({ ...good, staffId: 'nobody' })).toThrow('Choose a salesperson')
    expect(() => checkSavePayLines({ ...good, period: '2026-09-15' })).toThrow('first of a month')
    expect(() => checkSavePayLines({ ...good, lines: [{ ...good.lines[0], amount: 1.005 }] })).toThrow('Line 1')
    expect(() => checkSavePayLines({ ...good, lines: [{ ...good.lines[0], amount: -5 }] })).toThrow('Line 1')
    expect(() => checkSavePayLines({ ...good, lines: [{ ...good.lines[0], kind: 'bonus' as never }] })).toThrow('Line 1')
    expect(() => checkSavePayLines({ ...good, lines: [{ ...good.lines[0], id: 'not-a-uuid' }] })).toThrow('Line 1')
    expect(() => checkSavePayLines({ ...good, seen: [1 as never] })).toThrow('Reload')
  })
})

describe('the drafts as they stand', () => {
  it('count only what is already an amount', () => {
    const drafts = [draftOf(claim), draftOf(advance), { ...newDraft('n1', 'allowance'), amount: '12.' }]
    expect(draftTotals(drafts)).toEqual({ earnings: 500, deductions: 200 })
    expect(draftLines(drafts).map(line => line.key)).toEqual(['a', 'b'])
  })

  it('differ from what is stored only when saving would change something', () => {
    const lines = [claim, advance]
    expect(draftsDiffer(lines.map(draftOf), lines)).toBe(false)
    expect(draftsDiffer([draftOf(claim), { ...draftOf(advance), amount: '200.00' }], lines)).toBe(false)
    expect(draftsDiffer([draftOf(claim), { ...draftOf(advance), amount: '250' }], lines)).toBe(true)
    expect(draftsDiffer([draftOf(advance), draftOf(claim)], lines)).toBe(true)
    expect(draftsDiffer([draftOf(claim)], lines)).toBe(true)
    expect(draftsDiffer([...lines.map(draftOf), newDraft('n1')], lines)).toBe(true)
  })
})

// The unified Payroll (2026-09-27): the month can be open while one person has
// moved on. The pencil says so before any typing, and names the way back.
describe('one person moved on from draft', () => {
  it('lets a draft or a person with no payroll row yet change their lines', () => {
    expect(personPayLinesLock('draft', 'ANTHONY')).toBeNull()
    expect(personPayLinesLock(null, 'ANTHONY')).toBeNull()
    expect(personPayLinesLock(undefined, 'ANTHONY')).toBeNull()
  })

  it('sends a closed salesperson back to their close, and a sent one to Resubmit', () => {
    expect(personPayLinesLock('completed', 'ANTHONY')).toBe('ANTHONY is closed for the month. Reopen their close first — closing them again sends the new figure to payroll.')
    expect(personPayLinesLock('submitted', 'ANTHONY')).toBe('ANTHONY\'s pay is with Finance. Resubmit them on HR › Payroll (right-click their row) first.')
    expect(personPayLinesLock('paid', 'ANTHONY')).toContain('Resubmit them on HR › Payroll')
  })
})
