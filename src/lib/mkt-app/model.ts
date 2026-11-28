// The Marketing app (2026-11-28 — the Claude Design handoff "Marketing View 电话版设计", `Marketing App iOS +
// Android.dc.html`; .claude/rules/marketing/marketing-app.md): Marketing's view on a phone. What it draws, worked out
// from the portal's own readers — My Space's plate (lib/marketing/my-space.ts), the Drive (drive.ts), the Calendar
// (calendar.ts), the pet and the lobby (space.ts), the chat (chat.ts) — in the prototype's words where the portal has
// none of its own. Pure: the app draws what this returns.

import type { MktSub } from '@/lib/marketing/board'
import { addDays, mondayOf, shortDay, weekdayOf, WEEKDAYS } from '@/lib/marketing/board'
import type { CalEvent, CalKind, CalTone } from '@/lib/marketing/calendar'
import { messageLine, type ChatList, type ChatTask } from '@/lib/marketing/chat'
import { cardMeta, type ColumnKey, type PlateCard, type PlateColumn, type WeekRow } from '@/lib/marketing/my-space'
import type { MktNotice } from '@/lib/marketing/shell'
import type { ProjectRow } from '@/lib/marketing/projects'
import type { LobbyPet, PetState, PetStats, Space } from '@/lib/marketing/space'
import type { TodayCard } from '@/lib/me/today'
import type { ApprovalRead, PaymentRequest } from '@/lib/payment-requests/model'
import type { HrAppView } from '@/lib/hr-app/model'

/** A status pill's tone — the handoff's five (red, waiting, done, draft, meet). */
export type Tone = 'red' | 'wait' | 'done' | 'draft' | 'meet'

/** Who is looking: the person on Marketing's roster, or a login with none (the Principal's shared one). */
export interface AppMe {
  /** Their People record, when their login has one. */
  staff: string | null
  first: string
  full: string
  /** "Social Media Executive" — their title as Marketing's roster has it. */
  role: string | null
  letter: string
  /** The avatar's ground (their title's tone). */
  avatarBg: string
}

/** Each part of the app is the portal page it stands for (its tab open — lib/page-tabs.ts), as the HR app's. */
export interface AppParts {
  projects: boolean
  calendar: boolean
  /** One's own Claim — a login of one's own only (`canSendOwnClaims`). */
  claims: boolean
  /** Claim & approve — Claims · View at Dept. */
  claimsApprove: boolean
  library: boolean
  rooms: boolean
  /** MANAGER TOOLS (Marketing · Manage, the Tracking tab). */
  manager: boolean
}

/** The writes behind the buttons, each asked as its action asks it (`mayActOn`, the pages it names). */
export interface AppMay {
  /** New task (Marketing · Create on New Project). */
  create: boolean
  /** A stage worked, a field saved, Submit (Marketing · Edit on the task page). */
  edit: boolean
  /** Approve / Request changes (Approve or Edit — being named on the level is what lets somebody decide). */
  decide: boolean
  /** Nudge (Marketing · Manage). */
  manage: boolean
  /** My Space's own side: the status, the wall, the pet, the chat (Marketing · Edit on My Space). */
  space: boolean
}

export interface AppClaims {
  mine: PaymentRequest[]
  approval: ApprovalRead | null
  /** Claims · Create (own): + New request. */
  canCreate: boolean
  error: string | null
}

export interface MktAppData {
  /** The office's today, YYYY-MM-DD. */
  today: string
  me: AppMe
  /** Viewing as a person: whose screen it is (read-only). */
  viewingAs: string | null
  /** A login of one's own: Me (the punch, My profile) and Claim. */
  personalLogin: boolean
  /** The view switch (an account that may switch views, never while viewing as a person). */
  views: { current: HrAppView } | null
  parts: AppParts
  may: AppMay
  columns: PlateColumn[]
  week: WeekRow[]
  rows: ProjectRow[]
  subs: MktSub[]
  events: CalEvent[]
  notices: MktNotice[]
  space: Space
  pet: PetStats | null
  /** Somebody on Marketing's roster has a pet (not the Principal's shared login). */
  hasPet: boolean
  plate: { count: number; red: number; fresh: boolean }
  lobby: Array<LobbyPet & { state: PetState }>
  chat: ChatList
  chatTasks: ChatTask[]
  claims: AppClaims | null
  /** The sidebar's counts (mkt_shell): what waits in Tracking; claims waiting for one's approval. */
  counts: { tracking: number; claims: number }
}

