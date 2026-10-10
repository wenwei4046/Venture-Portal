import { describe, expect, it } from 'vitest'
import {
  changedFields,
  pctString,
  pendingChanges,
  rankChoiceLabel,
  saveBarText,
  savedValues,
  shownValues,
  withEdit,
  withholdingChoices,
  withholdingLabel,
  type MemberEdits,
  type MemberSource,
} from './members-grid'

// Fair on 2026-10-10: Anthony on B · 9% (scheme default, PCB); Chea Huan
// withholding 2%; Lawrence on Manual.
const anthony: MemberSource = { staff_id: 'anthony', employee_name: 'ANTHONY', rank_id: 'r-b', rate_mode: null, tax_mode: 'pcb', withholding_rate: 0.02 }
const chea: MemberSource = { staff_id: 'chea', employee_name: 'CHEA HUAN', rank_id: 'r-b', rate_mode: null, tax_mode: 'withholding', withholding_rate: 0.02 }
const lawrence: MemberSource = { staff_id: 'lawrence', employee_name: 'LAWRENCE', rank_id: 'r-b', rate_mode: 'fixed', tax_mode: 'none', withholding_rate: 0 }

describe('saved and shown values', () => {
  it('reads a row as the selects hold it', () => {
    expect(savedValues(anthony)).toEqual({ rank: 'r-b', mode: '', wh: '' })
    expect(savedValues(chea)).toEqual({ rank: 'r-b', mode: '', wh: '2' })
    expect(savedValues(lawrence)).toEqual({ rank: 'r-b', mode: 'fixed', wh: '' })
  })

  it('shows an edit over what is saved', () => {
    expect(shownValues(anthony, { anthony: { rank: 'r-d' } })).toEqual({ rank: 'r-d', mode: '', wh: '' })
  })

  it('writes a rate as the cell does', () => {
    expect(pctString(0.02)).toBe('2')
    expect(pctString(0.025)).toBe('2.5')
  })
})

describe('withEdit / changedFields', () => {
  it('marks a cell changed, and unmarks it when put back', () => {
    let edits: MemberEdits = withEdit({}, anthony, 'rank', 'r-d')
    expect(changedFields(anthony, edits)).toEqual(['rank'])
    edits = withEdit(edits, anthony, 'rank', 'r-b')
    expect(changedFields(anthony, edits)).toEqual([])
    expect(edits).toEqual({})
  })

  it('keeps each row’s own edits', () => {
    let edits: MemberEdits = withEdit({}, anthony, 'rank', 'r-d')
    edits = withEdit(edits, lawrence, 'mode', '')
    edits = withEdit(edits, chea, 'wh', '')
    expect(changedFields(anthony, edits)).toEqual(['rank'])
    expect(changedFields(lawrence, edits)).toEqual(['mode'])
    expect(changedFields(chea, edits)).toEqual(['wh'])
  })
})

describe('pendingChanges / saveBarText', () => {
  it('names every row with a change, counting the cells — the prototype’s bar', () => {
    let edits: MemberEdits = withEdit({}, anthony, 'rank', 'r-d')
    edits = withEdit(edits, lawrence, 'mode', '')
    edits = withEdit(edits, lawrence, 'wh', '2')
    const { rows, cells } = pendingChanges([anthony, chea, lawrence], edits)
    expect(rows.map(r => [r.staffId, r.fields])).toEqual([['anthony', ['rank']], ['lawrence', ['mode', 'wh']]])
    expect(cells).toBe(3)
    expect(saveBarText(rows, cells)).toBe('3 unsaved changes · ANTHONY, LAWRENCE')
    expect(saveBarText(rows.slice(0, 1), 1)).toBe('1 unsaved change · ANTHONY')
  })
})

describe('cell words', () => {
  it('says a rank as letter · pay', () => {
    expect(rankChoiceLabel({ label: 'Rank B' }, '9%')).toBe('B · 9%')
    expect(rankChoiceLabel({ label: 'Rank SS' }, 'RM 1,500 package')).toBe('SS · RM 1,500 package')
  })

  it('offers no withholding, the statutory 2%, and a person’s own other rate', () => {
    expect(withholdingChoices(anthony)).toEqual(['', '2'])
    expect(withholdingChoices({ ...chea, withholding_rate: 0.03 })).toEqual(['', '2', '3'])
    expect(withholdingLabel('')).toBe('—')
    expect(withholdingLabel('2')).toBe('2%')
  })
})
