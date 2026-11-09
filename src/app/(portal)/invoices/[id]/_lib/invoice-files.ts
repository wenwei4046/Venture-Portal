import type { SupabaseClient } from '@supabase/supabase-js'

/** One file kept with an invoice (mig 20261109170000), as its page lists it. */
export interface InvoiceFile {
  id: string
  name: string
  type: string | null
  size: number | null
  by: string | null
  at: string
}

/** The files of one invoice, oldest first — the order they print in. None when they cannot be read. */
export async function readInvoiceFiles(db: Pick<SupabaseClient, 'rpc'>, invoiceId: string): Promise<InvoiceFile[]> {
  try {
    const { data, error } = await db.rpc('invoice_attachments_of', { p_ids: [invoiceId] })
    if (error || !data) return []
    return (data as Array<{ id: string; file_name: string; file_type: string | null; file_size: number | string | null; uploaded_by: string | null; uploaded_at: string }>).map((r) => ({
      id: r.id,
      name: r.file_name,
      type: r.file_type,
      size: r.file_size == null ? null : Number(r.file_size),
      by: r.uploaded_by,
      at: r.uploaded_at,
    }))
  } catch {
    return []
  }
}
