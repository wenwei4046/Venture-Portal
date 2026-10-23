import { requirePage, requirePermission } from '@/lib/auth'
import { officeClock } from '@/lib/office-clock'
import { canDo } from '@/lib/permission-actions'
import { startRead } from '@/lib/start-read'
import { indexBoard } from '@/lib/marketing/board'
import { plateColumns, plateLine, weekRows } from '@/lib/marketing/my-space'
import { readBoard, readNotices, readSpace } from '@/lib/marketing/server'
import { initialOf } from '@/lib/marketing/shell'
import MySpace from '@/components/mkt/myspace/MySpace'

export const dynamic = 'force-dynamic'

const TEAM_BG: Record<string, string> = {
  manager: 'var(--mk-team-manager-bg)',
  content: 'var(--mk-team-content-bg)',
  social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)',
  ads: 'var(--mk-team-ads-bg)',
  brand: 'var(--mk-team-brand-bg)',
}

/** My Space — Marketing's first page (2026-10-23, the handoff's `My Space.dc.html`; its own side, laid out by its
 * owner, `My Space Bento.dc.html`, ⑦-1). */
export default async function MarketingMySpacePage() {
  await requirePage('/marketing')
  // Its tab, My Space, asks no key of its own (every view's Overview): the page asks Marketing.
  const user = await requirePermission('marketing')
  const notices = startRead(readNotices(10))
  const space = startRead(readSpace())
  const board = await readBoard()
  const me = indexBoard(board).person(board.me)
  const columns = plateColumns(board)
  const turn = columns.find(c => c.key === 'turn')?.cards.length ?? 0
  const name = me?.full || user.name || 'Marketing'
  const first = me?.first || (user.name ?? '').split(/\s+/)[0] || 'there'
  const plans = (await notices).filter(n => !n.read && n.type === 'plan').slice(0, 3)
  return (
    <MySpace
      name={name}
      role={me ? me.role || me.title : null}
      letter={initialOf(first)}
      avatarBg={(me?.team && TEAM_BG[me.team]) || 'var(--mk-team-manager-bg)'}
      greeting={officeClock().greeting}
      first={first}
      plateLine={plateLine(turn)}
      columns={columns}
      week={weekRows(columns, board.today)}
      plans={plans}
      canEdit={canDo(user, 'marketing', 'edit')}
      space={await space}
    />
  )
}
