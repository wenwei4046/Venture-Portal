import { redirect } from 'next/navigation'
import { productListPath } from '@/lib/revenue'

/**
 * The Product List left the HR side for the Revenue app on 2026-10-08 (user:
 * "把 product list 直接搬过去 revenue view 那边，不要再出现在 HR 那边"). An old
 * link or bookmark lands where it went, on the tab and search it named.
 */
export default async function ProductListMoved({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sub?: string }>
}) {
  const { tab, q, sub } = await searchParams
  redirect(productListPath({ tab, q, sub }))
}
