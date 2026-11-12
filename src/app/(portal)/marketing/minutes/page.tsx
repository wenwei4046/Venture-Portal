import { requireActionOn, requirePage } from '@/lib/auth'
import { readBoard, readMinutesTemplates } from '@/lib/marketing/server'
import MinutesBuilder from '@/components/mkt/minutes/MinutesBuilder'

export const dynamic = 'force-dynamic'

/** The Minutes Builder — what each kind of meeting minutes asks for (2026-10-23, `Minutes Builder.dc.html`; v2 2026-11-12,
 * `docs/design_handoff_minutes_builder_v2/`). */
export default async function MarketingMinutesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requirePage('/marketing/minutes')
  // The manager's: Marketing · Manage.
  await requireActionOn('/marketing/minutes', 'marketing', 'manage')
  const [board, book, sp] = await Promise.all([readBoard(), readMinutesTemplates(), searchParams])
  // The live preview's attendees: Marketing's own people.
  const attendees = board.team.slice(0, 4).map(p => p.first || p.full)
  return <MinutesBuilder initial={book.templates} folders={book.folders} first={typeof sp.t === 'string' ? sp.t : null} attendees={attendees} />
}
