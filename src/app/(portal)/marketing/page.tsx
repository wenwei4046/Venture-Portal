import { notFound, redirect } from 'next/navigation'
import { requirePage, requirePermission } from '@/lib/auth'
import { officeClock } from '@/lib/office-clock'
import { canDo } from '@/lib/permission-actions'
import { startRead } from '@/lib/start-read'
import { indexBoard, isSeries, type MktBoard } from '@/lib/marketing/board'
import { messageLine, type ChatList, type ChatTask } from '@/lib/marketing/chat'
import { plateColumns, plateLine, plateOf, weekRows } from '@/lib/marketing/my-space'
import { readBoard, readChatList, readLobby, readNotices, readPet, readSpace, readVisit } from '@/lib/marketing/server'
import { petState, type LobbyPet } from '@/lib/marketing/space'
import { groupTone, toneBg } from '@/lib/marketing/groups'
import { initialOf } from '@/lib/marketing/shell'
import MySpace from '@/components/mkt/myspace/MySpace'
import VisitSpace from '@/components/mkt/myspace/VisitSpace'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Each pet in the lobby, feeling as its owner's plate and its energy make it (⑦-4). */
function lobbyOf(board: MktBoard, pets: LobbyPet[], now: Date) {
  return pets.map(p => ({ ...p, state: petState(plateOf(plateColumns(board, p.staff, now)), p.energy) }))
}

/** The lobby's last message, over its sender's pet (⑦-3). */
const sayOf = (chat: ChatList) => (chat.lobby.last ? { staff: chat.lobby.last.from, text: messageLine(chat.lobby.last) } : null)

/** What a chat message may carry: the board's tasks — never a series' pattern — the latest first. */
function chatTasks(board: MktBoard): ChatTask[] {
  return board.projects
    .filter(p => !isSeries(p) && p.trackId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40)
    .map(p => ({ id: p.id, track: p.trackId, title: p.title }))
}

/** My Space — Marketing's first page (2026-10-23, the handoff's `My Space.dc.html`; its own side, laid out by its
 * owner, `My Space Bento.dc.html`, ⑦-1; its pet's level and the trophies, ⑦-5). `?visit=<staff>` opens a teammate's
 * space instead (⑦-4 — the lobby's pets lead there); `?chat=<staff>` opens one's chat with them (⑦-3 — a visit's
 * *💬 Message*). */
export default async function MarketingMySpacePage({ searchParams }: { searchParams: Promise<{ visit?: string; chat?: string }> }) {
  await requirePage('/marketing')
  // Its tab, My Space, asks no key of its own (every view's Overview): the page asks Marketing.
  const user = await requirePermission('marketing')
  const sp = await searchParams
  const visitId = typeof sp.visit === 'string' && UUID.test(sp.visit) ? sp.visit.toLowerCase() : null
  const chatWith = typeof sp.chat === 'string' && UUID.test(sp.chat) ? sp.chat.toLowerCase() : null
  const canEdit = canDo(user, 'marketing', 'edit')
  const now = new Date()

  if (visitId) {
    const [board, pets, visit, chat] = await Promise.all([readBoard(), readLobby(), readVisit(visitId), readChatList()])
    if (visitId === board.me) redirect('/marketing')
    // Nobody to visit: off Marketing's roster, or without a login.
    if (!visit) notFound()
    return (
      <VisitSpace
        visit={visit}
        state={petState(plateOf(plateColumns(board, visit.staff, now)), visit.stats?.energy ?? 100)}
        letter={initialOf(visit.first)}
        avatarBg={toneBg(groupTone(visit.title))}
        lobby={lobbyOf(board, pets, now)}
        me={board.me}
        canChat={canEdit && !!chat.me}
        say={sayOf(chat)}
      />
    )
  }

  const notices = startRead(readNotices(10))
  const space = startRead(readSpace())
  const pet = startRead(readPet())
  const pets = startRead(readLobby())
  const chatRead = startRead(readChatList())
  const board = await readBoard()
  const me = indexBoard(board).person(board.me)
  const columns = plateColumns(board, board.me, now)
  const turn = columns.find(c => c.key === 'turn')?.cards.length ?? 0
  const name = me?.full || user.name || 'Marketing'
  const first = me?.first || (user.name ?? '').split(/\s+/)[0] || 'there'
  const plans = (await notices).filter(n => !n.read && n.type === 'plan').slice(0, 3)
  const chat = await chatRead
  return (
    <MySpace
      name={name}
      role={me ? me.role || me.title : null}
      letter={initialOf(first)}
      avatarBg={me ? toneBg(groupTone(me.title)) : toneBg('manager')}
      greeting={officeClock().greeting}
      first={first}
      plateLine={plateLine(turn)}
      columns={columns}
      week={weekRows(columns, board.today)}
      plans={plans}
      plate={plateOf(columns)}
      // A pet lives in the room of somebody on Marketing's roster (not the Principal's shared login — question 37).
      hasPet={!!me}
      canEdit={canEdit}
      space={await space}
      petStats={await pet}
      viewer={user.id}
      lobby={lobbyOf(board, await pets, now)}
      me={board.me}
      chat={chat}
      chatWith={chatWith}
      chatTasks={chatTasks(board)}
    />
  )
}
