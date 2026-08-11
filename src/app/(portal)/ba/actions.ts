'use server'

// Bank BA registry actions (user 2026-08-07, v2 2026-08-11). Registry +
// calculator layer — the PRINCIPAL never moves through HV's bank, but the
// interest is real (user: "不会真实过银行，但是那些算的利息我是真的要去 bill
// 和真的要给回houzs的"):
//   · charge line (2.5%/mo) → generateBaInvoice → the EXACT same
//     createMultiLineInvoice as the manual Create Invoice button, revenue
//     account 5028 Interest Income - BA, normal review → issue flow.
//   · owe line (1.5%/mo) → generateBaPv → the EXACT same createPaymentVoucher
//     path as the manual payments form (draft → submit → approve), expense
//     account 6001 Interest Expense - BA, venture_pool source row.
// No JE is posted from here, so nothing double-books.

import dayjs from 'dayjs'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { calcBa } from '@/lib/ba'
import { createMultiLineInvoice } from '../billing/actions'
import { createPaymentVoucher } from '../payments/actions'

// ba_* tables postdate the generated database.types.ts — same untyped
// client convention as the allocator tables.
async function baClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

const r2 = (n: number) => Math.round(n * 100) / 100

export interface BaInput {
  baNo: string
  bankName: string
  faceAmount: number
  bankAnnualRatePct: number
  startDate: string
  tenorDays: number
  chargeRatePctMonthly: number
  hcRatePctMonthly: number
  borrowerCompanyId: string | null
  borrowerName: string
  notes: string
}

export async function createBa(input: BaInput): Promise<{ error?: string; id?: string }> {
  try {
    const user = await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    if (!(input.faceAmount > 0)) return { error: 'Face amount must be greater than 0' }
    if (!(input.tenorDays > 0)) return { error: 'Tenor (days) must be greater than 0' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { error: 'Start date is required' }

    const { data, error } = await supabase
      .from('ba_facilities')
      .insert({
        ba_no: input.baNo.trim() || null,
        bank_name: input.bankName.trim() || null,
        face_amount: input.faceAmount,
        bank_annual_rate: input.bankAnnualRatePct / 100,
        start_date: input.startDate,
        tenor_days: Math.round(input.tenorDays),
        charge_rate_monthly: input.chargeRatePctMonthly / 100,
        hc_rate_monthly: input.hcRatePctMonthly / 100,
        borrower_company_id: input.borrowerCompanyId,
        borrower_name: input.borrowerName.trim() || null,
        notes: input.notes.trim() || null,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error || !data) return { error: `Save failed: ${error?.message ?? 'unknown'}` }

    revalidatePath('/ba')
    return { id: data.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save failed' }
  }
}

// A BA with a live (non-voided) interest invoice or PV must not be edited or
// deleted — the generated documents would silently go stale. Void/delete those
// first, then the row unlocks.
async function liveInterestDocs(
  supabase: SupabaseClient,
  baId: string,
): Promise<string | null> {
  const [{ data: inv }, { data: pv }] = await Promise.all([
    supabase
      .from('invoices')
      .select('invoice_no, status')
      .eq('reference_no', `BA-${baId.slice(0, 8)}`)
      .neq('status', 'voided')
      .maybeSingle(),
    supabase
      .from('payment_vouchers')
      .select('voucher_no, status')
      .eq('reference_type', 'ba_interest')
      .eq('reference_id', baId)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      .maybeSingle(),
  ])
  const bits: string[] = []
  if (inv) bits.push(`invoice ${inv.invoice_no ?? ''} (${inv.status})`)
  if (pv) bits.push(`PV ${pv.voucher_no ?? ''} (${pv.status})`)
  return bits.length > 0 ? bits.join(' + ') : null
}

export async function updateBa(id: string, input: BaInput): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    if (!(input.faceAmount > 0)) return { error: 'Face amount must be greater than 0' }
    if (!(input.tenorDays > 0)) return { error: 'Tenor (days) must be greater than 0' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { error: 'Start date is required' }

    const docs = await liveInterestDocs(supabase, id)
    if (docs) return { error: `This BA already has ${docs} — void/delete those first, then edit` }

    const { error } = await supabase
      .from('ba_facilities')
      .update({
        ba_no: input.baNo.trim() || null,
        bank_name: input.bankName.trim() || null,
        face_amount: input.faceAmount,
        bank_annual_rate: input.bankAnnualRatePct / 100,
        start_date: input.startDate,
        tenor_days: Math.round(input.tenorDays),
        charge_rate_monthly: input.chargeRatePctMonthly / 100,
        hc_rate_monthly: input.hcRatePctMonthly / 100,
        borrower_company_id: input.borrowerCompanyId,
        borrower_name: input.borrowerName.trim() || null,
        notes: input.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return { error: `Update failed: ${error.message}` }

    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' }
  }
}

export async function deleteBa(id: string): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    const docs = await liveInterestDocs(supabase, id)
    if (docs) return { error: `This BA already has ${docs} — void/delete those first, then delete` }

    // Clean the stored documents, then the row (ba_attachments rows cascade).
    const { data: atts } = await supabase
      .from('ba_attachments')
      .select('storage_path')
      .eq('ba_id', id)
    const paths = ((atts ?? []) as Array<{ storage_path: string }>).map(a => a.storage_path)
    if (paths.length > 0) {
      await supabase.storage.from('payment-attachments').remove(paths).catch(() => {})
    }

    const { error } = await supabase.from('ba_facilities').delete().eq('id', id)
    if (error) return { error: `Delete failed: ${error.message}` }

    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Delete failed' }
  }
}

export async function setBaStatus(
  id: string,
  status: 'active' | 'settled' | 'cancelled',
): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { error } = await supabase
      .from('ba_facilities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: `Update failed: ${error.message}` }
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' }
  }
}

export async function setBaNotes(id: string, notes: string): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { error } = await supabase
      .from('ba_facilities')
      .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: `Update failed: ${error.message}` }
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' }
  }
}

