import { describe, expect, it } from 'vitest'
import type { CoaAccount } from '@/lib/coa-edit'
import { coaLine, coaModel, searchKeep, treeOf } from './coa-model'

// Report › Chart of Account in the Finance phone app (2026-10-15, part E3b):
// the desktop's chart — the active accounts, a card per type, a type's
// accounts as its tree (a parent before its own at any depth), its search.

const acc = (code: string, name: string, type: CoaAccount['type'], parent: string | null = null, active = true): CoaAccount => ({
  code, name, type, cash_flow_category: type === 'liability' ? 'financing' : 'operating', parent_code: parent, is_active: active, sort_order: 0,
})
const CHART = [
  acc('4200', 'Amount Due to - Director', 'liability', '4000'),
  acc('4000', 'Fund Sources Payable', 'liability'),
  acc('4053', 'Amount Due to - Carres', 'liability', '4100'),
  acc('4100', 'Amount Due to - Company', 'liability', '4000'),
  acc('4300', 'Old payable', 'liability', null, false),
  acc('4900', 'Orphan', 'liability', '4999'),
  acc('3000', 'Cash at bank', 'asset'),
]

describe('Chart of Account on the phone', () => {
  it('opens on the active accounts, the inactive in a word, a card per type with its range', () => {
    const m = coaModel(CHART, false)
    expect(m.hero).toEqual({ value: '6', label: 'Active accounts · 2 account types' })
    expect(m.chip).toBe('1 inactive')
    expect(m.cards.map((c) => [c.key, c.label, c.sub, c.value])).toEqual([
      ['asset', 'Asset', '3000–3999', '1 account'],
      ['liability', 'Liability', '4000–4999', '5 accounts'],
    ])
    expect(coaModel(CHART, true).cards[1].value).toBe('6 accounts')
  })

  it('a type’s accounts are the desktop’s tree: a parent before its own at any depth, an orphan a root', () => {
    const rows = treeOf(CHART.filter((a) => a.type === 'liability'), CHART)
    expect(rows.map((r) => [r.acc.code, r.depth, r.children])).toEqual([
      ['4000', 0, 2],
      ['4100', 1, 1],
      ['4053', 2, 0],
      ['4200', 1, 0],
      ['4300', 0, 0],
      ['4900', 0, 0],
    ])
    expect(coaLine(rows[0])).toEqual({ label: 'Fund Sources Payable', sub: 'Financing · 2 sub-accounts', value: '4000', muted: false })
    expect(coaLine(rows[2]).label).toBe(' └ Amount Due to - Carres')
    expect(coaLine(rows[4])).toMatchObject({ sub: 'Financing · inactive', muted: true })
  })

  it('a search keeps the matches and their parents, so the tree still reads', () => {
    expect([...(searchKeep(CHART, CHART, 'carres') ?? [])].sort()).toEqual(['4000', '4053', '4100'])
    expect(searchKeep(CHART, CHART, '  ')).toBeNull()
    expect([...(searchKeep(CHART, CHART, '42') ?? [])].sort()).toEqual(['4000', '4200'])
  })
})
