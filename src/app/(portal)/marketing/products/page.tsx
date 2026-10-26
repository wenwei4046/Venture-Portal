import { requireActionOn, requirePage } from '@/lib/auth'
import { readProducts } from '@/lib/marketing/server'
import ProductBuilder from '@/components/mkt/products/ProductBuilder'

export const dynamic = 'force-dynamic'

/** The Product Builder — what Marketing sells to the subsidiaries, and at what price (2026-10-23, `Product Builder.dc.html`). */
export default async function MarketingProductsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requirePage('/marketing/products')
  // The manager's: Marketing · Manage — and so are the prices.
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  const [book, sp] = await Promise.all([readProducts(), searchParams])
  return <ProductBuilder initial={book} first={typeof sp.p === 'string' ? sp.p : null} />
}
