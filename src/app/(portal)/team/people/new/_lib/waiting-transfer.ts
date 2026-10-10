import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { titleCanRecruit } from '@/lib/commission/titles'
import { statusOf } from '@/lib/commission/sales-group-requests'
import { onTheList, transferFactsFromRow, type WaitingTransferFacts } from '@/lib/commission/waiting-transfer'
import { loadTeam } from '../../../../revenue/_components/config/load'
import { listSubDepartments } from '../../../../revenue/_lib/sub-departments'

/**
 * What the waiting list's employee form starts from (2026-10-10, the HR
 * revamp): the applicant (`member_waiting_transfer`, which asks
 * `member_is_manager` and says whether the sub-department has a free place),
 * the titles its ladder carries — the joining title — and who may lead there,
 * the direct manager. A refusal comes back as words, never a throw.
 */
export interface TransferChoice {
  id: string
  name: string
}

export type WaitingTransferRead =
  | {
      ok: true
      facts: WaitingTransferFacts
      subSlug: string
      /** The ladder's titles, lowest first — the first is where a new member starts. */
      titles: TransferChoice[]
      /** Who may lead in this sub-department; the member who sent the request is marked. */
      managers: Array<TransferChoice & { submittedIt: boolean }>
    }
  | { ok: false; reason: string; subSlug?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadWaitingTransfer(requestId: string): Promise<WaitingTransferRead> {
  // The ladder and the team are Revenue's rows (`loadTeam`): their reader is
  // whoever may see Revenue, as on Sales Groups itself.
  await requirePermission('revenue')
  const missing = { ok: false as const, reason: 'That waiting-list request was not found.' }
  if (!UUID.test(requestId)) return missing
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('member_waiting_transfer', { p_request: requestId })
  if (error) {
    if (error.code === '42501') return { ok: false, reason: 'Transferring needs HR request management access.' }
    return /not found/i.test(error.message ?? '') ? missing : { ok: false, reason: 'The request could not be read. Please try again.' }
  }
  const facts = transferFactsFromRow(data)
  if (!facts) return missing

  const sub = (await listSubDepartments()).find(s => s.id === facts.subDepartmentId)
  if (!sub?.schemeId) return { ok: false, reason: `${facts.subDepartment ?? 'That sub-department'} has no scheme, so nobody can join it yet.` }
  if (!onTheList(facts.status)) {
    return {
      ok: false,
      reason: `${facts.newPerson ?? 'The applicant'} is no longer on ${sub.name}’s waiting list — ${statusOf(facts.status).name.toLowerCase()}.`,
      subSlug: sub.slug,
    }
  }

  const team = await loadTeam(sub.schemeId, { subDepartmentId: sub.id })
  const titleName = new Map(team.titles.map(t => [t.id, t.name]))
  const rungs = team.ranks.map(r => ({ titleId: r.title_id, canRecruit: r.can_recruit, sortOrder: r.sort_order }))
  const titles: TransferChoice[] = []
  for (const r of [...team.ranks].sort((a, b) => a.sort_order - b.sort_order)) {
    if (titles.some(t => t.id === r.title_id)) continue
    titles.push({ id: r.title_id, name: titleName.get(r.title_id) ?? r.label })
  }
  const managers = team.people
    .filter(p => titleCanRecruit(rungs, p.title_id) === true)
    .map(p => ({ id: p.staff_id, name: p.employee_name, submittedIt: p.staff_id === facts.submittedById }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { ok: true, facts, subSlug: sub.slug, titles, managers }
}