// ── Tasks ─────────────────────────────────────────────────────────────────

export type SegKey = 'turn' | 'waiting' | 'delegated'

/** The segmented control: 👉 My turn · ⏳ Waiting · 📤 Delegated, each with its count (My turn's red when not none). */
export function segsOf(columns: readonly PlateColumn[]): { key: SegKey; label: string; count: number; hot: boolean }[] {
  const n = (k: ColumnKey) => columns.find(c => c.key === k)?.cards.length ?? 0
  return [
    { key: 'turn', label: '👉 My turn', count: n('turn'), hot: n('turn') > 0 },
    { key: 'waiting', label: '⏳ Waiting', count: n('waiting'), hot: false },
    { key: 'delegated', label: '📤 Delegated', count: n('delegated'), hot: false },
  ]
}

export interface CardView {
  key: string
  trackId: string
  title: string
  dot: string | null
  meta: string
  tone: Tone
  label: string
  /** Open, or the orange Review (an approval, a delivery to review). */
  act: 'Open' | 'Review'
  red: boolean
}

/**
 * A card as the phone draws it (the prototype's cardOf): red ground and edge when late or changes were asked; the pill
 * in My Space's words; another's turn grey (the prototype's draft tone), as Waiting draws it.
 */
export function cardView(c: PlateCard, column: SegKey): CardView {
  const red = c.tone === 'red'
  const tone: Tone = red ? 'red' : c.tone === 'done' ? 'done' : column === 'waiting' ? 'draft' : 'wait'
  return {
    key: c.key,
    trackId: c.trackId,
    title: c.title,
    dot: c.sub?.dot ?? null,
    meta: cardMeta(c),
    tone,
    label: c.label,
    act: c.action === 'review' ? 'Review' : 'Open',
    red,
  }
}

export function cardsOf(columns: readonly PlateColumn[], seg: SegKey): CardView[] {
  return (columns.find(c => c.key === seg)?.cards ?? []).map(c => cardView(c, seg))
}

/** The Tasks tab's badge: My turn's count. */
export const turnCount = (columns: readonly PlateColumn[]) => columns.find(c => c.key === 'turn')?.cards.length ?? 0

// ── The punch (Me's Today card, lib/me/today.ts) ─────────────────────────

/** The Tasks head's chip: `🕘 Punch in` → `🟢 In · 09:41` → `Out · 18:02` — or the day as Me says it, with no punch. */
export function punchChip(card: TodayCard | null): string | null {
  if (!card) return null
  if (card.out) return `Out · ${card.out}`
  if (card.in) return `🟢 In · ${card.in}`
  if (card.punch === 'in') return '🕘 Punch in'
  return `🕘 ${card.chip}`
}

/** More's punch row: the line and the button (none once the day is done or there is nothing to punch). */
export function punchRow(card: TodayCard | null): { line: string; button: string | null; primary: boolean } | null {
  if (!card) return null
  if (card.punch === 'in') return { line: card.line, button: 'Punch in', primary: true }
  if (card.punch === 'out') return { line: card.line, button: 'Punch out', primary: false }
  return { line: card.line, button: card.out ? 'Done' : null, primary: false }
}

// ── Projects (the Drive, lib/marketing/drive.ts) ──────────────────────────

/** A task row's glyph: its kind — ⚡ quick, 🔁 recurring, 📦 a product project's deliverable. */
export function kindGlyph(r: Pick<ProjectRow, 'kind'>): string {
  return r.kind === 'recurring' ? '🔁' : r.kind === 'quick' ? '⚡' : '📦'
}

