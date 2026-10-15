'use server'

import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeTime } from '@/lib/office-time'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { statementRecordModel, type StatementRecordModel } from '@/lib/fin-app/statement-model'
import { readStatement } from '../_lib/statement-read'

/**
 * A monthly statement as the Finance phone app's record screen opens it
 * (2026-10-15, part 5c): on a phone that screen IS the statement's page, so it
 * reads what `/statements/[id]` reads, behind its gates — the treasury, the
 * page's tabs — and says what this reader may do with it (that page's boxes).
 * Answered in words.
 */
export async function openStatement(id: string): Promise<{ ok: true; record: StatementRecordModel } | { ok: false; reason: string }> {
  const user = await requirePermission('treasury')
  if (!opensPage(user.tabs, '/statements/[id]')) return { ok: false, reason: 'Statements are not open to you.' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/statements/[id]') } : user
  const supabase = await createClient()
  const read = await readStatement(supabase, id)
  if (!read) return { ok: false, reason: 'This statement is not there any more.' }
  const s = read.statement
  return {
    ok: true,
    record: statementRecordModel(
      read,
      { created: officeTime(s.created_at).format('D MMM YYYY'), issued: s.issued_at ? officeTime(s.issued_at).format('D MMM YYYY HH:mm') : null },
      { edit: canDo(acting, 'treasury', 'edit') },
    ),
  }
}
