import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { decision } from '@/lib/approval-domains'
import { poolLabel } from '@/lib/pools'
import { resolveLiveApprovalAmounts } from '@/lib/approval-amounts'
import { fetchAllRows } from '@/lib/paginate'
import { buildQueueRows, executiveSubmitterIds, queueSummary, type ApprovalRequestRow, type QueueRow } from '@/lib/approval-queue'
import type { AttachmentThumb } from '@/components/voucher/AttachmentThumbs'

// The Principal's queue, read (2026-10-15 — moved out of `/approvals/page.tsx`
// word for word, so the Finance phone app's Approvals reads the same): what
// waits, at its LIVE amount (a voucher edited after it was submitted), who is
// "the executive", each waiting voucher's pool, category, payee, how it is paid
// and its files, the summary, and which rows this reader may decide (and why
// not the others). The decided are `readDecidedSince`'s (2026-10-17: the last
// ten and the month's two counts went with the sheet's page — the hub and the
// phone list the 30 days the Decided card counts).

/** A waiting row with what its vouchers say: the pool(s), the category, who is paid, how, and the files. */
export interface QueueItem extends QueueRow {
  pool: string
  category: string
  payee: string
  payBy: string
  attachments: AttachmentThumb[]
}

type Client = Awaited<ReturnType<typeof createClient>>

const uniq = (xs: string[]) => [...new Set(xs)]

export async function readApprovalQueue(supabase: Client, user: User) {
  const [{ data: pendingRows }, { data: submitters }] = await Promise.all([
    supabase.from('approval_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    supabase.from('users').select('id, name'),
  ])

  const pending = (pendingRows ?? []) as ApprovalRequestRow[]
  const submitterMap = new Map((submitters ?? []).map((u) => [u.id, u.name as string]))
  const nameOf = (id: string) => submitterMap.get(id) ?? 'Unknown'

  // approval_requests.amount is a submit-time snapshot that no edit path
  // refreshes, so an edited-after-submit voucher showed the OLD figure here
  // while the detail page (and the posting) used the new one. Read the amount
  // through to the target row instead — see lib/approval-amounts.ts.
  const liveAmounts = await resolveLiveApprovalAmounts(supabase, pending)
  const amountOf = (row: ApprovalRequestRow): number | null =>
    liveAmounts.has(row.id) ? liveAmounts.get(row.id)! : row.amount === null ? null : Number(row.amount)

  const rows = buildQueueRows(pending, { amountOf, nameOf })

  // Two lookups that hang off the queue: which submitters are "the executive"
  // (their staff title's level, HR's own banding), and the pool / category
  // behind each waiting voucher for the phone's panel.
  const submitterIds = uniq(pending.map((r) => r.submitted_by))
  const voucherIds = uniq(rows.flatMap((r) => r.voucherIds))
  const none = { data: [] as never[] }
  const [{ data: staff }, { data: sources }, { data: vouchers }, { data: attachmentRows }] = await Promise.all([
    submitterIds.length > 0
      ? supabase.from('hr_staff_costs').select('user_id, title_id').in('user_id', submitterIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string | null; title_id: string | null }> }),
    voucherIds.length > 0
      ? supabase
          .from('payment_voucher_sources')
          .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
          .in('voucher_id', voucherIds)
          .order('amount', { ascending: false })
      : Promise.resolve(none),
    // The voucher itself — who is paid, how — and its files, for the phone's panel.
    voucherIds.length > 0
      ? supabase.from('payment_vouchers').select('id, payee_name, payment_method, bank_account_id').in('id', voucherIds)
      : Promise.resolve(none),
    voucherIds.length > 0
      ? supabase.from('payment_attachments').select('id, voucher_id, file_name, file_type').in('voucher_id', voucherIds).order('uploaded_at', { ascending: true })
      : Promise.resolve(none),
  ])
  const titleIds = uniq((staff ?? []).map((s) => s.title_id).filter((id): id is string => !!id))
  const bankIds = uniq((vouchers ?? []).map((v) => v.bank_account_id).filter((id): id is string => !!id))
  const [{ data: titles }, { data: levels }, { data: banks }] = await Promise.all([
    titleIds.length > 0
      ? supabase.from('titles').select('id, level_id').in('id', titleIds)
      : Promise.resolve({ data: [] as Array<{ id: string; level_id: string | null }> }),
    titleIds.length > 0
      ? supabase.from('title_levels').select('id, name, rank')
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; rank: number }> }),
    bankIds.length > 0
      ? supabase.from('bank_accounts').select('id, bank_name').in('id', bankIds)
      : Promise.resolve({ data: [] as Array<{ id: string; bank_name: string }> }),
  ])
  const executives = executiveSubmitterIds(staff ?? [], titles ?? [], levels ?? [])

  const bankName = new Map((banks ?? []).map((b) => [b.id, b.bank_name]))
  const voucherById = new Map((vouchers ?? []).map((v) => [v.id, v]))
  const attachmentsByVoucher = new Map<string, Array<{ id: string; fileName: string; fileType: string }>>()
  for (const a of attachmentRows ?? []) {
    const list = attachmentsByVoucher.get(a.voucher_id) ?? []
    list.push({ id: a.id, fileName: a.file_name, fileType: a.file_type })
    attachmentsByVoucher.set(a.voucher_id, list)
  }
  const methodLabel = (m: string | null) => {
    const words = (m ?? '').replace(/_/g, ' ').trim()
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
  }
  /** "Landlord Sdn Bhd" — or, for a batch paying several people, "Aina + 25 more". */
  const payeeOf = (ids: string[]) => {
    const names = uniq(ids.map((id) => voucherById.get(id)?.payee_name ?? '').filter(Boolean))
    return names.length <= 1 ? (names[0] ?? '') : `${names[0]} + ${names.length - 1} more`
  }
  const payByOf = (ids: string[]) => {
    const v = ids.map((id) => voucherById.get(id)).find(Boolean)
    if (!v) return ''
    const bank = v.bank_account_id ? bankName.get(v.bank_account_id) : undefined
    return [methodLabel(v.payment_method), bank].filter(Boolean).join(' · ')
  }
  const summary = queueSummary(rows, new Date(), executives)

  const poolsByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  for (const s of (sources ?? []) as Array<{
    voucher_id: string
    pool: string
    account_code: string | null
    chart_of_accounts: { name: string } | null
  }>) {
    const pools = poolsByVoucher.get(s.voucher_id) ?? []
    if (!pools.includes(poolLabel(s.pool))) pools.push(poolLabel(s.pool))
    poolsByVoucher.set(s.voucher_id, pools)
    const label = s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
    if (label) {
      const cats = categoriesByVoucher.get(s.voucher_id) ?? []
      if (!cats.includes(label)) cats.push(label)
      categoriesByVoucher.set(s.voucher_id, cats)
    }
  }
  const queue: QueueItem[] = rows.map((r) => ({
    ...r,
    pool: uniq(r.voucherIds.flatMap((id) => poolsByVoucher.get(id) ?? [])).join(' + '),
    category: uniq(r.voucherIds.flatMap((id) => categoriesByVoucher.get(id) ?? [])).join(' + '),
    payee: payeeOf(r.voucherIds),
    payBy: payByOf(r.voucherIds),
    attachments: r.voucherIds.flatMap((id) => attachmentsByVoucher.get(id) ?? []),
  }))

  // Which rows this reader may tick and decide, and why not the others.
  const undecidable = Object.fromEntries(
    queue.flatMap((r) => {
      const verdict = decision(user, r.requestTypes, r.submitterIds)
      return verdict.may ? [] : [[r.key, verdict.why]]
    }),
  ) as Record<string, string>

  return { queue, summary, undecidable, executives: [...executives] }
}

