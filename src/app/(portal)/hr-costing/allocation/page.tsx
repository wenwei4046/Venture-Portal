import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'

// Landing: jump straight to the current month's editor.
export default async function AllocationLandingPage() {
  await requirePermission('hr_costing')
  redirect(`/hr-costing/allocation/${getPeriodMonth()}`)
}
