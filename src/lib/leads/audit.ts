// Lead View › Audit log (2026-10-23, the redesign v2 handoff `Audit Log.dc.html`; step 6): the portal's own history
// (audit_changes(), which shows a reader only what their permissions open) of Lead View's set-up tables, told the way
// the handoff draws it — time, user, module, item, action, change. Conversations, messages and drafts are the Inbox's
// own timeline and are left out; a quick reply's use counter is not a change anybody made.

import { describeChange, whoOf, type AuditChange, type AuditTableLine } from '@/lib/audit/changes'

/** Which page each table belongs to, and where it opens. */
export const AUDIT_MODULES: Readonly<Record<string, { module: string; href: string }>> = {
  lead_info_cards: { module: 'General info', href: '/leads/info' },
  lead_info_cats: { module: 'General info', href: '/leads/info' },
  lead_data_files: { module: 'Data Center', href: '/leads/knowledge' },
  lead_quick_replies: { module: 'Data Center', href: '/leads/knowledge' },
  lead_flows: { module: 'Reply template', href: '/leads/flows' },
  lead_reply_rules: { module: 'Reply rules', href: '/leads/rules' },
  lead_reply_pages: { module: 'Reply rules', href: '/leads/rules' },
  lead_step_library: { module: 'Step library', href: '/leads/library' },
  lead_personas: { module: 'AI Agent', href: '/leads/ai' },
  lead_ai_answers: { module: 'AI Agent', href: '/leads/ai' },
  lead_ai_playbook: { module: 'AI Agent', href: '/leads/ai' },
  lead_ai_sources: { module: 'AI Agent', href: '/leads/ai' },
  lead_business_hours: { module: 'Business hours', href: '/leads/hours' },
  lead_campaigns: { module: 'Campaigns', href: '/leads/campaigns' },
  lead_brands: { module: 'Settings', href: '/leads/settings' },
  lead_sales: { module: 'Settings', href: '/leads/settings' },
  lead_ads: { module: 'Settings', href: '/leads/settings' },
}
export const AUDIT_TABLES = Object.keys(AUDIT_MODULES)

export type AuditAction = 'Added' | 'Edited' | 'Deleted' | 'Paused' | 'Resumed'

export interface AuditRow {
  id: number
  at: string
  by: string
  module: string
  href: string
  item: string
  action: AuditAction
  change: string
}

/** Columns a person did not change (counters, stamps). */
const QUIET = new Set(['used', 'updated_at', 'updated_by_name', 'sort_order', 'ver'])
const clip = (v: string) => (v.length > 60 ? `${v.slice(0, 57)}…` : v)

/** One audit row as the page draws it; null when nothing a person did is in it. */
export function auditRow(c: AuditChange, line: AuditTableLine | undefined): AuditRow | null {
  const where = AUDIT_MODULES[c.table_name]
  if (!where) return null
  const d = describeChange(c, line, new Map())
  const { who } = whoOf(c)
  let action: AuditAction = c.op === 'INSERT' ? 'Added' : c.op === 'DELETE' ? 'Deleted' : 'Edited'
  let change = ''
  if (c.op === 'UPDATE') {
    const fields = d.fields.filter(f => !QUIET.has(f.key))
    if (!fields.length) return null
    const turned = (k: string, to: unknown) => fields.some(f => f.key === k) && c.new_row?.[k] === to
    if (turned('deleted_at', c.new_row?.deleted_at) && c.old_row?.deleted_at == null && c.new_row?.deleted_at != null) {
      action = 'Deleted'
      change = 'Deleted'
    } else if (turned('status', 'paused')) {
      action = 'Paused'
      change = 'Paused'
    } else if (c.old_row?.status === 'paused' && turned('status', 'active')) {
      action = 'Resumed'
      change = 'Resumed'
    } else {
      change = fields.slice(0, 3).map(f => (f.hidden ? `${f.label}: changed` : `${f.label}: “${clip(f.before ?? '—')}” → “${clip(f.after ?? '—')}”`)).join(' · ')
        + (fields.length > 3 ? ` · and ${fields.length - 3} more` : '')
    }
  } else if (c.op === 'INSERT') {
    change = 'Created'
  } else {
    change = 'Deleted'
  }
  return { id: c.id, at: c.occurred_at, by: who, module: where.module, href: where.href, item: d.rowLabel, action, change }
}

/** The page's rows, newest first. */
export function auditRows(changes: AuditChange[], lines: ReadonlyMap<string, AuditTableLine>): AuditRow[] {
  return changes.map(c => auditRow(c, lines.get(c.table_name))).filter((r): r is AuditRow => r !== null)
}
