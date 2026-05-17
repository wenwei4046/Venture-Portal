// Phase 7 Step 11: Billing was merged into Statements as a sub-tab.
// Old URL redirects to the new canonical location.
import { redirect } from 'next/navigation'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function BillingRedirect({ searchParams }: Props) {
  const { period } = await searchParams
  const qs = period ? `?period=${encodeURIComponent(period)}` : ''
  redirect(`/statements${qs}`)
}