// ── Limits (per borrower company; over-limit WARNS, never blocks) ───────────

export async function setBaLimit(
  companyId: string,
  limitAmount: number,
): Promise<{ error?: string }> {
  try {
    const user = await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    if (!(limitAmount >= 0)) return { error: 'Limit must be 0 or more' }
    const { error } = await supabase
      .from('ba_limits')
      .upsert(
        {
          company_id: companyId,
          limit_amount: limitAmount,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' },
      )
    if (error) return { error: `Save failed: ${error.message}` }
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save failed' }
  }
}

// ── Attachments (bank's BA advice — PDF/photo, filed per BA) ────────────────
// Reuses the existing payment-attachments bucket under ba/<ba_id>/ so no new
// storage policies are needed.

const ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

export async function uploadBaAttachment(
  baId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return { error: 'No file selected' }
    if (file.size > MAX_ATTACHMENT_BYTES) return { error: 'File too large (max 15 MB)' }
    if (!ATTACHMENT_TYPES.has(file.type)) return { error: 'Only PDF or image files are accepted' }

    const ext = file.name.split('.').pop() ?? 'bin'
    const key = `ba/${baId}/${Date.now()}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from('payment-attachments')
      .upload(key, buf, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Upload failed: ${upErr.message}` }

    const { error: insErr } = await supabase.from('ba_attachments').insert({
      ba_id: baId,
      storage_path: key,
      file_name: file.name,
      content_type: file.type,
      uploaded_by: user.id,
    })
    if (insErr) {
      await supabase.storage.from('payment-attachments').remove([key]).catch(() => {})
      return { error: `Attachment record failed: ${insErr.message}` }
    }

    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Upload failed' }
  }
}

