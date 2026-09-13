'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPeriodMonth } from '@/lib/utils'
import { requirePermission } from '@/lib/auth'
import { ErpApiError, createErpClient, type ErpClient, type ErpIdentity } from '@/lib/erp-link/client'
import { keyHint, normaliseErpBaseUrl } from '@/lib/erp-link/url'
import {
  addPullStats,
  buildDelivery,
  deletedDelivery,
  docNoOf,
  emptyPullStats,
  listRowHash,
  mapLimit,
  monthBounds,
  planPull,
  type KnownDoc,
  type PullItem,
  type PullStats,
} from '@/lib/erp-link/pull'
import { dropErpLinkSecret, getErpLinkSecret, putErpLinkSecret } from '@/lib/erp-link/secret'
import { isoDate, toCanonicalOrder } from '@/lib/erp-sync/contract'
import { assertErpSubDepartment, requireErpLink } from './_lib/erp-link'

/**
 * The ERP link, from the Comm Cal page: paste a key, prove it, sync a month.
 *
 * Every action here is a person with the revenue permission acting through
 * their own session — the batches, orders, lines and event rows a pull writes
 * go through `ingest_erp_sales_order` under that session, exactly as a
 * replayed held delivery does. The one thing the session cannot touch is the
 * key itself, which lives in Vault behind service-role-only functions
 * (src/lib/erp-link/secret.ts).
 *
 * erp_links / erp_pull_docs / the RPCs postdate database.types.ts —
 * untyped-client convention.
 */

