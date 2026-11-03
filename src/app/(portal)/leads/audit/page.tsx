import { requirePage, requirePermission } from '@/lib/auth'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { auditRows } from '@/lib/leads/audit'
import { loadAudit } from '@/lib/leads/server'
import AuditView from '../_components/AuditView'

export const dynamic = 'force-dynamic'

/**
 * Lead View › Audit log (2026-10-23, the redesign v2 handoff `Audit Log.dc.html`; step 6): who changed Lead View's
 * set-up, when, and what — the portal's own audit_changes(), which shows a reader only what their permissions open.
 * Lead View · View reads it; nothing here writes.
 */
export default async function Page() {
  await requirePage('/leads/audit')
  await requirePermission('leads')
  const audit = await loadAudit()
  if (!audit.ok) {
    return (
      <HvPage>
        <PageHead eyebrow="Lead View" title="Audit log" />
        <div className="sheet-danger">{audit.reason}</div>
      </HvPage>
    )
  }
  return <AuditView rows={auditRows(audit.data.changes, new Map(audit.data.lines.map(l => [l.table_name, l])))} />
}
