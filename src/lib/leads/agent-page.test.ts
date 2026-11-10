import { describe, expect, it } from 'vitest'
import type { AuditChange } from '@/lib/audit/changes'
import { brandRowState, endsWarn, faqCat, knowledgeLog, pbCat } from './agent-page'

describe('the left lists', () => {
  it('sorts fixed answers by their words', () => {
    expect(['Can I pay by instalments?', 'Do you deliver to Penang?', 'What colours does the sofa bed come in?'].map(faqCat)).toEqual(['pay', 'del', 'prod'])
  })
  it('sorts the playbook by its names', () => {
    expect(['Too expensive', 'Not sure which one', 'Let me think about it'].map(pbCat)).toEqual(['price', 'choose', 'hes'])
  })
})

describe('endsWarn', () => {
  it('warns a week ahead and after', () => {
    expect(endsWarn('2026-11-04', '2026-11-01')).toEqual({ text: 'Ends in 3 days', ended: false })
    expect(endsWarn('2026-10-30', '2026-11-01')).toEqual({ text: 'Ended 2 days ago', ended: true })
    expect(endsWarn('2026-11-20', '2026-11-01')).toBeNull()
    expect(endsWarn(null, '2026-11-01')).toBeNull()
  })
})

describe('knowledgeLog', () => {
  const ch = (id: number, op: AuditChange['op'], old: Record<string, unknown> | null, now: Record<string, unknown> | null, at: string): AuditChange => ({
    id, occurred_at: at, actor_id: null, actor_name: 'Mei Ling', actor_source: 'portal', table_name: 'lead_ai_knowledge', row_key: null, op, old_row: old, new_row: now, changed: null, masked: null, txid: id,
  })
  const k = { brand_id: 'b1', kind: 'file', ref: 'f1', paused: false }
  it('tells adds, pauses and removals of this brand, newest first, with the ended files', () => {
    const rows = knowledgeLog([
      ch(1, 'INSERT', null, k, '2026-10-18T02:00:00Z'),
      ch(2, 'UPDATE', k, { ...k, paused: true }, '2026-10-19T02:00:00Z'),
      ch(3, 'DELETE', { ...k, brand_id: 'b2' }, null, '2026-10-20T02:00:00Z'),
      ch(4, 'DELETE', k, null, '2026-10-21T02:00:00Z'),
    ], 'b1', [{ id: 'f9', validUntil: '2026-10-31' }])
    expect(rows.map(r => [r.act, r.ref])).toEqual([['Expired', 'f9'], ['Removed', 'f1'], ['Paused', 'f1'], ['Added', 'f1']])
  })
})

// Knowledge › Add files, 2026-11-10: every top folder of 2990s already added left a brand box that looked clickable
// and did nothing, and the "already added" note never showed.
describe('brandRowState', () => {
  const inner = ['folder:sofa', 'folder:mattress', 'folder:testing']
  it('every folder in it added: added and locked', () => {
    expect(brandRowState(inner, new Set(inner), [])).toEqual({ added: true, lock: true, on: false })
  })
  it('some still to add: open; ticked once the rest are picked now', () => {
    const have = new Set(['folder:sofa'])
    expect(brandRowState(inner, have, [])).toEqual({ added: false, lock: false, on: false })
    expect(brandRowState(inner, have, ['folder:mattress', 'folder:testing'])).toEqual({ added: false, lock: false, on: true })
  })
  it('nothing in it: locked', () => {
    expect(brandRowState([], new Set(), [])).toEqual({ added: false, lock: true, on: false })
  })
})
