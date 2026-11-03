import { redirect } from 'next/navigation'

// The Finance phone app's Dept Payment Requests.
// Retired 2026-10-29 (PR ⑥ of docs/module-spec-payment-requests.md): what it listed is Payments › Payment request's
// now, so an old link — a bookmark, a notice — lands there.
export default function RetiredPage() {
  redirect('/fin-app/page/payment-requests')
}