export async function getBaAttachmentUrl(
  attachmentId: string,
): Promise<{ error?: string; url?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { data: att } = await supabase
      .from('ba_attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .maybeSingle()
    if (!att) return { error: 'Attachment not found' }
    const { data: signed, error } = await supabase.storage
      .from('payment-attachments')
      .createSignedUrl(att.storage_path as string, 60 * 10)
    if (error || !signed) return { error: `Could not sign URL: ${error?.message ?? 'unknown'}` }
    return { url: signed.signedUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
}

export async function deleteBaAttachment(attachmentId: string): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { data: att } = await supabase
      .from('ba_attachments')
      .select('storage_path')
      .eq('id', attachmentId)
      .maybeSingle()
    if (!att) return { error: 'Attachment not found' }
    const { error } = await supabase.from('ba_attachments').delete().eq('id', attachmentId)
    if (error) return { error: `Delete failed: ${error.message}` }
    await supabase.storage
      .from('payment-attachments')
      .remove([att.storage_path as string])
      .catch(() => {})
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Delete failed' }
  }
}

// ── Auto-read the BA document (Claude vision) ───────────────────────────────
// User 2026-08-11: "我upload 后要你自动检查然后算，然后我会检查对不对才储存开
// invoice" — extraction PREFILLS the form only; nothing is saved until the
// user reviews and hits Save. Needs ANTHROPIC_API_KEY in the environment;
// without it the action returns a clear setup hint and everything else on the
// page still works.

export interface BaExtractedFields {
  baNo: string | null
  bankName: string | null
  faceAmount: number | null
  bankAnnualRatePct: number | null
  startDate: string | null
  maturityDate: string | null
  tenorDays: number | null
  borrowerName: string | null
  remarks: string
}

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    ba_no: { type: ['string', 'null'], description: 'BA / acceptance reference number' },
    bank_name: { type: ['string', 'null'] },
    face_amount: { type: ['number', 'null'], description: 'Face amount in RM' },
    bank_annual_rate_pct: {
      type: ['number', 'null'],
      description: "Bank's acceptance/discount rate in % per annum, e.g. 4.5",
    },
    start_date: { type: ['string', 'null'], description: 'Issue/acceptance date, YYYY-MM-DD' },
    maturity_date: { type: ['string', 'null'], description: 'Maturity/due date, YYYY-MM-DD' },
    tenor_days: { type: ['integer', 'null'] },
    borrower_name: { type: ['string', 'null'], description: 'Applicant / drawer company name' },
    remarks: {
      type: 'string',
      description: 'One short line flagging anything unclear or low-confidence; empty if all clear',
    },
  },
  required: [
    'ba_no',
    'bank_name',
    'face_amount',
    'bank_annual_rate_pct',
    'start_date',
    'maturity_date',
    'tenor_days',
    'borrower_name',
    'remarks',
  ],
  additionalProperties: false,
} as const

