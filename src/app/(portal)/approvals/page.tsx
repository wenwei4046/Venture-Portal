import { requireApprovalQueue, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ApprovalsHub from './_components/ApprovalsHub'
import { readApprovalHub } from './_lib/hub-read'
import type { ApprovalHubCard } from './_lib/hub-model'

// Approvals as Finance's hub (2026-10-17 — the user, on the Principal's own view taking Finance's view: "make sure
// the approve tab is fullfill as well, cause usually i use that"). It was the sheet's queue (four summary cards, the
// queue as a table, the last ten decisions); it is now Finance's hub — the total that waits, a card per list
// (Pending, Submitted by the executive, Decided · 30 days), the table, Select and the dark bar, the drawer — with
// every decision it had: one request, what is ticked, a combined approval whole or voucher by voucher, the notes,
// the overdraw, the reason. The reads are the queue's (`_lib/hub-read`); the page draws nothing of its own.

const CARDS: readonly ApprovalHubCard[] = ['pending', 'exec', 'decided']

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  await requirePage('/approvals')
  // The queue opens for whoever may see it or decide anything in it; what each
  // may decide is asked row by row (2026-10-09, approvals by domain).
  const user = await requireApprovalQueue()
  const supabase = await createClient()
  const [{ card }, hub] = await Promise.all([searchParams, readApprovalHub(supabase, user)])
  const initialCard = (CARDS as readonly string[]).includes(card ?? '') ? (card as ApprovalHubCard) : 'pending'
  // Whoever arranges the table for everybody (Finance, the Principal), as the old queue table's.
  const canSetDefault = user.role === 'finance' || user.role === 'principal'
  return <ApprovalsHub hub={hub} initialCard={initialCard} canSetDefault={canSetDefault} />
}
