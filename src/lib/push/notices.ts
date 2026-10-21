import type { PushApp } from './config'

/**
 * A notice as the bells and the push read it (mig 20261011180000,
 * `app_notifications`): what it is about, and where a tap on it opens — in
 * the app the phone turned notifications on in.
 */
export type NoticeKind = 'hiring' | 'rooms' | 'review' | 'memo' | 'it' | 'share'
/**
 * `crm_contact` / `crm_invite` (2026-10-14, mig 20261014030000): the CRM's own notices — a customer's message, a new
 * lead, a visit, a reminder, an invitation. They reach the phone only: the bells never list them (the CRM keeps its own).
 */
export type NoticeRef = 'hiring_request' | 'booking' | 'member_request' | 'memo' | 'crm_contact' | 'crm_invite' | 'att_today' | 'att_request'
  // IT support (2026-10-20, mig 20261021020100): a request's status or note, to its sender; a new one or a reply, to the desk.
  | 'it_request'
  // Share order (2026-10-21, mig 20261021150100): a bill shared with them, an answer to theirs, HR's decision — Revenue members.
  | 'share_request'

export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  body: string
  refKind: NoticeRef
  refId: string
  at: string
  read: boolean
}

export interface Notices {
  unread: number
  items: Notice[]
}

const KINDS: readonly NoticeKind[] = ['hiring', 'rooms', 'review', 'memo', 'it', 'share']
const REFS: readonly NoticeRef[] = ['hiring_request', 'booking', 'member_request', 'memo', 'it_request', 'share_request']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function noticeFromRow(v: unknown): Notice | null {
  if (!isObj(v) || !str(v.id) || !KINDS.includes(v.kind as NoticeKind) || !REFS.includes(v.refKind as NoticeRef)) return null
  return {
    id: str(v.id),
    kind: v.kind as NoticeKind,
    title: str(v.title),
    body: str(v.body),
    refKind: v.refKind as NoticeRef,
    refId: str(v.refId),
    at: str(v.at),
    read: v.read === true,
  }
}

/** `notifications_mine()`'s answer. */
export function noticesFromRow(v: unknown): Notices {
  if (!isObj(v)) return { unread: 0, items: [] }
  const items = (Array.isArray(v.items) ? v.items : []).map(noticeFromRow).filter((n): n is Notice => !!n)
  return { unread: typeof v.unread === 'number' ? v.unread : Number(v.unread) || 0, items }
}

/**
 * Where a tap opens: the HR app's request, booking, hire or memo; the Revenue app's rooms or a memo, else its
 * bell. A memo (2026-10-12) reaches whoever it is addressed to in every face — the HR app's memo page, the
 * Revenue app's Memos.
 */
export function noticeUrl(n: Pick<Notice, 'refKind' | 'refId'>, app: PushApp): string {
  const id = encodeURIComponent(n.refId)
  // The CRM lives in the Revenue app whichever app the phone signed up in: the chat, or (an invitation) its notifications.
  if (n.refKind === 'crm_contact') return `/member?page=account&view=crm&chat=${id}`
  if (n.refKind === 'crm_invite') return '/member?page=account&view=crm&crm=notifs'
  // Today › Remind all (2026-10-15): the app's front page, where its punch button will be. Never in a bell.
  if (n.refKind === 'att_today') return app === 'hr' ? '/hr-app' : '/member'
  // One's own request, decided (2026-10-17, mig 20261017120000): Me on that request, in whichever face the one app
  // opens for them (app/page.tsx carries `open=me:` to the HR app, the Finance app's Profile or the portal). The
  // Revenue app has no Me: its front page. Never in a bell.
  if (n.refKind === 'att_request') return app === 'hr' ? `/?open=me:${id}` : '/member'
  // HR, Finance and the portal share the 'hr' push subscription identity. The one-app start keeps the tapped
  // request in the caller's own surface; Revenue continues to open its existing Profile flow.
  if (n.refKind === 'it_request') return app === 'revenue' ? `/member?page=account&view=it&it=${id}` : `/?open=it:${id}`
  // A share request (2026-10-21) is the Revenue app's whichever app the phone signed up in: the request, open over Today.
  if (n.refKind === 'share_request') return `/member?share=${id}`
  if (app === 'hr') {
    if (n.refKind === 'hiring_request') return `/hr-app?open=hire:${id}`
    if (n.refKind === 'booking') return `/hr-app?open=booking:${id}`
    if (n.refKind === 'memo') return `/hr-app?open=memo:${id}`
    return `/hr-app?open=req:${id}`
  }
  // The memo's page named too (2026-10-17): the app's first drawing is Profile › Memos, not Today.
  if (n.refKind === 'memo') return `/member?page=account&view=memos&memo=${id}`
  return n.refKind === 'booking' ? '/member?page=account&view=rooms' : '/member?bell=1'
}

/**
 * What a tapped CRM notice asks the Revenue app to open (`noticeUrl` above): the chat (`chat=<id>`), or the CRM's
 * notifications (`crm=notifs`). Read from the address the app STARTS on, in its first drawing (2026-10-17): a state set
 * after it reached the CRM only once the app's first reads were all back.
 */
export function crmOpenTarget(search: string): { chat: string } | { notifs: true } | null {
  const q = new URLSearchParams(search)
  const chat = q.get('chat')
  if (chat) return { chat }
  return q.get('crm') === 'notifs' ? { notifs: true } : null
}

/**
 * The tag a notice shows under on the phone: a later one with the same tag takes its place. One customer's chat is one
 * tag (`crm:<contact>`), so their messages gather on one notice as a chat app's do; everything else is its own.
 */
export function noticeTag(n: { id: string; refKind: NoticeRef; refId: string }): string {
  return n.refKind === 'crm_contact' ? crmChatTag(n.refId) : n.id
}

export const crmChatTag = (contactId: string) => `crm:${contactId}`

/** What the phone draws for a CRM notice (mig 20261014030000, `app_notifications.data`): the customer, their channel, the line. */
export interface CrmPush {
  /** WhatsApp or Messenger: the badge on the customer's picture. */
  ch: 'whatsapp' | 'messenger' | null
  /** The customer, as the CRM names them. */
  name: string
  /** This notice's line in the chat's gathered notice. */
  line: string
  /** When it happened (ISO): the lines' order. */
  at: string
}

export function crmPushFromRow(v: unknown): CrmPush | null {
  if (!isObj(v) || !str(v.name)) return null
  return {
    ch: v.ch === 'whatsapp' || v.ch === 'messenger' ? v.ch : null,
    name: str(v.name).slice(0, 100),
    line: str(v.line).slice(0, 300),
    at: str(v.at),
  }
}

export type OpenTarget = { k: 'hire' | 'booking' | 'req' | 'memo' | 'me' | 'it'; id: string }

/** What the HR app's `?open=` names: a hire, a booking, a member request, a memo — or one's own request in Me (`me:`). */
export function openTarget(raw: string | null | undefined): OpenTarget | null {
  const m = /^(hire|booking|req|memo|me|it):(.{1,80})$/.exec(raw ?? '')
  return m ? { k: m[1] as OpenTarget['k'], id: m[2] } : null
}

/** The request a tapped notice asks Me to open (`?open=me:<id>`, 2026-10-17), from an address's query. */
export function meOpenTarget(search: string): string | null {
  const t = openTarget(new URLSearchParams(search).get('open'))
  return t?.k === 'me' ? t.id : null
}
