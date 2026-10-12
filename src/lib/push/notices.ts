import type { PushApp } from './config'

/**
 * A notice as the bells and the push read it (mig 20261011180000,
 * `app_notifications`): what it is about, and where a tap on it opens — in
 * the app the phone turned notifications on in.
 */
export type NoticeKind = 'hiring' | 'rooms' | 'review' | 'memo'
export type NoticeRef = 'hiring_request' | 'booking' | 'member_request' | 'memo'

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

const KINDS: readonly NoticeKind[] = ['hiring', 'rooms', 'review', 'memo']
const REFS: readonly NoticeRef[] = ['hiring_request', 'booking', 'member_request', 'memo']

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
  if (app === 'hr') {
    if (n.refKind === 'hiring_request') return `/hr-app?open=hire:${id}`
    if (n.refKind === 'booking') return `/hr-app?open=booking:${id}`
    if (n.refKind === 'memo') return `/hr-app?open=memo:${id}`
    return `/hr-app?open=req:${id}`
  }
  if (n.refKind === 'memo') return `/member?memo=${id}`
  return n.refKind === 'booking' ? '/member?page=account&view=rooms' : '/member?bell=1'
}

export type OpenTarget = { k: 'hire' | 'booking' | 'req' | 'memo'; id: string }

/** What the HR app's `?open=` names: a hire, a booking, a member request or a memo. */
export function openTarget(raw: string | null | undefined): OpenTarget | null {
  const m = /^(hire|booking|req|memo):(.{1,80})$/.exec(raw ?? '')
  return m ? { k: m[1] as OpenTarget['k'], id: m[2] } : null
}
