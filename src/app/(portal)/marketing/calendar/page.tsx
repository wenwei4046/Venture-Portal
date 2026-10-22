import { requirePage } from '@/lib/auth'
import { officeToday } from '@/lib/office-time'
import { calendarEvents, isView, readWindow } from '@/lib/marketing/calendar'
import { readBoard } from '@/lib/marketing/server'
import MktCalendar from '@/components/mkt/calendar/MktCalendar'

export const dynamic = 'force-dynamic'

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The Calendar — the team's dates across every subsidiary (2026-10-23, the handoff's `Calendar.dc.html`). */
export default async function MarketingCalendarPage({ searchParams }: {
  searchParams: Promise<{ d?: string | string[]; view?: string | string[]; who?: string | string[] }>
}) {
  await requirePage('/marketing/calendar')
  const query = await searchParams
  const asked = one(query.d)
  // The day it opens on: the one asked for, else the office's today.
  const day = DAY.test(asked) ? asked : officeToday()
  const window = readWindow(day)
  const board = await readBoard(window)
  const whoId = one(query.who)
  const person = board.team.find(t => t.id === whoId)
  return (
    <MktCalendar
      key={`${day}|${whoId}`}
      events={calendarEvents(board)}
      subs={board.subs}
      today={board.today}
      me={board.me}
      who={person ? { id: person.id, name: person.first || person.full } : null}
      people={Object.fromEntries(board.team.map(t => [t.id, t.first || t.full]))}
      view={isView(one(query.view)) ? (one(query.view) as 'month' | 'week' | 'list') : 'month'}
      day={day}
      window={window}
    />
  )
}
