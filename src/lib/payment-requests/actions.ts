'use server'

import { revalidatePath } from 'next/cache'
import { requireActionOn, requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { PR_BUCKET, PR_LIMITS, parseContext, parseRequest, type PaymentRequest, type RequestContext, type SavePayload, type UploadedFile } from './model'

// One's own payment requests (2026-10-29, PR ② of docs/module-spec-payment-requests.md): the Claim page's steps — the
// New request window's lists, a request saved or sent, withdrawn, and its files opened. Under the caller's own session:
// the database decides who may (mig 20261029180000 — Claims · Create at Own, one's own requests only). Each answers in
// words: production hides a thrown Server Action message behind a digest.

type Answer<T> = { ok: true; data: T } | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
/** The database's own refusals are said in words (nothing typed, not yours, thirty a day); anything else is not. */
const SAID = new Set(['22023', '42501', '54000'])
const words = (error: { code?: string; message?: string } | null, fallback: string) =>
  error?.message?.trim() && ((error.code && SAID.has(error.code)) || error.message.startsWith('Read-only')) ? error.message.trim() : fallback

/** What the browser sent, as the database files it — nothing else of what it said. */
function cleanPayload(raw: unknown): SavePayload | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o || (o.kind !== 'claim' && o.kind !== 'direct_pay')) return null
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const rows = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []).map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
  const payTo = o.payTo && typeof o.payTo === 'object' ? (o.payTo as Record<string, unknown>) : null
  const supplier = o.supplier && typeof o.supplier === 'object' ? (o.supplier as Record<string, unknown>) : null
  const files: UploadedFile[] = rows(o.files, PR_LIMITS.files + 1).flatMap((f) =>
    typeof f.path === 'string'
      ? [{
          path: f.path.slice(0, 400),
          name: text(f.name, 200) || 'file',
          contentType: text(f.contentType, 120),
          size: typeof f.size === 'number' && Number.isFinite(f.size) ? Math.max(0, Math.round(f.size)) : 0,
        }]
      : [],
  )
  return {
    kind: o.kind,
    ...(o.kind === 'claim'
      ? { payTo: payTo?.salary === false ? { salary: false as const, bank: text(payTo.bank, 120), accountNo: text(payTo.accountNo, 40) } : { salary: true as const } }
      : { supplier: { name: text(supplier?.name, 200), bank: text(supplier?.bank, 120), accountNo: text(supplier?.accountNo, 40) } }),
    items: rows(o.items, PR_LIMITS.items + 1).map((i) => ({ description: text(i.description, 200), amount: text(i.amount, 20) })),
    shares: rows(o.shares, PR_LIMITS.shares + 1).map((s) => ({
      party: s.party === 'company' ? ('company' as const) : ('department' as const),
      ...(s.party === 'company' ? { companyId: text(s.companyId, 40) } : { departmentId: text(s.departmentId, 40) }),
      amount: text(s.amount, 20),
    })),
    files,
    removeFiles: (Array.isArray(o.removeFiles) ? o.removeFiles : []).filter(isId).slice(0, 20),
  }
}

/** The New request window's lists — who sends it, the department's pool, HR's salary account — read when it opens. */
export async function openNewRequest(): Promise<Answer<RequestContext>> {
  const user = await requireAuth()
  if (user.viewingAs) return { ok: false, reason: READ_ONLY_MESSAGE }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_request_context')
  if (error) return { ok: false, reason: words(error, 'The window could not be opened. Please try again.') }
  const ctx = parseContext(data)
  return ctx ? { ok: true, data: ctx } : { ok: false, reason: 'The window could not be opened. Please try again.' }
}

/**
 * Save one's own request — new, a draft, or a rejected one being fixed — and with `submit`, send it to Finance. The
 * database checks it whole first (the items, a receipt, who is paid, the shares under the total) and refuses in words.
 */
export async function saveRequest(id: string | null, payload: unknown, submit: boolean): Promise<Answer<PaymentRequest>> {
  const user = await requireActionOn('/claims', 'claims', 'create', 'own')
  if (user.viewingAs) return { ok: false, reason: READ_ONLY_MESSAGE }
  if (id !== null && !isId(id)) return { ok: false, reason: 'Which request? Reload the page and try again.' }
  const data = cleanPayload(payload)
  if (!data) return { ok: false, reason: 'Pick what it is first.' }

  const supabase = await createClient()
  const { data: saved, error } = await supabase.rpc('payment_request_save', { p_request: id, p_data: data as never, p_submit: submit === true })
  if (error) return { ok: false, reason: words(error, 'The request could not be saved. Please try again.') }
  const request = parseRequest(saved)
  if (!request) return { ok: false, reason: 'The request could not be saved. Please try again.' }

  revalidatePath('/claims')
  if (submit) revalidatePath('/payments/requests')
  return { ok: true, data: request }
}

/** Withdraw one's own request while Finance has no voucher for it. */
export async function cancelRequest(id: string): Promise<Answer<PaymentRequest>> {
  const user = await requireActionOn('/claims', 'claims', 'create', 'own')
  if (user.viewingAs) return { ok: false, reason: READ_ONLY_MESSAGE }
  if (!isId(id)) return { ok: false, reason: 'Which request? Reload the page and try again.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_request_cancel', { p_request: id })
  if (error) return { ok: false, reason: words(error, 'The request could not be cancelled. Please try again.') }
  const request = parseRequest(data)
  if (!request) return { ok: false, reason: 'The request could not be cancelled. Please try again.' }

  revalidatePath('/claims')
  revalidatePath('/payments/requests')
  return { ok: true, data: request }
}

/**
 * A request's file, by a five-minute link: for whoever sent it, and for Finance (Treasury) once it is sent — the
 * database names the file (`payment_request_file`) and the bucket's policy lets the link be signed.
 */
export async function openRequestFile(fileId: string): Promise<Answer<{ url: string; name: string }>> {
  await requireAuth()
  if (!isId(fileId)) return { ok: false, reason: 'That file is not there.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('payment_request_file', { p_file: fileId })
  const f = (data ?? {}) as { path?: unknown; name?: unknown }
  if (error || typeof f.path !== 'string') return { ok: false, reason: words(error, 'The file could not be opened. Please try again.') }
  const name = typeof f.name === 'string' ? f.name : 'file'
  const signed = await supabase.storage.from(PR_BUCKET).createSignedUrl(f.path, 300)
  if (signed.error || !signed.data) return { ok: false, reason: 'The file could not be opened. Please try again.' }
  return { ok: true, data: { url: signed.data.signedUrl, name } }
}
