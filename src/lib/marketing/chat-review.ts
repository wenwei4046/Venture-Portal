// A direct message opened on a complaint (⑦-3b, mig 20261025040000; the user's answer 35, amended): only somebody's own
// login whose title is full-access — never the shared Principal login — opens one, the two people and a reason first.
// Every opening is a record: who, which two, why, when; kept for good, read by those who may open one. Pure: the page
// draws what this returns.

import { officeTime } from '@/lib/office-time'
import { chatMessageFromRow, type ChatMessage } from './chat'

/** Somebody whose chat may be opened: the roster's with a login, or anybody in a direct chat. */
export interface ReviewPerson {
  staff: string
  /** Their People name. */
  name: string
  first: string
  title: string | null
}

/** One of a record's two, by the name they had then. */
export interface ReviewSide {
  staff: string
  name: string
}

/** A record: who opened which two's chat, why, when. */
export interface ChatReview {
  id: number
  at: string
  /** Who opened it — their People name then. */
  by: string
  reason: string
  a: ReviewSide
  b: ReviewSide
}

export interface ChatReviewLog {
  people: ReviewPerson[]
  /** Newest first. */
  reviews: ChatReview[]
}

/** A chat opened: its record, then its messages — oldest first, older ones still to read when `more`. */
export interface ChatReviewOpen {
  review: ChatReview
  messages: ChatMessage[]
  more: boolean
}

/** A reason's length, the database's. */
export const REASON_MIN = 10
export const REASON_MAX = 500

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function sideFromRow(v: unknown): ReviewSide | null {
  if (!isObject(v) || typeof v.staff !== 'string' || !v.staff) return null
  return { staff: v.staff, name: str(v.name) || 'Somebody' }
}

export function chatReviewFromRow(v: unknown): ChatReview | null {
  if (!isObject(v)) return null
  const id = typeof v.id === 'number' ? v.id : Number(v.id)
  const a = sideFromRow(v.a)
  const b = sideFromRow(v.b)
  if (!Number.isFinite(id) || !a || !b) return null
  return { id, at: str(v.at), by: str(v.by) || 'Somebody', reason: str(v.reason), a, b }
}

export function reviewLogFromRow(row: unknown): ChatReviewLog {
  const r = isObject(row) ? row : {}
  const people: ReviewPerson[] = []
  for (const p of Array.isArray(r.people) ? r.people : []) {
    if (!isObject(p) || typeof p.staff !== 'string' || !p.staff) continue
    const name = str(p.name)
    people.push({ staff: p.staff, name, first: str(p.first) || name || 'Somebody', title: typeof p.title === 'string' && p.title ? p.title : null })
  }
  const reviews: ChatReview[] = []
  for (const v of Array.isArray(r.reviews) ? r.reviews : []) {
    const review = chatReviewFromRow(v)
    if (review) reviews.push(review)
  }
  return { people, reviews }
}

/** A page of a chat opened (its older messages): oldest first, more before them or not. */
export function reviewPageFromRow(row: unknown): { messages: ChatMessage[]; more: boolean } {
  const r = isObject(row) ? row : {}
  const messages: ChatMessage[] = []
  for (const m of Array.isArray(r.messages) ? r.messages : []) {
    const msg = chatMessageFromRow(m)
    if (msg) messages.push(msg)
  }
  return { messages, more: r.more === true }
}

export function reviewOpenFromRow(row: unknown): ChatReviewOpen | null {
  if (!isObject(row)) return null
  const review = chatReviewFromRow(row.review)
  if (!review) return null
  return { review, ...reviewPageFromRow(row) }
}

/** A reason as the database keeps it: one line, tidied. */
export const tidyReason = (text: string) => text.replace(/\s+/g, ' ').trim()

/** What stops a chat being opened, in the database's words — null when nothing does. (One's own chats are not offered:
 * the people to pick leave the caller out.) */
export function reviewProblem(a: string | null, b: string | null, reason: string): string | null {
  if (!a || !b || a === b) return 'Pick the two people whose chat it is.'
  const t = tidyReason(reason)
  if (t.length < REASON_MIN) return 'Say why you are opening it — 10 characters at least.'
  if (t.length > REASON_MAX) return 'A reason is at most 500 characters.'
  return null
}

/** When a record was made, by the office's clock: *24 Oct 2026, 09:12*. */
export const reviewWhen = (at: string) => (at ? officeTime(at).format('D MMM YYYY, HH:mm') : '')

/** A record's two, as it names them: *MEI LING TAN ↔ ALI HASSAN*. */
export const reviewPair = (r: Pick<ChatReview, 'a' | 'b'>) => `${r.a.name} ↔ ${r.b.name}`
