// My Space's chat (`My Space Bento.dc.html` › the chat tile, ⑦-3; mig 20261025039000; the user's answers 35, 36, 37
// and 39): the lobby's thread, which everybody with Marketing · View reads and the roster speaks in, and direct messages
// between two people on the roster — theirs alone. A message is one line of words and/or a task attached; it is kept for
// good, never edited or deleted. Unread is a dot, nothing more. Pure: the tile draws what this returns.

import { officeTime } from '@/lib/office-time'

export interface ChatTask {
  id: string
  track: string
  title: string
}

export interface ChatMessage {
  id: number
  /** Its sender's staff id. */
  from: string
  /** Its sender's first name (the list's last messages of a direct chat leave it out: it is one of the two). */
  first: string
  body: string | null
  project: ChatTask | null
  at: string
}

/** A teammate one may message: on the roster, with a login. */
export interface ChatPeer {
  staff: string
  first: string
  title: string | null
  /** The avatar uploaded on My Space (the user's answer 40). */
  avatarPath: string | null
  last: ChatMessage | null
  unread: boolean
}

export interface ChatList {
  /** The caller's staff id — null off the roster: the lobby only, read only. */
  me: string | null
  lobby: { last: ChatMessage | null; unread: boolean }
  dms: ChatPeer[]
}

export interface ChatThread {
  /** 'lobby', or the teammate's staff id. */
  with: string
  /** Oldest first. */
  messages: ChatMessage[]
  /** Older ones remain. */
  more: boolean
}

export const LOBBY = 'lobby'
/** A message's words, at most (the database's). */
export const CHAT_MAX = 1000
/** An open thread is read again this often while it is in view. */
export const CHAT_POLL_MS = 15000

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function taskFromRow(v: unknown): ChatTask | null {
  if (!isObject(v) || typeof v.id !== 'string' || !v.id) return null
  return { id: v.id, track: str(v.track), title: str(v.title) }
}

export function chatMessageFromRow(v: unknown): ChatMessage | null {
  if (!isObject(v)) return null
  const id = typeof v.id === 'number' ? v.id : Number(v.id)
  if (!Number.isFinite(id) || typeof v.from !== 'string') return null
  const body = typeof v.body === 'string' && v.body ? v.body : null
  const project = taskFromRow(v.project)
  if (!body && !project) return null
  return { id, from: v.from, first: str(v.first), body, project, at: str(v.at) }
}

export function chatListFromRow(row: unknown): ChatList {
  const r = isObject(row) ? row : {}
  const lobby = isObject(r.lobby) ? r.lobby : {}
  const dms: ChatPeer[] = []
  for (const d of Array.isArray(r.dms) ? r.dms : []) {
    if (!isObject(d) || typeof d.staff !== 'string' || !d.staff) continue
    dms.push({
      staff: d.staff, first: str(d.first) || 'Someone', title: typeof d.title === 'string' && d.title ? d.title : null,
      avatarPath: typeof d.avatarPath === 'string' && d.avatarPath ? d.avatarPath : null, last: chatMessageFromRow(d.last), unread: d.unread === true,
    })
  }
  return {
    me: typeof r.me === 'string' && r.me ? r.me : null,
    lobby: { last: chatMessageFromRow(lobby.last), unread: lobby.unread === true },
    dms,
  }
}

export function chatThreadFromRow(row: unknown): ChatThread | null {
  if (!isObject(row) || typeof row.with !== 'string') return null
  const messages: ChatMessage[] = []
  for (const m of Array.isArray(row.messages) ? row.messages : []) {
    const msg = chatMessageFromRow(m)
    if (msg) messages.push(msg)
  }
  return { with: row.with, messages, more: row.more === true }
}

/** The direct chats in the list's order: unread first, then the latest message, then those never begun — by name. */
export function peersInOrder(dms: ChatPeer[]): ChatPeer[] {
  return [...dms].sort((a, b) =>
    Number(b.unread) - Number(a.unread) ||
    (b.last?.id ?? 0) - (a.last?.id ?? 0) ||
    a.first.localeCompare(b.first) || a.staff.localeCompare(b.staff))
}

/** What a message says in a line: its words, or the task attached. */
export const messageLine = (m: Pick<ChatMessage, 'body' | 'project'>) => m.body ?? `📎 ${m.project?.title || m.project?.track || 'A task'}`

/** A direct chat's second line: the last message — *You: …* when it is one's own — or that none has been. */
export function peerPreview(p: ChatPeer, me: string | null): string {
  if (!p.last) return 'No messages yet'
  return `${p.last.from === me ? 'You: ' : ''}${messageLine(p.last)}`
}

/** When, by the office's clock: the time today, the weekday and time this past week, the date before that. */
export function chatTime(at: string, now: Date = new Date()): string {
  if (!at) return ''
  const t = officeTime(at)
  const today = officeTime(now)
  if (t.format('YYYY-MM-DD') === today.format('YYYY-MM-DD')) return t.format('HH:mm')
  const days = today.startOf('day').diff(t.startOf('day'), 'day')
  if (days > 0 && days < 7) return t.format('ddd HH:mm')
  return t.format('D MMM')
}

/** Whether the list has anything unread — the tabs' dots. */
export const anyUnread = (list: ChatList) => ({ dms: list.dms.some(d => d.unread), lobby: list.lobby.unread })

/** A message as it would read once sent — one line, tidied, as the database keeps it (null: nothing to send). */
export function tidyMessage(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, CHAT_MAX) : null
}