/** Documents fetched from the ERP at once; each is two requests. */
const FETCH_PARALLEL = 4

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function friendly(err: unknown): Error {
  if (err instanceof ErpApiError) {
    switch (err.kind) {
      case 'unauthorized':
        return new Error(`The ERP did not accept this key (${err.message}). Check it was copied whole, and that it has not expired.`)
      case 'forbidden':
        return new Error(`The ERP accepted the key but refused the read: ${err.message}`)
      default:
        return new Error(err.message)
    }
  }
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * Prove a key: who the ERP says it is, and that it can read sales orders. A
 * key the ERP accepts but that cannot open the sales-order list (a Sales
 * Executive's sign-in, say) fails here rather than on the first sync.
 */
async function prove(erp: ErpClient, period: string): Promise<ErpIdentity> {
  const who = await erp.whoAmI()
  const { from, to } = monthBounds(period)
  await erp.listSalesOrders({ from, to, page: 0, pageSize: 1 })
  return who
}

async function erpClientFor(supabase: SupabaseClient, subDepartmentId: string): Promise<{ erp: ErpClient; companyId: number }> {
  const link = await requireErpLink(supabase, subDepartmentId)
  const apiKey = await getErpLinkSecret(subDepartmentId)
  if (!apiKey) throw new Error('The ERP key is missing. Paste it again.')
  return { erp: createErpClient({ baseUrl: link.baseUrl, apiKey, companyId: link.companyId }), companyId: link.companyId }
}

function describeIdentity(who: ErpIdentity): string {
  return who.service ? 'the ERP service key' : `${who.name}${who.role ? ` (${who.role})` : ''}`
}

/** The link form: address + key + company → proven against the ERP, then stored. */
export async function linkErp(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')
  const subDepartmentId = String(fd.get('sub_department_id') ?? '').trim()
  const baseUrl = normaliseErpBaseUrl(String(fd.get('base_url') ?? ''))
  const apiKey = String(fd.get('api_key') ?? '').trim()
  const companyId = Number(String(fd.get('company_id') ?? '1').trim() || '1')
  if (!subDepartmentId) throw new Error('No sub-department')
  if (apiKey.length < 8) throw new Error('Paste the whole API key')
  if (!Number.isInteger(companyId) || companyId < 1) throw new Error('Company must be a whole number (Houzs Century is 1)')

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  let who: ErpIdentity
  try {
    who = await prove(createErpClient({ baseUrl, apiKey, companyId }), getPeriodMonth())
  } catch (err) {
    throw friendly(err)
  }

  await putErpLinkSecret(subDepartmentId, apiKey)

  const now = new Date().toISOString()
  const { error } = await supabase.from('erp_links').upsert(
    {
      sub_department_id: subDepartmentId,
      base_url: baseUrl,
      company_id: companyId,
      key_hint: keyHint(apiKey),
      identity: { id: who.id, name: who.name, role: who.role, service: who.service },
      linked_by: user.id,
      linked_by_name: user.name,
      linked_at: now,
      last_check_at: now,
      last_check_ok: true,
      last_check_note: `Signed in as ${describeIdentity(who)}; sales orders readable.`,
      updated_at: now,
    },
    { onConflict: 'sub_department_id' },
  )
  if (error) throw new Error(`The key was stored but the link could not be saved: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}

export interface LinkCheck {
  ok: boolean
  note: string
}

/** Test connection: the same proof as linking, against the stored key. */
export async function testErpLink(subDepartmentId: string): Promise<LinkCheck> {
  await requirePermission('revenue')
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)
  const { erp } = await erpClientFor(supabase, subDepartmentId)

  let ok = true
  let note: string
  try {
    const who = await prove(erp, getPeriodMonth())
    note = `Signed in as ${describeIdentity(who)}; sales orders readable.`
  } catch (err) {
    ok = false
    note = friendly(err).message
  }

  const { error } = await supabase
    .from('erp_links')
    .update({ last_check_at: new Date().toISOString(), last_check_ok: ok, last_check_note: note, updated_at: new Date().toISOString() })
    .eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not record the check: ${error.message}`)

  revalidatePath('/revenue', 'layout')
  return { ok, note }
}

/** Forget the link and its key. Orders already pulled stay. */
export async function unlinkErp(subDepartmentId: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  const { error } = await supabase.from('erp_links').delete().eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not unlink: ${error.message}`)
  await supabase.from('erp_pull_docs').delete().eq('sub_department_id', subDepartmentId)
  await dropErpLinkSecret(subDepartmentId)

  revalidatePath('/revenue', 'layout')
}

export interface PullPlanResult {
  listed: number
  unchanged: number
  items: PullItem[]
}

/**
 * Step one of a sync: list the month on the ERP and decide which documents
 * need reading. Cheap to repeat — it reads nothing but the list.
 */
export async function planErpPull(subDepartmentId: string, period: string, force: boolean): Promise<PullPlanResult> {
  await requirePermission('revenue')
  const { from, to } = monthBounds(period)
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)
  const { erp } = await erpClientFor(supabase, subDepartmentId)

  let rows
  try {
    rows = await erp.listSalesOrdersBetween(from, to)
  } catch (err) {
    throw friendly(err)
  }

  const { data: knownRows, error } = await supabase
    .from('erp_pull_docs')
    .select('doc_no, list_hash')
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
  if (error) throw new Error(`Could not read what the last sync remembered: ${error.message}`)

  const known = new Map<string, KnownDoc>()
  for (const r of (knownRows ?? []) as Array<{ doc_no: string; list_hash: string }>) {
    known.set(r.doc_no, { listHash: r.list_hash })
  }

  const plan = planPull(rows, known, force)
  return { listed: plan.listed, unchanged: plan.unchanged, items: plan.items }
}

export interface PullChunkResult {
  stats: Partial<PullStats>
  errors: Array<{ docNo: string; message: string }>
}

interface Fetched {
  item: PullItem
  delivery: ReturnType<typeof buildDelivery> | null
  periodMonth: string | null
  error: string | null
}

/**
 * Step two, repeated: read these documents from the ERP and put each through
 * the ingest RPC. The reads run a few at a time; the writes run one after
 * another, because the RPC re-sequences the day and refreshes the batch
 * counters and two of them racing would count twice.
 */
export async function pullErpDocs(subDepartmentId: string, period: string, items: PullItem[]): Promise<PullChunkResult> {
  await requirePermission('revenue')
  monthBounds(period)
  if (!Array.isArray(items) || items.length === 0) return { stats: {}, errors: [] }
  if (items.length > 100) throw new Error('At most 100 documents per step')

  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)
  const { erp, companyId } = await erpClientFor(supabase, subDepartmentId)

  const fetched = await mapLimit<PullItem, Fetched>(items, FETCH_PARALLEL, async item => {
    const snapshotAt = new Date().toISOString()
    try {
      const detail = await erp.getSalesOrder(item.docNo)
      if (!detail) return { item, delivery: deletedDelivery(item.docNo, snapshotAt), periodMonth: null, error: null }
      const payments = await erp.getPayments(item.docNo)
      const delivery = buildDelivery({ docNo: item.docNo, header: detail.header, items: detail.items, payments, companyId, snapshotAt })
      const day = isoDate(detail.header.so_date)
      return { item, delivery, periodMonth: day ? `${day.slice(0, 7)}-01` : null, error: null }
    } catch (err) {
      return { item, delivery: null, periodMonth: null, error: friendly(err).message }
    }
  })

  let stats = emptyPullStats()
  const errors: PullChunkResult['errors'] = []

  for (const f of fetched) {
    if (!f.delivery) {
      stats = addPullStats(stats, { failed: 1 })
      errors.push({ docNo: f.item.docNo, message: f.error ?? 'Could not read the document' })
      continue
    }
    stats = addPullStats(stats, { fetched: 1 })

    const parsed = toCanonicalOrder(f.delivery)
    if (!parsed.ok) {
      stats = addPullStats(stats, { failed: 1 })
      errors.push({ docNo: f.item.docNo, message: parsed.error })
      continue
    }

    const { data, error } = await supabase.rpc('ingest_erp_sales_order', { p_order: parsed.order })
    if (error) {
      stats = addPullStats(stats, { failed: 1 })
      errors.push({ docNo: f.item.docNo, message: error.message })
      continue
    }
    const status = String((data as { status?: string } | null)?.status ?? 'error')

    if (f.delivery.deleted) {
      stats = addPullStats(stats, { deleted: 1 })
      await supabase.from('erp_pull_docs').delete().eq('sub_department_id', subDepartmentId).eq('doc_no', f.item.docNo)
      continue
    }

    switch (status) {
      case 'applied':
      case 'duplicate':
      case 'stale':
      case 'held':
      case 'skipped': {
        const key: keyof PullStats = status
        stats = addPullStats(stats, { [key]: 1 })
        break
      }
      default:
        stats = addPullStats(stats, { failed: 1 })
        errors.push({ docNo: f.item.docNo, message: `Unexpected outcome: ${status}` })
        continue
    }

    // Remember the list row's hash so the next sync skips an unchanged
    // document. A verified (re-dated) document has no list row from this
    // month; its own header stands in, and the next sync of its new month
    // reads it once more before settling.
    const hash = f.item.kind === 'changed' && f.item.hash !== '' ? f.item.hash : listRowHash(f.delivery.header ?? {})
    const { error: memoError } = await supabase.from('erp_pull_docs').upsert(
      {
        sub_department_id: subDepartmentId,
        doc_no: docNoOf(f.delivery.header ?? {}) ?? f.item.docNo,
        period_month: f.periodMonth ?? period,
        list_hash: hash,
        last_seen_at: new Date().toISOString(),
        last_ingested_at: new Date().toISOString(),
        last_status: status,
      },
      { onConflict: 'sub_department_id,doc_no' },
    )
    if (memoError) errors.push({ docNo: f.item.docNo, message: `Ingested, but could not remember it: ${memoError.message}` })
  }

  if (stats.applied > 0 || stats.deleted > 0) revalidatePath('/revenue', 'layout')
  return { stats, errors }
}

/** Step three: what the sync came to, on the link card. */
export async function recordErpPull(subDepartmentId: string, period: string, stats: PullStats, note: string): Promise<void> {
  await requirePermission('revenue')
  monthBounds(period)
  const supabase = await client()
  await assertErpSubDepartment(supabase, subDepartmentId)

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('erp_links')
    .update({ last_pull_at: now, last_pull_period: period, last_pull_note: note, last_pull_stats: stats, updated_at: now })
    .eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not record the sync: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}