export const toneOf = (t: ProjectRow['tone'] | CalTone): Tone => (t === 'waiting' ? 'wait' : t)

/** A task row's small print: Track ID · stage · due. */
export function fileSub(r: ProjectRow): string {
  return [r.trackId, r.open ? r.stage : 'Done', r.due ? shortDay(r.due) : null].filter(Boolean).join(' · ')
}

/** "3 items", "Empty" — a subsidiary folder's line. */
export const itemsLine = (n: number) => (n ? `${n} item${n === 1 ? '' : 's'}` : 'Empty')

// ── More ──────────────────────────────────────────────────────────────────

/** More's subsidiary cards: what is open for each, and how much of it is late. */
export function subCards(subs: readonly MktSub[], rows: readonly ProjectRow[]): { sub: MktSub; open: number; late: number }[] {
  return subs.map(sub => {
    const open = rows.filter(r => r.sub?.code === sub.code && r.open)
    return { sub, open: open.length, late: open.filter(r => r.tone === 'red').length }
  })
}

export const openLine = (n: number) => (n ? `${n} open` : 'Nothing open')

// ── Calendar ──────────────────────────────────────────────────────────────

/** The chips over the agenda: 📣 Posts, ⏱ Due, 🗓️ Shoots — and 📈 Ads, only when there is one. */
export const CAL_LAYERS: ReadonlyArray<{ key: CalKind; label: string }> = [
  { key: 'post', label: '📣 Posts' },
  { key: 'due', label: '⏱ Due' },
  { key: 'meet', label: '🗓️ Shoots' },
  { key: 'ads', label: '📈 Ads' },
]

export interface CalFilterApp {
  layers: Record<CalKind, boolean>
  /** Only the viewer's own dates. */
  mine: boolean
  /** A day picked on the week strip; null for all. */
  day: string | null
}

const passesApp = (e: CalEvent, f: Pick<CalFilterApp, 'layers' | 'mine'>, me: string | null) =>
  f.layers[e.kind] && (!f.mine || (!!me && e.people.includes(me)))

/** Each layer's count, as the chip says it (the Mine switch counts). */
export function layerCounts(events: readonly CalEvent[], f: Pick<CalFilterApp, 'mine'>, me: string | null): Record<CalKind, number> {
  const out: Record<CalKind, number> = { post: 0, due: 0, meet: 0, ads: 0 }
  for (const e of events) if (!f.mine || (!!me && e.people.includes(me))) out[e.kind] += 1
  return out
}

export interface WeekDay {
  day: string
  wd: string
  n: number
  today: boolean
  dots: Tone[]
}

/** The week strip, Monday to Sunday of today's week: up to three tone dots a day. */
export function weekStrip(today: string, events: readonly CalEvent[], f: Pick<CalFilterApp, 'layers' | 'mine'>, me: string | null): WeekDay[] {
  if (!today) return []
  const mon = mondayOf(today)
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(mon, i)
    const dots = events.filter(e => e.day === day && passesApp(e, f, me)).slice(0, 3).map(e => toneOf(e.tone))
    return { day, wd: WEEKDAYS[weekdayOf(day)], n: +day.slice(8, 10), today: day === today, dots }
  })
}

export interface AgendaDay {
  day: string
  label: string
  wd: string
  today: boolean
  /** Before today, with something still open. */
  overdue: boolean
  events: CalEvent[]
}

/**
 * The agenda by day: what is still open from the days before (a stage due date past), then today up to a week on —
 * or the one day picked on the strip.
 */
export function agendaOf(today: string, events: readonly CalEvent[], f: CalFilterApp, me: string | null): AgendaDay[] {
  if (!today) return []
  const until = addDays(today, 7)
  const shown = events.filter(e => passesApp(e, f, me)).filter(e =>
    f.day ? e.day === f.day : (e.day >= today && e.day <= until) || (e.day < today && e.tone === 'red'))
  const days = [...new Set(shown.map(e => e.day))].sort()
  return days.map(day => ({
    day,
    label: day === today ? `Today · ${shortDay(day)}` : shortDay(day),
    wd: WEEKDAYS[weekdayOf(day)],
    today: day === today,
    overdue: day < today,
    events: shown.filter(e => e.day === day),
  }))
}

