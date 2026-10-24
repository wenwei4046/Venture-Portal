import { describe, expect, it } from 'vitest'
import {
  anyUnread, chatListFromRow, chatMessageFromRow, chatThreadFromRow, chatTime, messageLine, peerPreview, peersInOrder, tidyMessage, type ChatPeer,
} from './chat'

// 2026-10-24 — ⑦-3: My Space's chat — the lobby's thread and direct messages (the user's answers 35, 36, 37 and 39), as
// the tile draws them. The database's side: tests/member-sql/validate-marketing-chat.mjs.

const MEI = '00000000-0000-4000-8000-000000000012', ALI = '00000000-0000-4000-8000-000000000013', SITI = '00000000-0000-4000-8000-000000000015'
const msg = (id: number, from: string, body: string | null, project: unknown = null, at = '2026-10-24T01:12:00Z') => ({ id, from, first: 'Mei', body, project, at })
const peer = (staff: string, first: string, last: ReturnType<typeof msg> | null, unread = false): ChatPeer => ({
  staff, first, title: null, avatarPath: null, last: last && chatMessageFromRow(last), unread,
})

describe('read from the database', () => {
  it('the list: the caller, the lobby’s last message, each teammate’s last — whatever came in, by its keys', () => {
    const list = chatListFromRow({
      me: ALI,
      lobby: { last: msg(4, MEI, 'Who has the moodboard?'), unread: true },
      dms: [
        { staff: MEI, first: 'Mei', title: 'VIDEOGRAPHER', avatarPath: 'space/a/me.png', last: msg(3, MEI, null, { id: 'p1', track: 'TSK-CAR-2610-004', title: 'Price banner' }), unread: true },
        { staff: SITI, first: 'Siti', last: null },
        { first: 'Nobody' }, 'x',
      ],
    })
    expect(list.me).toBe(ALI)
    expect(list.lobby).toEqual({ last: { id: 4, from: MEI, first: 'Mei', body: 'Who has the moodboard?', project: null, at: '2026-10-24T01:12:00Z' }, unread: true })
    expect(list.dms.map(d => [d.first, d.title, d.avatarPath, d.last?.project?.track ?? null, d.unread])).toEqual([
      ['Mei', 'VIDEOGRAPHER', 'space/a/me.png', 'TSK-CAR-2610-004', true], ['Siti', null, null, null, false],
    ])
    expect(chatListFromRow(null)).toEqual({ me: null, lobby: { last: null, unread: false }, dms: [] })
  })

  it('a message has words or a task — or it is no message; a thread, oldest first, whether more remain', () => {
    expect(chatMessageFromRow(msg(1, MEI, null))).toBeNull()
    expect(chatMessageFromRow({ id: '7', from: MEI, body: 'hi', at: '' })?.id).toBe(7)
    expect(chatThreadFromRow({ with: 'lobby', messages: [msg(1, MEI, 'a'), msg(2, ALI, null), msg(3, ALI, 'b')], more: true }))
      .toEqual({ with: 'lobby', messages: [chatMessageFromRow(msg(1, MEI, 'a')), chatMessageFromRow(msg(3, ALI, 'b'))], more: true })
    expect(chatThreadFromRow(null)).toBeNull()
  })
})

describe('the list as drawn', () => {
  it('unread first, then the latest, then those never begun — by name', () => {
    const order = peersInOrder([
      peer(SITI, 'Siti', null), peer('a', 'Aina', null), peer(MEI, 'Mei', msg(3, MEI, 'old')), peer(ALI, 'Ali', msg(9, ALI, 'new')),
      peer('z', 'Zack', msg(2, 'z', 'hey'), true),
    ])
    expect(order.map(p => p.first)).toEqual(['Zack', 'Ali', 'Mei', 'Aina', 'Siti'])
  })

  it('a chat’s second line: the last message — “You: …” when it is one’s own, a task by its title — or none yet', () => {
    expect(peerPreview(peer(MEI, 'Mei', msg(3, MEI, 'Can you check?')), ALI)).toBe('Can you check?')
    expect(peerPreview(peer(MEI, 'Mei', msg(3, ALI, '👋')), ALI)).toBe('You: 👋')
    expect(peerPreview(peer(MEI, 'Mei', msg(3, MEI, null, { id: 'p', track: 'TSK-1', title: 'Price banner' })), ALI)).toBe('📎 Price banner')
    expect(peerPreview(peer(MEI, 'Mei', null), ALI)).toBe('No messages yet')
    expect(messageLine({ body: null, project: { id: 'p', track: 'TSK-1', title: '' } })).toBe('📎 TSK-1')
  })

  it('the dots: a direct chat unread, the lobby unread', () => {
    const list = chatListFromRow({ me: ALI, lobby: { last: null, unread: false }, dms: [{ staff: MEI, first: 'Mei', unread: true }] })
    expect(anyUnread(list)).toEqual({ dms: true, lobby: false })
  })
})

describe('when, and what is sent', () => {
  it('by the office’s clock: the time today, the weekday this past week, the date before', () => {
    const now = new Date('2026-10-24T06:00:00Z') // 14:00 in the office, a Saturday
    expect(chatTime('2026-10-24T01:12:00Z', now)).toBe('09:12')
    expect(chatTime('2026-10-23T17:30:00Z', now)).toBe('01:30') // after midnight in the office: today
    expect(chatTime('2026-10-23T08:00:00Z', now)).toBe('Fri 16:00')
    expect(chatTime('2026-10-18T08:00:00Z', now)).toBe('Sun 16:00')
    expect(chatTime('2026-10-17T08:00:00Z', now)).toBe('17 Oct') // a week ago: its date
    expect(chatTime('', now)).toBe('')
  })

  it('one line, tidied, 1,000 characters at most — nothing to send when it is blank', () => {
    expect(tidyMessage('  Who has the\n  moodboard?  ')).toBe('Who has the moodboard?')
    expect(tidyMessage(' \n ')).toBeNull()
    expect(tidyMessage('x'.repeat(1200))).toHaveLength(1000)
  })
})