export async function extractBaFromDocument(
  formData: FormData,
): Promise<{ error?: string; fields?: BaExtractedFields }> {
  try {
    await requireRole(['finance', 'principal'])

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        error:
          'Auto-read is not configured yet — add ANTHROPIC_API_KEY to the Vercel environment (and .env.local for dev), then redeploy.',
      }
    }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return { error: 'No file selected' }
    if (file.size > MAX_ATTACHMENT_BYTES) return { error: 'File too large (max 15 MB)' }
    if (!ATTACHMENT_TYPES.has(file.type)) return { error: 'Only PDF or image files are accepted' }

    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const docBlock =
      file.type === 'application/pdf'
        ? {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: b64,
            },
          }
        : {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
              data: b64,
            },
          }

    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: {
        format: { type: 'json_schema', schema: EXTRACT_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: 'user',
          content: [
            docBlock,
            {
              type: 'text',
              text:
                "This is a Banker's Acceptance (BA) document from a Malaysian bank — an advice, notice, or application form, possibly a photo or scan. Extract the fields defined in the output schema. Rules: amounts are RM numbers without separators; dates must be YYYY-MM-DD; tenor_days is the tenor in days if printed. Use null for anything not clearly legible — do NOT guess. In remarks, flag anything ambiguous (e.g. two candidate amounts, unreadable date).",
            },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return { error: 'The reader declined this document — please fill the fields manually.' }
    }
    const text = response.content.find(b => b.type === 'text')?.text
    if (!text) return { error: 'The reader returned nothing — please fill the fields manually.' }

    const raw = JSON.parse(text) as {
      ba_no: string | null
      bank_name: string | null
      face_amount: number | null
      bank_annual_rate_pct: number | null
      start_date: string | null
      maturity_date: string | null
      tenor_days: number | null
      borrower_name: string | null
      remarks: string
    }
    const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
    return {
      fields: {
        baNo: raw.ba_no,
        bankName: raw.bank_name,
        faceAmount: raw.face_amount,
        bankAnnualRatePct: raw.bank_annual_rate_pct,
        startDate: date(raw.start_date),
        maturityDate: date(raw.maturity_date),
        tenorDays: raw.tenor_days,
        borrowerName: raw.borrower_name,
        remarks: raw.remarks ?? '',
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? `Auto-read failed: ${e.message}` : 'Auto-read failed' }
  }
}

// ── Interest billing: invoice the borrower (5028) ───────────────────────────

// Unique, stable reference per BA — ba_no is optional and not guaranteed
// unique, so the row id anchors both the dedupe and the records lookup.
const baRef = (id: string) => `BA-${id.slice(0, 8)}`

export async function generateBaInvoice(
  baId: string,
): Promise<{ error?: string; invoiceNo?: string | null }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    const { data: ba } = await supabase.from('ba_facilities').select('*').eq('id', baId).maybeSingle()
    if (!ba) return { error: 'BA not found' }

    const ref = baRef(baId)
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_no, status')
      .eq('reference_no', ref)
      .neq('status', 'voided')
      .maybeSingle()
    if (existing) {
      return { error: `Invoice ${existing.invoice_no ?? ''} (${existing.status}) already exists for this BA — delete/void it first to regenerate` }
    }

    const c = calcBa({
      face: Number(ba.face_amount),
      bankAnnualRate: Number(ba.bank_annual_rate),
      days: Number(ba.tenor_days),
      chargeRateMonthly: Number(ba.charge_rate_monthly),
      hcRateMonthly: Number(ba.hc_rate_monthly),
    })
    if (!(c.chargeToBorrower > 0)) return { error: 'Charge amount is 0 — check the rate and tenor' }

    const label = (ba.ba_no as string | null) ?? ref
    const chargePct = Number(ba.charge_rate_monthly) * 100
    const lineDesc = `BA ${label} interest — RM ${Number(ba.face_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })} × ${parseFloat(chargePct.toFixed(3))}%/mo × ${ba.tenor_days}/30 (${ba.start_date} → ${ba.maturity_date})`

    let borrowerLabel = (ba.borrower_name as string | null) ?? ''
    if (ba.borrower_company_id) {
      const { data: co } = await supabase
        .from('companies')
        .select('name')
        .eq('id', ba.borrower_company_id as string)
        .maybeSingle()
      if (co?.name) borrowerLabel = co.name as string
    }
    if (!ba.borrower_company_id && !borrowerLabel.trim()) {
      return { error: 'BA has no borrower — set a company or a name first' }
    }

    // Same handoff as the allocator: the real createMultiLineInvoice mints the
    // number, enforces the open period, and rolls back lines on failure.
    const { invoice_no } = await createMultiLineInvoice({
      billableType: ba.borrower_company_id ? 'subsidiary' : 'freetext',
      billingMode: 'venture_attribution',
      period: dayjs().format('YYYY-MM'),
      invoiceDate: dayjs().format('YYYY-MM-DD'),
      dueDate: (ba.maturity_date as string) ?? '',
      referenceNo: ref,
      headerDescription: `BA ${label} interest — ${borrowerLabel}`,
      companyId: (ba.borrower_company_id as string | null) ?? undefined,
      freetextName: ba.borrower_company_id ? undefined : borrowerLabel,
      lines: [{ description: lineDesc, amount: c.chargeToBorrower, categoryCode: '5028' }],
    })

    revalidatePath('/ba')
    revalidatePath('/statements')
    return { invoiceNo: invoice_no }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invoice generation failed' }
  }
}