/** "November 2026" — the month today is in. */
export function monthTitle(day: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return day ? `${names[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}` : ''
}

/** More's Calendar tile: "n today". */
export const todayCount = (today: string, events: readonly CalEvent[]) => events.filter(e => e.day === today).length

// ── Quick and recurring tasks (New Project's, lib/marketing/actions.ts › createMktTask) ──────

/** The handoff's types; the database's keys (TASK_TYPES — ads, social, content, brand, other). */
export const QUICK_TYPES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'ads', label: 'Ads' },
  { key: 'social', label: 'Social Media' },
  { key: 'content', label: 'Content (Video)' },
  { key: 'brand', label: 'Brand' },
  { key: 'other', label: 'Other' },
]

export const QUICK_TITLE_MIN = 3

/** The next Monday after today (a recurring task's first run: "Every week on Monday, from …"). */
export function nextMonday(today: string): string {
  const wd = weekdayOf(today)
  return addDays(today, wd === 0 ? 7 : 7 - wd)
}

/** The day a quick stage is due: two working days on (Monday to Friday — lib/marketing/flow.ts). */
export function twoWorkingDays(from: string): string {
  let d = from
  let left = 2
  while (left > 0) {
    d = addDays(d, 1)
    if (weekdayOf(d) < 5) left -= 1
  }
  return d
}

/** What will be made, said under the form (the prototype's note). */
export function quickNote(kind: 'quick' | 'recurring', today: string): string {
  if (kind === 'recurring') {
    return `Every week on Monday, from ${shortDay(nextMonday(today))}, no end date. One stage, yours, due in 2 working days.`
  }
  return `One stage, yours, due in 2 working days (${shortDay(twoWorkingDays(today))}). Stages and approvers can be added on the task.`
}

/** The stage a phone's task is made with: one, the creator's, two working days, a line of what was done. */
export function quickStage(me: string, typeLabel: string) {
  return { name: typeLabel, who: me, sla: 2, appr: [], form: [{ label: 'What was done', type: 'Text' }], back: null }
}

/** A recurring task's rule as the database takes it: every week on Monday from the next Monday, no end. */
export function weeklyRule(today: string) {
  return { freq: 'weekly', start: nextMonday(today), days: [1], every: 1, endMode: 'never' }
}

// ── Notices ───────────────────────────────────────────────────────────────

/** A notice's icon: an approval to give 📤, changes asked ↩️, a plan 📋, a payment request 🧾, else 🎬. */
export function noticeIcon(n: Pick<MktNotice, 'type' | 'refKind'>): string {
  if (n.refKind === 'payment_request') return '🧾'
  if (n.refKind === 'mkt_quote') return '✅'
  if (n.type === 'approve') return '📤'
  if (n.type === 'changes') return '↩️'
  if (n.type === 'plan') return '📋'
  if (n.type === 'nudge') return '🔔'
  return '🎬'
}

// ── Chat ──────────────────────────────────────────────────────────────────

/** Space's chat row: the first unread line, "Name: …", else all caught up. */
export function chatPeek(list: ChatList): string {
  const dm = list.dms.find(d => d.unread && d.last)
  if (dm?.last) return `${dm.first}: ${messageLine(dm.last)}`
  if (list.lobby.unread && list.lobby.last) return `${list.lobby.last.first || 'Lobby'}: ${messageLine(list.lobby.last)}`
  return 'All caught up'
}

/** Space's tab badge and the chat row's count: chats with something unread (the lobby too). */
export const unreadChats = (list: ChatList) => list.dms.filter(d => d.unread).length + (list.lobby.unread ? 1 : 0)
