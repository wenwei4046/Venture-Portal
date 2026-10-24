import { notFound } from 'next/navigation'
import { requirePage, requirePermission } from '@/lib/auth'
import { readChatReviewLog } from '@/lib/marketing/server'
import ChatReview from '@/components/mkt/review/ChatReview'

export const dynamic = 'force-dynamic'

/** Chat review (⑦-3b; the user's answer 35, amended): a direct message opened on a complaint — the two people and the
 * reason first, every opening a record. Reached from the chat tile's 🔍 Review. A full-access title's own login only: the
 * database asks the login, so anybody else — the shared Principal login among them, View as or not — finds nothing. */
export default async function MarketingChatReviewPage() {
  await requirePage('/marketing/chat-review')
  const user = await requirePermission('marketing')
  // Opening one is the login's own act, with its own name on the record: never seen through View as a person.
  if (user.viewingAs) notFound()
  const log = await readChatReviewLog()
  if (!log) notFound()
  return <ChatReview log={log} />
}