/**
 * Every request decided since `since` (2026-10-15, the Finance phone app's
 * *Decided · 30 days* list — the desktop card's figure, so the list holds what
 * the card counts): newest first, read in pages, each at its live amount, with
 * who sent it.
 */
export async function readDecidedSince(supabase: Client, since: string) {
  const rows = await fetchAllRows<ApprovalRequestRow>(
    (from, to) =>
      supabase
        .from('approval_requests')
        .select('id, request_type, description, amount, reference_id, reference_table, submitted_by, group_id, created_at, approved_at, status')
        .neq('status', 'pending')
        .gte('approved_at', since)
        .order('approved_at', { ascending: false })
        .order('id')
        .range(from, to),
    'readDecidedSince',
  )
  const submitterIds = uniq(rows.map((r) => r.submitted_by))
  const [liveAmounts, { data: people }] = await Promise.all([
    resolveLiveApprovalAmounts(supabase, rows),
    submitterIds.length > 0 ? supabase.from('users').select('id, name').in('id', submitterIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const names = new Map((people ?? []).map((u) => [u.id, u.name as string]))
  return {
    rows,
    amountOf: (row: ApprovalRequestRow): number | null => (liveAmounts.has(row.id) ? liveAmounts.get(row.id)! : row.amount === null ? null : Number(row.amount)),
    nameOf: (id: string) => names.get(id) ?? 'Unknown',
  }
}
