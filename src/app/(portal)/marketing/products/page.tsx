import { requireActionOn, requirePage } from '@/lib/auth'
import { readProducts, readQuoteBook } from '@/lib/marketing/server'
import { startRead } from '@/lib/start-read'
import ProductBuilderApp, { type BuilderTab } from '@/components/mkt/products/ProductBuilderApp'

export const dynamic = 'force-dynamic'

/** The Product Builder — its Product List, what Marketing sells to the subsidiaries and at what price, and its
 * quotations (2026-10-23; three tabs since 2026-11-12, docs/design_handoff_product_builder/). */
export default async function MarketingProductsPage({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string; q?: string; assign?: string }> }) {
  await requirePage('/marketing/products')
  // The manager's: Marketing · Manage — and so are the prices.
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  const products = startRead(readProducts())
  const quotes = startRead(readQuoteBook())
  const sp = await searchParams
  const p = typeof sp.p === 'string' ? sp.p : null
  const q = typeof sp.q === 'string' ? sp.q : null
  // A product or a quotation named opens its tab; else the tab named; else the Product List (the design's first).
  const tab: BuilderTab = p ? 'products' : q ? 'quotes' : sp.tab === 'products' || sp.tab === 'quotes' ? sp.tab : 'catalog'
  return (
    <ProductBuilderApp initialProducts={await products} initialQuotes={await quotes} tab={tab} product={p} quote={q} assign={sp.assign === '1'} />
  )
}
