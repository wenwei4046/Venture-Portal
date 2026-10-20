/**
 * One's own memos (2026-10-12 — the user: "我在任何一个 view 都可以收到那个
 * notification，那我只需要 acknowledge 一次，我每一个 view 就都当做是 acknowledge
 * 了，因为主要都是我的 account 嘛"). A memo — People › Documentation › Publish, a
 * Data center letter — reaches the People record a login holds, in whichever
 * face that login is looking through: the portal's every view, the HR app, the
 * Revenue app. Its receipt is the LOGIN's (`member_memo_receipts`, one row per
 * login and version): read or acknowledged once is read or acknowledged
 * everywhere (mig 20261012210000).
 *
 * Pure: the database's answers (`my_memos()`, `hr_memo_preview()`) turned into
 * these types, and the words the faces share.
 */

import { officeTime } from '@/lib/office-time'
import { signatureOrNull } from './signature'

export interface MemoFile {
  name: string
  type: string | null
}

export interface MyMemo {
  id: string
  title: string
  body: string
  sender: string
  /** "Memo", "Letter", or a type of HR's own. */
  kind: string
  publishedAt: string
  version: number
  requiresAck: boolean
  /** The file sent with it — null when there is none, or it was taken back. */
  attachment: MemoFile | null
  readAt: string | null
  acknowledgedAt: string | null
}

export interface MyMemos {
  /** The People record the login holds — null for a shared login (principal@, hr@ …), which has no memos. */
  staffId: string | null
  memos: MyMemo[]
}

export const NO_MEMOS: MyMemos = { staffId: null, memos: [] }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function fileOf(name: unknown, type: unknown): MemoFile | null {
  const n = strOrNull(name)
  return n ? { name: n, type: strOrNull(type) } : null
}

export function myMemoFromRow(raw: unknown): MyMemo | null {
  const x = obj(raw)
  if (!str(x.id)) return null
  return {
    id: str(x.id),
    title: str(x.title),
    body: str(x.body),
    sender: str(x.sender) || 'People & Culture',
    kind: str(x.kind) || 'Memo',
    publishedAt: str(x.publishedAt),
    version: typeof x.version === 'number' ? x.version : Number(x.version) || 1,
    requiresAck: x.requiresAck !== false,
    attachment: fileOf(x.attachmentName, x.attachmentType),
    readAt: strOrNull(x.readAt),
    acknowledgedAt: strOrNull(x.acknowledgedAt),
  }
}

/** `my_memos()`'s answer. */
export function myMemosFromRow(raw: unknown): MyMemos {
  const x = obj(raw)
  const memos = (Array.isArray(x.memos) ? x.memos : []).map(myMemoFromRow).filter((m): m is MyMemo => !!m)
  return { staffId: strOrNull(x.staffId), memos }
}

/** The Revenue app's own memo shape (lib/member/types.ts `MemberMemo`) — the Principal's own memos shown there. */
export function toMemberMemo(m: MyMemo): {
  id: string; title: string; body: string; sender: string; publishedAt: string; effectiveAt: string; version: number; requiresAck: boolean
  readAt: string | null; acknowledgedAt: string | null; departments: string[]; kind: string; attachmentName: string | null; attachmentType: string | null
} {
  return {
    id: m.id, title: m.title, body: m.body, sender: m.sender, publishedAt: m.publishedAt, effectiveAt: m.publishedAt.slice(0, 10),
    version: m.version, requiresAck: m.requiresAck, readAt: m.readAt, acknowledgedAt: m.acknowledgedAt, departments: [],
    kind: m.kind, attachmentName: m.attachment?.name ?? null, attachmentType: m.attachment?.type ?? null,
  }
}

/** Still waiting for this person's Acknowledge. */
export const memoWaiting = (m: Pick<MyMemo, 'requiresAck' | 'acknowledgedAt'>): boolean => m.requiresAck && !m.acknowledgedAt

/** Not opened yet. */
export const memoUnread = (m: Pick<MyMemo, 'readAt' | 'acknowledgedAt'>): boolean => !m.readAt && !m.acknowledgedAt

/** What the bell counts: every memo not opened yet or still waiting to be acknowledged. */
export function memoBellCount(memos: readonly MyMemo[]): number {
  return memos.filter(m => memoUnread(m) || memoWaiting(m)).length
}

