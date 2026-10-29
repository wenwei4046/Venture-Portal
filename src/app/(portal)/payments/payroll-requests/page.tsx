import { redirect } from 'next/navigation'
import { requirePage } from '@/lib/auth'

// Payroll Requests — HR's funding requests, the statutory payments.
// Retired 2026-10-29 (PR ⑥ of docs/module-spec-payment-requests.md): what it listed is Payments › Payment request's
// now, so an old link — a bookmark, a notice — lands there (asked as any page first).
export default async function RetiredPage() {
  await requirePage('/payments/payroll-requests')
  redirect('/payments/requests?card=payroll')
}