// ── Interest payment: PV to HOUZS Century (6001) ────────────────────────────

export async function generateBaPv(
  baId: string,
  bankAccountId: string,
  paymentDate: string,
): Promise<{ error?: string; voucherNo?: string | null }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    const { data: ba } = await supabase.from('ba_facilities').select('*').eq('id', baId).maybeSingle()
    if (!ba) return { error: 'BA not found' }
    if (!bankAccountId) return { error: 'Pick the bank the interest is paid from' }

    const { data: existingPv } = await supabase
      .from('payment_vouchers')
      .select('voucher_no, status')
      .eq('reference_type', 'ba_interest')
      .eq('reference_id', baId)
      .in('status', ['draft', 'pending_approval', 'approved', 'paid'])
      .maybeSingle()
    if (existingPv) {
      return { error: `PV ${existingPv.voucher_no ?? ''} (${existingPv.status}) already exists for this BA` }
    }

    const c = calcBa({
      face: Number(ba.face_amount),
      bankAnnualRate: Number(ba.bank_annual_rate),
      days: Number(ba.tenor_days),
      chargeRateMonthly: Number(ba.charge_rate_monthly),
      hcRateMonthly: Number(ba.hc_rate_monthly),
    })
    const amount = r2(c.oweToHc)
    if (!(amount > 0)) return { error: 'Owe-HC amount is 0 — check the rate and tenor' }

    const { data: hc } = await supabase
      .from('companies')
      .select('id, name')
      .eq('short_code', 'HC')
      .maybeSingle()
    if (!hc) return { error: 'HOUZS Century (short code HC) not found in companies' }

    const label = (ba.ba_no as string | null) ?? baRef(baId)
    const hcPct = Number(ba.hc_rate_monthly) * 100
    const date = /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
      ? paymentDate
      : (ba.maturity_date as string)

    // Hand off to the REAL voucher path (numbering, PVS row, approval queue):
    // one venture_pool source row on 6001 Interest Expense - BA.
    const fd = new FormData()
    fd.set('voucher_type', 'expense')
    fd.set('direction', 'debit')
    fd.set('amount', String(amount))
    fd.set('payee_name', hc.name as string)
    fd.set('payee_company_id', hc.id as string)
    fd.set('bank_account_id', bankAccountId)
    fd.set('payment_method', 'bank_transfer')
    fd.set('payment_date', date)
    fd.set(
      'description',
      `BA ${label} interest to ${hc.name} — RM ${Number(ba.face_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })} × ${parseFloat(hcPct.toFixed(3))}%/mo × ${ba.tenor_days}/30`,
    )
    fd.set('notes', `BA ${label}`)
    fd.set('reference_type', 'ba_interest')
    fd.set('reference_id', baId)
    fd.set('source_rows_count', '1')
    fd.set('source_rows[0][pool]', 'venture_pool')
    fd.set('source_rows[0][amount]', String(amount))
    fd.set('source_rows[0][account_code]', '6001')

    try {
      const result = await createPaymentVoucher(fd)
      if (result?.error) return { error: result.error }
    } catch (err) {
      // createPaymentVoucher redirects on success — swallow that, rethrow real errors.
      const digest = (err as { digest?: string })?.digest
      const isRedirect =
        (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) ||
        (err instanceof Error && err.message.includes('NEXT_REDIRECT'))
      if (!isRedirect) throw err
    }

    const { data: created } = await supabase
      .from('payment_vouchers')
      .select('voucher_no')
      .eq('reference_type', 'ba_interest')
      .eq('reference_id', baId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    revalidatePath('/ba')
    revalidatePath('/payments')
    return { voucherNo: (created?.voucher_no as string | null) ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'PV generation failed' }
  }
}
