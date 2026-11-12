import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { QuotePdf } from '@/lib/marketing/quote-pdf'
import { coreOf, quoteBookFromRow, withExtras } from '@/lib/marketing/quotes'
import { createClient } from '@/lib/supabase/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A quotation's client PDF (2026-11-12, docs/design_handoff_product_builder/): the quotation as it is saved now, or — `?v=`
 * — a version sent, from its history (frozen as it was sent), named `QT-…-v1.pdf`. Read as the Product Builder reads it
 * (mkt_quote_book asks Marketing · Manage itself). A GET route, the portal's file downloads' way: it writes nothing.
 */
export async function GET(req: Request) {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  const url = new URL(req.url)
  const id = url.searchParams.get('q') ?? ''
  const v = url.searchParams.get('v')
  const none = () => new Response('That quotation is not there.', { status: 404 })
  if (!UUID.test(id) || (v !== null && !/^\d{1,4}$/.test(v))) return none()
  // Marketing's functions are not in the generated types (lib/marketing/actions.ts reads them the same way).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('mkt_quote_book')
  if (error) return none()
  const book = quoteBookFromRow(data)
  const q = book.quotes.find(x => x.id === id)
  if (!q) return none()
  let core
  if (v !== null) {
    const h = q.history.find(x => x.kind === 'sent' && x.rev === Number(v))
    if (!h?.snap) return none()
    core = { ...h.snap, no: q.no }
  } else {
    const name = q.other ? q.client : book.clients.find(c => c.id === q.sub)?.name ?? ''
    // Each item's Product List columns as they are now (a version sent keeps its own).
    core = { ...withExtras(coreOf(q, name), book.items, book.columns), no: q.no }
  }
  return exportPdfResponse({ filename: v !== null ? `${q.no}-v${v}` : q.no, element: <QuotePdf quote={core} /> })
}
