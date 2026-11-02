import { describe, expect, it } from 'vitest'
import type { AuditChange } from '@/lib/audit/changes'
import { endsWarn, faqCat, knowledgeLog, pbCat } from './agent-page'

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