/** The newest first, and the ones still waiting before the rest. */
export function memosInOrder(memos: readonly MyMemo[]): MyMemo[] {
  return memos
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(memoWaiting(b.m)) - Number(memoWaiting(a.m)) || a.i - b.i)
    .map(x => x.m)
}

/** The body's paragraphs, as the Revenue app reads them: a blank line between two. */
export function memoParas(body: string): string[] {
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  return paras.length ? paras : body.trim() ? [body.trim()] : []
}

/** "Memo · House rules" — a letter or a type of HR's own says what it is. */
export function memoHeading(m: Pick<MyMemo, 'kind' | 'title'>): string {
  return !m.kind || m.kind === 'Memo' ? m.title : `${m.kind} · ${m.title}`
}

/** "12 Oct 2026, 5:44 pm" — on the office's clock. */
export function memoWhen(at: string): string {
  if (!at) return ''
  const t = officeTime(at)
  return t.isValid() ? t.format('D MMM YYYY, h:mm a') : ''
}

/** "12 Oct" — a list's short day. */
export function memoDay(at: string): string {
  if (!at) return ''
  const t = officeTime(at)
  return t.isValid() ? t.format('D MMM') : ''
}

/** "You acknowledged this · 12 Oct 2026, 5:44 pm". */
export function ackedLine(at: string | null): string {
  return at ? `You acknowledged this · ${memoWhen(at)}` : ''
}

/** The file's kind as its tile says it: "PDF", "JPEG" (four letters at most). */
export function memoFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : 'FILE'
}

// ── Publish › Preview ───────────────────────────────────────────────────────

export interface PreviewPerson {
  staffId: string
  name: string
  department: string
  /** A login of their own, active — without one the memo cannot reach them. */
  hasLogin: boolean
  readAt: string | null
  acknowledgedAt: string | null
  /** The signature they acknowledged with (2026-10-20) — null for an older acknowledgement, or none yet. */
  signature: string | null
}

export interface MemoPreview {
  id: string
  title: string
  body: string
  sender: string
  kind: string
  publishedAt: string
  requiresAck: boolean
  attachment: MemoFile | null
  withdrawnAt: string | null
  people: PreviewPerson[]
}

/** `hr_memo_preview()`'s answer. */
export function memoPreviewFromRow(raw: unknown): MemoPreview | null {
  const x = obj(raw)
  if (!str(x.id)) return null
  return {
    id: str(x.id),
    title: str(x.title),
    body: str(x.body),
    sender: str(x.sender) || 'People & Culture',
    kind: str(x.kind) || 'Memo',
    publishedAt: str(x.publishedAt),
    requiresAck: x.requiresAck !== false,
    attachment: fileOf(x.attachmentName, x.attachmentType),
    withdrawnAt: strOrNull(x.withdrawnAt),
    people: (Array.isArray(x.people) ? x.people : []).map(p => {
      const y = obj(p)
      return {
        staffId: str(y.staffId),
        name: str(y.name),
        department: str(y.department).replace(/\s+Department$/i, '').trim(),
        hasLogin: y.hasLogin === true,
        readAt: strOrNull(y.readAt),
        acknowledgedAt: strOrNull(y.acknowledgedAt),
        signature: signatureOrNull(y.signature),
      }
    }).filter(p => p.staffId),
  }
}

export type ReceiptTone = 'ledger' | 'alert' | 'info' | 'gone'

/** Where one person stands with it: Acknowledged → Opened → Delivered — or no login yet, so nowhere. */
export function receiptOf(p: PreviewPerson): { label: string; tone: ReceiptTone; when: string } {
  if (p.acknowledgedAt) return { label: 'Acknowledged', tone: 'ledger', when: memoWhen(p.acknowledgedAt) }
  if (p.readAt) return { label: 'Opened', tone: 'alert', when: memoWhen(p.readAt) }
  if (!p.hasLogin) return { label: 'No login yet', tone: 'gone', when: '' }
  return { label: 'Delivered', tone: 'info', when: '' }
}

/** "3 of 5 acknowledged · 1 has no login yet". */
export function previewSummary(people: readonly PreviewPerson[]): string {
  const acked = people.filter(p => p.acknowledgedAt).length
  const noLogin = people.filter(p => !p.hasLogin && !p.acknowledgedAt && !p.readAt).length
  const head = `${acked} of ${people.length} acknowledged`
  return noLogin ? `${head} · ${noLogin} ${noLogin === 1 ? 'has' : 'have'} no login yet` : head
}
