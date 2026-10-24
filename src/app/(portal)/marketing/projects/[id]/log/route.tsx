import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import {
  auditChips, auditCsv, auditExportOf, auditFileName, auditFilterOf, auditRows, passesAudit, projectLogFromRow,
} from '@/lib/marketing/audit'
import { AuditDocPdf, AuditTablePdf } from '@/lib/marketing/audit-pdf'
import { officeTime } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A project's formal log exported (2026-10-25, Marketing ④-3b — the user's answers 18 and 21: anybody in Marketing; a
 * formal document and the table as on screen — and the handoff's CSV). The rows the filter in the address keeps, read
 * as the viewer reads the log (mkt_project_log asks Marketing · View itself). A GET route, the portal's file downloads'
 * way: it writes nothing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireActionOn('/marketing/projects/[id]', 'marketing', 'view')
  const { id } = await params
  if (!UUID.test(id)) return new Response('That project is not there.', { status: 404 })
  // Marketing's functions are not in the generated types (lib/marketing/actions.ts reads them the same way).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('mkt_project_log', { p_project: id })
  const log = error ? null : projectLogFromRow(data)
  if (!log) return new Response('That project is not there.', { status: 404 })

  const url = new URL(req.url)
  const format = auditExportOf(url.searchParams.get('format'))
  const filter = auditFilterOf(url.searchParams)
  const all = auditRows(log)
  const rows = all.filter(r => passesAudit(r, filter))
  const whole = (at: string) => (at ? officeTime(at).format('YYYY-MM-DD HH:mm') : '')
  const name = auditFileName(log.track, format)

  if (format === 'csv') {
    // A byte-order mark first, so a spreadsheet reads the names and dashes as UTF-8.
    return new Response(`﻿${auditCsv(rows, whole)}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }
  const props = {
    log, rows, total: all.length, filter: auditChips(filter).map(c => `${c.group}: ${c.value}`),
    by: user.name, at: officeTime().format('YYYY-MM-DD HH:mm'), whole,
  }
  return exportPdfResponse({
    filename: name.replace(/\.pdf$/, ''),
    element: format === 'table' ? <AuditTablePdf {...props} /> : <AuditDocPdf {...props} />,
  })
}
