import { describe, expect, it } from 'vitest'
import type { AuditChange, AuditTableLine } from '@/lib/audit/changes'
import { auditRow } from './audit'

const line = (t: string, label: string[]): AuditTableLine => ({ table_name: t, label: t, area: 'Member services', mode: 'all', label_columns: label, reason: null })
const ch = (o: Partial<AuditChange>): AuditChange => ({
  id: 1, occurred_at: '2026-10-23T02:00:00Z', actor_id: 'u1', actor_name: 'Mei Ling', actor_source: 'portal', table_name: 'lead_info_cards',
  row_key: 'x', op: 'UPDATE', old_row: null, new_row: null, changed: null, masked: null, txid: 1, ...o,
})

describe('Lead View › Audit log rows', () => {
  it('tells an edit field by field, before → after', () => {
    const r = auditRow(ch({ old_row: { name: 'KL showroom', note: '10am – 9pm' }, new_row: { name: 'KL showroom', note: '10am – 10pm' }, changed: ['note'] }), line('lead_info_cards', ['name']))
    expect(r).toMatchObject({ by: 'Mei Ling', module: 'General info', href: '/leads/info', item: 'KL showroom', action: 'Edited' })
    expect(r?.change).toContain('“10am – 9pm” → “10am – 10pm”')
  })

  it('names adds, deletes, soft deletes and pauses', () => {
    expect(auditRow(ch({ table_name: 'lead_flows', op: 'INSERT', new_row: { name: 'Sofa' } }), line('lead_flows', ['name']))).toMatchObject({ module: 'Reply template', action: 'Added', change: 'Created' })
    expect(auditRow(ch({ table_name: 'lead_flows', op: 'DELETE', old_row: { name: 'Sofa' } }), line('lead_flows', ['name']))?.action).toBe('Deleted')
    expect(auditRow(ch({ table_name: 'lead_data_files', old_row: { name: 'a.pdf', deleted_at: null }, new_row: { name: 'a.pdf', deleted_at: '2026-10-23' }, changed: ['deleted_at'] }), line('lead_data_files', ['name']))?.action).toBe('Deleted')
    expect(auditRow(ch({ table_name: 'lead_data_files', old_row: { name: 'a.pdf', status: 'active' }, new_row: { name: 'a.pdf', status: 'paused' }, changed: ['status'] }), line('lead_data_files', ['name']))?.action).toBe('Paused')
    expect(auditRow(ch({ table_name: 'lead_data_files', old_row: { name: 'a.pdf', status: 'paused' }, new_row: { name: 'a.pdf', status: 'active' }, changed: ['status'] }), line('lead_data_files', ['name']))?.action).toBe('Resumed')
  })

  it('leaves out what nobody changed, and tables that are not set-up', () => {
    expect(auditRow(ch({ table_name: 'lead_quick_replies', old_row: { used: 1 }, new_row: { used: 2 }, changed: ['used', 'updated_at'] }), line('lead_quick_replies', ['shortcut']))).toBeNull()
    expect(auditRow(ch({ table_name: 'lead_contacts', op: 'INSERT', new_row: {} }), undefined)).toBeNull()
  })
})
