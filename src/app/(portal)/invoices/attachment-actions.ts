'use server'

import { revalidatePath } from 'next/cache'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { dropStaged, formFiles } from '@/lib/storage/staged'

// An invoice's attachments (2026-11-09, the user: "就是我开invoice 时放，也可以看完后放"): added in Create invoice once
// the draft is saved, or later on the invoice's page; opened by a short link; taken off again while it is not voided.
// The rows are the database's (mig 20261109170000 — `invoice_attachment_add` / `_remove` / `invoice_attachments_of`);
// the files sit in `payment-attachments` under `invoices/<invoice id>/`, as a voucher's sit under its id.

const BUCKET = 'payment-attachments'

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
]
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls', '.docx', '.doc', '.csv']
const MAX_BYTES = 100 * 1024 * 1024

/** Files sent ahead (field `files`) filed with the invoice `invoice_id`. How many went in. */
export async function uploadInvoiceAttachments(formData: FormData): Promise<{ count: number }> {
  await requireActionOn(['/invoices/[id]', '/statements'], 'billing', 'create')
  const supabase = await createClient()
  const invoiceId = String(formData.get('invoice_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Error('Which invoice?')

  const read = await formFiles(supabase, formData, 'files')
  if (!read.ok) throw new Error(read.reason)
  const files = read.files.filter((f) => f.size > 0)
  if (files.length === 0) throw new Error('No files provided')

  try {
    let count = 0
    for (const file of files) {
      if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is larger than 100 MB`)
      const lower = file.name.toLowerCase()
      const dot = lower.lastIndexOf('.')
      const ext = dot >= 0 ? lower.slice(dot) : ''
      if (!ALLOWED_EXT.includes(ext) || (file.type && !ALLOWED_MIME.includes(file.type))) {
        throw new Error(`"${file.name}" is not a PDF, picture, Excel, Word or CSV file`)
      }
      const path = `invoices/${invoiceId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, await file.bytes(), { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upErr) throw new Error(`"${file.name}" could not be uploaded: ${upErr.message}`)
      const { error: rowErr } = await supabase.rpc('invoice_attachment_add', {
        p_invoice: invoiceId,
        p_name: file.name,
        p_type: file.type || 'application/octet-stream',
        p_size: file.size,
        p_path: path,
      })
      if (rowErr) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
        throw new Error(rowErr.message)
      }
      count++
    }
    revalidatePath(`/invoices/${invoiceId}`)
    return { count }
  } finally {
    await dropStaged(supabase, files)
  }
}

/** One file taken off its invoice: the row first, then the file itself. */
export async function deleteInvoiceAttachment(id: string): Promise<void> {
  await requireActionOn(['/invoices/[id]', '/statements'], 'billing', 'create')
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('invoice_attachment_remove', { p_id: id })
  if (error) throw new Error(error.message)
  if (typeof path === 'string') await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
}

/** A link that opens one file for a minute. */
export async function invoiceAttachmentUrl(invoiceId: string, id: string): Promise<{ url: string; name: string }> {
  // Whoever opens the invoice's page (it asks Billing) opens its files.
  await requirePermission('billing')
  const supabase = await createClient()
  const { data } = await supabase.rpc('invoice_attachments_of', { p_ids: [invoiceId] })
  const row = ((data ?? []) as Array<{ id: string; file_name: string; storage_path: string }>).find((r) => r.id === id)
  if (!row) throw new Error('That file is not there any more.')
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60)
  if (error || !signed) throw new Error('That file could not be opened just now.')
  return { url: signed.signedUrl, name: row.file_name }
}
