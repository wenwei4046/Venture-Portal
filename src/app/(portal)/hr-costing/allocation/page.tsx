import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'

// Landing: jump straight to the current month's editor.
export default async function AllocationLandingPage() {
  await requireRole(['principal', 'hr'])
  redirect(`/hr-costing/allocation/${getPeriodMonth()}`)
}
