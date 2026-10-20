'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { openTarget, type Notice, type NoticeRef } from '@/lib/push/notices'
import { PUSH_WORDS, popUpNeedsTurningOn, pushState, turnPushOff, turnPushOn, type PushState, type PushTrouble } from '@/components/pwa/push-client'
import PopUpGuide from '@/components/pwa/PopUpGuide'
import PushAsk from '@/components/pwa/PushAsk'
import { useTuckOnScroll } from '@/components/pwa/tuck'
import tuck from '@/components/pwa/tuck.module.css'
import { Select } from '@/components/hrv/select'
import type { HrIconName } from '@/components/hrv/icons'
import ViewingAsBanner from '@/components/layout/ViewingAsBanner'
import { PASSWORD_CHANGED, useChangePassword, type ChangePassword } from '@/components/account/use-change-password'
import { useRequestEmail, type RequestEmailActions } from '@/components/account/use-request-email'
import { MIN_PASSWORD_LENGTH } from '@/lib/account/password'
import { EMAIL_WORDS } from '@/lib/account/email-change'
import { MeOverlay } from '@/components/me/MeOverlay'
import { useMe, useClock } from '@/components/me/useMe'
import { ListCard, ListItem, Label } from '@/components/me/kit'
import { todayCard } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import { kindLabel, waitsAtMe, whenLabel } from '@/lib/attendance/requests'
import { missingAnswers } from '@/lib/hiring/view'
import { GEN_META, genPage, type GenKey, type GenRow } from '@/lib/hr-app/gen-pages'
import {
  approveCounts, approveRows, avatarOf, balanceRows, closeView, decidedWords, homeSummary, peopleGroups, personView, requestView,
  todayCounts, todayRows, type TodayKey,
} from '@/lib/hr-app/hr-view'
import {
  CAND_STAGE, CHIP, HR_APP_VIEWS, MEMBER_KIND, bookingTimes, candChip, clashOf, dayLabel, hm, hourFrom, isPendingHire, isPendingRequest, positionLabel,
  type CandStage, type HrAppData, type HrAppView, type HrHire,
} from '@/lib/hr-app/model'
import { memoUnread, memoWaiting, memosInOrder, type MyMemo } from '@/lib/memos/model'
import { personalUnseen, type MyDocuments } from '@/lib/documentation/personal'
import { pageKeyOf, usePageScroll } from './page-scroll'
import { Avatar, Field, Icon, MONO, Sheet, SheetFacts, Toast, useToast, type SheetAction } from './kit'
import {
  ApproveScreen, BalancesScreen, CloseScreen, DeskScreen, GenScreen, HireScreen, HomeScreen, MemberScreen, MemoScreen, MemosScreen, MyDocsScreen,
  NoticesScreen, PeopleScreen, PersonScreen, RequestScreen, STAGES, TalentScreen, TodayScreen, type ApproveTab, type HomeItem,
} from './screens'
import s from './hr-app.module.css'

// The HR app — HR Mobile (2026-10-17, the Claude Design handoff `design_handoff_hr_mobile`; the user: "make sure is
// same 100% with the prototype", and of the old app's functions the design does not draw, "keep all"). Four tabs —
// Home · Today · Approve · People — a stack of sub screens pushed from anywhere, sheets rising from the bottom, the
// bottom bar stepping away while reading on. The avatar on the head opens Me (components/me). It reads the portal's
// own modules and writes through their actions; the app keeps only where you are and what you are typing.

export type ActResult = { ok: true } | { ok: false; reason: string }

export interface HrAppActions {
  hireAck(id: string, ownerId: string): Promise<ActResult>
  hireInfo(id: string, note: string): Promise<ActResult>
  hireDecline(id: string, note: string): Promise<ActResult>
  hireCancel(id: string): Promise<ActResult>
  hireFill(id: string, hired: string, source: string, cost: string): Promise<ActResult>
  /** "+ New hiring request" (2026-10-17): the desktop drawer's own Submit to HR. */
  hireNew(requestedBy: string, answers: Record<string, string>): Promise<{ ok: true; id: string } | { ok: false; reason: string }>
  candStage(hireId: string, candId: string, stage: CandStage): Promise<ActResult>
  candAdd(hireId: string, cand: { name: string; phone: string; note: string }): Promise<ActResult>
  requestDecide(id: string, decision: 'accept' | 'approve' | 'reject', note: string, route?: 'payroll' | 'payment'): Promise<ActResult>
  /** HR › Attendance › Requests (2026-10-17): the waiting step — HR's, or the upline's on their behalf. */
  attDecide(id: string, approve: boolean, note: string): Promise<ActResult>
  book(b: { title: string; dept: string; roomId: string; date: string; from: number; to: number; attendees: string[]; pax: number }): Promise<ActResult>
  bookCancel(id: string): Promise<ActResult>
  talentNotes(id: string, notes: string): Promise<ActResult>
  talentRemove(id: string): Promise<ActResult>
  /** A Data center letter's (or, 2026-10-17, a company document's) short link, made at the press. */
  letterLink(id: string, kind?: 'letter' | 'document'): Promise<{ ok: true; url: string } | { ok: false; reason: string }>
  /** Their notifications read: these, or all (2026-10-11). */
  noticesRead(ids?: string[] | null): Promise<ActResult>
  /** This phone's pushes on / off. */
  pushSave(s: { endpoint: string; p256dh: string; auth: string; app: 'hr' | 'revenue' }): Promise<ActResult>
  pushRemove(endpoint: string): Promise<ActResult>
  pushTrouble: PushTrouble
  /** Another view of the one app (setViewAs): it opens where that view lives. */
  switchView(view: HrAppView): void
  /** This login's own password (2026-10-12) — a personal login only. */
  changePassword: ChangePassword
  /** Request to change email (2026-10-16) — a personal login only. Absent: the row is not drawn. */
  requestEmail?: RequestEmailActions
  /** Their own memo (2026-10-12): opened, or acknowledged — the LOGIN's receipt, in every view at once. */
  memoMark(id: string, ack: boolean): Promise<{ ok: true; acknowledgedAt?: string | null } | { ok: false; reason: string }>
  memoFile(id: string, mode: 'view' | 'download'): Promise<{ ok: true; url: string } | { ok: false; reason: string }>
  /** One of their own documents (2026-10-14): a short link made at the press. */
  myDocLink(kind: 'document' | 'drive' | 'letter', id: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }>
  /** After a write: read the app's data again. */
  refresh(): void
}

type Tab = 'home' | 'today' | 'approve' | 'people'

type Page =
  | { k: 'req'; id: string }
  | { k: 'mreq'; id: string }
  | { k: 'person'; id: string }
  | { k: 'leave' }
  | { k: 'close' }
  | { k: 'gen'; id: GenKey }
  | { k: 'desk'; id: string; icon: HrIconName }
  | { k: 'hire'; id: string }
  | { k: 'talent'; id: string }
  | { k: 'notices' }
  | { k: 'memos' }
  | { k: 'memo'; id: string }
  | { k: 'mydocs' }
  | { k: 'mydocsFolder'; id: string }

type SheetK =
  | { k: 'facts'; eyebrow: string; title: string; sub?: string; facts: Array<[string, string]>; actions?: SheetAction[] }
  | { k: 'stage'; cid: string; name: string; cur: CandStage }
  | { k: 'ack' } | { k: 'info' } | { k: 'fill' } | { k: 'cand' } | { k: 'newHire' }
  | { k: 'book' }
  | { k: 'booking'; id: string }
  | { k: 'claim'; id: string }
  | { k: 'password' } | { k: 'email' }
  | { k: 'account' }

type Form = Record<string, string | string[] | number | undefined>

const TABS: Array<[Tab, string, HrIconName]> = [['home', 'Home', 'home'], ['today', 'Today', 'in'], ['approve', 'Approve', 'approve'], ['people', 'People', 'staff']]
const TITLE: Record<Tab, string> = { home: '', today: 'Today', approve: 'Approve', people: 'People' }

/** The book sheet opens on HR, as the old app's did — or the first department there is. */
const defaultDept = (d: HrAppData) => (d.bookDepts.find(x => x.name === 'HR') ?? d.bookDepts[0])?.id ?? ''

/** The number Call and Message dial: "012-345 6789" → +60123456789 for WhatsApp. */
function waNumber(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
  return digits.startsWith('0') ? `6${digits}` : digits
}

/** A link made at the press, opened in a tab readied in the tap (never kept; no handle back on the app). */
function openInTab(get: () => Promise<{ ok: true; url: string } | { ok: false; reason: string }>, fail: (m: string) => void, after?: () => void) {
  const win = window.open('', '_blank')
  if (win) win.opener = null
  void get().then(res => {
    if (res.ok && win) win.location.href = res.url
    else {
      win?.close()
      if (!res.ok) fail(res.reason)
    }
    if (res.ok) after?.()
  })
}

export default function HrApp({ data: d, actions }: { data: HrAppData; actions: HrAppActions }) {
  const [tab, setTab] = useState<Tab>('home')
  const [stack, setStack] = useState<Page[]>([])
  const [sheet, setSheet] = useState<SheetK | null>(null)
  const [form, setForm] = useState<Form>({})
  const [formErr, setFormErr] = useState('')
  const [note, setNote] = useState('')
  const [todayF, setTodayF] = useState<TodayKey | 'all'>('all')
  const [reqF, setReqF] = useState<ApproveTab>('hr')
  const [lvF, setLvF] = useState<'all' | 'low'>('all')
  const [gF, setGF] = useState<Partial<Record<GenKey, string>>>({})
  const [q, setQ] = useState('')
  const [mdTab, setMdTab] = useState<'company' | 'personal'>('company')
  const [talentNotes, setTalentNotes] = useState<{ id: string; text: string } | null>(null)
  const [arm, setArm] = useState(false)
  const [busy, startBusy] = useTransition()
  const [toast, flash] = useToast()
  const [meOpen, setMeOpen] = useState(false)
  const [meStart, setMeStart] = useState<string | null>(null)

  const top = stack[stack.length - 1]
  const att = d.att ?? null
  const now = useMemo(() => new Date(), [d])
  // Every page opens at its top and Back returns to where its page was left; the bar steps away while reading on.
  const page = pageKeyOf(tab, stack)
  const scrollerRef = useRef<HTMLDivElement>(null)
  usePageScroll(scrollerRef, page)
  const barRef = useRef<HTMLElement>(null)
  const tucked = useTuckOnScroll(barRef, !top, page)

  // Me (2026-10-17): the avatar opens it, for a login of their own with a People record; it reads today on opening.
  const personal = !!d.personalLogin && !d.viewingAs
  // A personal login is one a People record names (lib/account/personal-login.ts): Me is theirs.
  const mine = personal
  const me = useMe(mine)
  const nowSec = useClock(me.s.today?.now, me.s.todayAt)
  const card = todayCard(me.s.today, nowSec, officeToday())
  const meName = d.meLine?.split(' · ')[0] || d.greetName
  const meAv = avatarOf(meName || 'Me')

  // Their own memos (2026-10-12): what was opened or acknowledged here shows at once, before the app reads again.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  const [acked, setAcked] = useState<ReadonlyMap<string, string>>(() => new Map())
  const memos = useMemo<MyMemo[]>(() => memosInOrder((d.memos ?? []).map(m => ({
    ...m,
    readAt: m.readAt ?? (opened.has(m.id) || acked.has(m.id) ? m.publishedAt : null),
    acknowledgedAt: m.acknowledgedAt ?? acked.get(m.id) ?? null,
  }))), [d.memos, opened, acked])

  // ── What the tabs count ──
  const tRows = useMemo(() => (att && d.parts.today ? todayRows(att) : []), [att, d.parts.today])
  const tCounts = todayCounts(tRows)
  const aCounts = att && d.parts.approve ? approveCounts(att.requests) : { hr: 0, upline: 0, decided: 0 }
  const membersOn = d.parts.requests
  const memberPending = d.requests.filter(isPendingRequest).length
  const hrWaiting = aCounts.hr + (membersOn ? memberPending : 0)
  const bRows = useMemo(() => (att && d.parts.balances ? balanceRows(att) : []), [att, d.parts.balances])
  const lowLeave = bRows.filter(r => r.low).length
  const pendingHires = d.parts.hiring ? d.hires.filter(isPendingHire).length : 0
  const attShut = (open: boolean) => (!open ? 'This is not open to your account.' : !att ? d.attError ?? 'Attendance could not be read.' : null)

  // ── Moving about ──
  const push = (p: Page) => {
    setStack(st => [...st, p])
    setNote('')
    setArm(false)
  }
  const pop = () => setStack(st => st.slice(0, -1))
  const goTab = (t: Tab) => {
    setTab(t)
    setStack([])
    setSheet(null)
  }
  const openSheet = (sh: SheetK, f: Form = {}) => {
    setSheet(sh)
    setForm(f)
    setFormErr('')
    setArm(false)
  }
  const closeSheet = () => setSheet(null)

  /** Run a write; close what asked for it on success, say why on a refusal. */
  const run = (fn: () => Promise<ActResult>, after?: () => void, done?: string) => {
    startBusy(async () => {
      const res = await fn()
      if (!res.ok) {
        if (sheet) setFormErr(res.reason)
        else flash(res.reason)
        return
      }
      after?.()
      if (done) flash(done)
      actions.refresh()
    })
  }

  const genOpen = (key: GenKey) => {
    const g = genPage(key, d, gF[key] ?? null, gF.roomSched ?? d.today)
    if (g) push({ k: 'gen', id: key })
    else push({ k: 'desk', id: GEN_META[key].label, icon: GEN_META[key].icon })
  }

  // ── Notifications: a notice opens what it is about, or its list when it has left it ──
  const openRef = (kind: NoticeRef, id: string) => {
    setSheet(null)
    // IT support lives in the Revenue app (2026-10-20): the request opens there.
    if (kind === 'it_request') {
      window.location.assign(`/member?page=account&view=it&it=${encodeURIComponent(id)}`)
      return
    }
    if (kind === 'hiring_request') {
      setTab('home')
      setStack(d.hires.some(h => h.id === id) ? [{ k: 'gen', id: 'hire' }, { k: 'hire', id }] : [{ k: 'gen', id: 'hire' }])
    } else if (kind === 'memo') {
      setTab('home')
      setStack(memos.some(m => m.id === id) ? [{ k: 'memos' }, { k: 'memo', id }] : [{ k: 'memos' }])
    } else if (kind === 'member_request') {
      setTab('approve')
      setReqF('members')
      setStack(d.requests.some(r => r.id === id) ? [{ k: 'mreq', id }] : [])
    } else {
      setTab('home')
      setStack([{ k: 'gen', id: 'roomSched' }])
      if (d.bookings.some(b => b.id === id)) openSheet({ k: 'booking', id })
    }
  }
  const [fresh] = useState(() => new Set(d.notices.items.filter(n => !n.read).map(n => n.id)))
  const openNotices = () => {
    push({ k: 'notices' })
    if (d.notices.unread > 0) void actions.noticesRead(null).then(r => { if (r.ok) actions.refresh() })
  }
  // A tapped push opens the app at `?open=hire:HR-205` (lib/push/notices noticeUrl): go there once, then forget it.
  // One's own request, decided (`open=me:<id>`, 2026-10-17): Me, on that request.
  useEffect(() => {
    const target = openTarget(new URLSearchParams(window.location.search).get('open'))
    if (!target) return
    window.history.replaceState(null, '', window.location.pathname)
    if (target.k === 'me') {
      if (mine) {
        setMeStart(target.id)
        setMeOpen(true)
      }
      return
    }
    openRef(target.k === 'hire' ? 'hiring_request' : target.k === 'req' ? 'member_request' : target.k === 'memo' ? 'memo' : 'booking', target.id)
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // This phone's pushes: asked of the browser once the app is open; the permission only when the row is pressed.
  const [pushNow, setPushNow] = useState<PushState | null>(null)
  const [popUpGuide, setPopUpGuide] = useState(false)
  useEffect(() => {
    void pushState().then(setPushNow).catch(() => setPushNow('unsupported'))
  }, [])
  const togglePush = () => {
    startBusy(async () => {
      const res = pushNow === 'on' ? await turnPushOff(actions.pushRemove) : await turnPushOn('hr', actions.pushSave, actions.pushTrouble)
      setPushNow(res.state)
      if (res.reason) flash(res.reason)
    })
  }

  // ── The open things ──
  const ar = top?.k === 'req' && att ? att.requests.find(r => r.id === top.id) ?? null : null
  const mr = top?.k === 'mreq' ? d.requests.find(r => r.id === top.id) ?? null : null
  const hr = top?.k === 'hire' ? d.hires.find(h => h.id === top.id) ?? null : null
  const tt = top?.k === 'talent' ? d.talents.find(t => t.id === top.id) ?? null : null
  const mm = top?.k === 'memo' ? memos.find(m => m.id === top.id) ?? null : null
  const mf = top?.k === 'mydocsFolder' && d.myDocs ? d.myDocs.personal.folders.find(f => f.id === top.id) ?? null : null
  const attPerson = top?.k === 'person' && att ? att.config.people.find(p => p.id === top.id) ?? null : null
  const staffPerson = top?.k === 'person' ? d.staff.find(p => p.id === top.id) ?? null : null

  // Opening a memo is reading it: the login's receipt, the same in every view.
  const memoOpen = mm && memoUnread(mm) && !d.viewingAs ? mm.id : null
  useEffect(() => {
    if (!memoOpen) return
    setOpened(prev => new Set(prev).add(memoOpen))
    void actions.memoMark(memoOpen, false).then(r => { if (r.ok) actions.refresh() })
    // Once per memo opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoOpen])

  // ── An attendance request decided (HR's step, or the upline's on their behalf) ──
  const arView = ar && att ? requestView(ar, att.config, att.ledger, att.requests) : null
  const arCanDecide = !!ar && !!arView?.waitsAt && d.may.attDecide && !d.viewingAs
  const arOwn = !!ar && !!att && att.config.people.some(p => p.id === ar.staffId && p.hasLogin && p.name === att.config.me)
  // At the upline's step: on their behalf — unless the viewer IS that upline (2026-10-17), whose own step it is.
  const arBehalf = arView?.waitsAt === 'upline' && !(ar && att && waitsAtMe(ar, att.config))
  const decideAtt = (approve: boolean) => {
    if (!ar || !att) return
    if (!approve && !note.trim()) { flash('Add a note to reject'); return }
    run(() => actions.attDecide(ar.id, approve, note), () => { pop(); setNote('') }, decidedWords(ar, att.config.leaveTypes, approve))
  }
  const decideMember = (approve: boolean) => {
    if (!mr) return
    if (!approve) {
      if (!note.trim()) { flash('Add a note to reject'); return }
      run(() => actions.requestDecide(mr.id, 'reject', note), pop, `${MEMBER_KIND[mr.kind]} · rejected`)
      return
    }
    if (mr.kind === 'claim') return openSheet({ k: 'claim', id: mr.id }, { note })
    run(() => actions.requestDecide(mr.id, mr.kind === 'waiting' ? 'accept' : 'approve', note), pop, mr.kind === 'waiting' ? 'Accepted to the waiting list' : `${MEMBER_KIND[mr.kind]} · approved`)
  }

  // ── A row of a generic page opened ──
  const openRow = (r: GenRow) => {
    const o = r.open
    if (o.k === 'person') {
      if (att?.config.people.some(p => p.id === o.id) || d.staff.some(p => p.id === o.id)) push({ k: 'person', id: o.id })
    } else if (o.k === 'hire') push({ k: 'hire', id: o.id })
    else if (o.k === 'talent') push({ k: 'talent', id: o.id })
    else if (o.k === 'booking') openSheet({ k: 'booking', id: o.id })
    else if (o.k === 'book') {
      if (d.may.book) openSheet({ k: 'book' }, { pax: 1, att: d.meId ? [d.meId] : [], dept: defaultDept(d), room: o.roomId, from: '540', to: String(hourFrom(540)) })
    } else if (o.k === 'letter' || o.k === 'document') {
      const kind = o.k
      const l = kind === 'letter' ? d.letters.find(x => x.id === o.id) : null
      const doc = kind === 'document' ? d.documents?.find(x => x.id === o.id) : null
      openSheet({
        k: 'facts', eyebrow: kind === 'letter' ? 'Letters' : 'Documents', title: r.title, sub: r.sub,
        facts: kind === 'letter' && l ? [['Person', l.staffName ?? ''], ['File', l.file], ['Status', r.chip ?? '—']] : [['File', doc?.file ?? ''], ['Shared with', doc?.depts.join(', ') || 'Everybody']],
        actions: [{ label: 'View', primary: true, onClick: () => { closeSheet(); openInTab(() => actions.letterLink(o.id, kind), flash) } }],
      })
    } else openSheet({ k: 'facts', eyebrow: top?.k === 'gen' ? GEN_META[top.id].label : '', title: r.title, sub: r.sub, facts: o.facts })
  }
  const onPrimary = (key: GenKey) => {
    const g = genPage(key, d, gF[key] ?? null, gF.roomSched ?? d.today)
    if (!g?.primary) return
    if (g.primary.act === 'newHire') openSheet({ k: 'newHire' }, { by: d.hireMe ?? '' })
    else if (g.primary.act === 'book') openSheet({ k: 'book' }, { pax: 1, att: d.meId ? [d.meId] : [], dept: defaultDept(d) })
    else flash('Letters are written and filed on the desktop.')
  }

  // ── A person's buttons ──
  const callOf = (id: string, name: string, how: 'call' | 'message') => {
    const phone = d.phones?.[id]
    if (!phone) { flash('No mobile on file'); return }
    if (how === 'call') { flash(`Calling ${name}`); window.location.href = `tel:${phone.replace(/[^\d+]/g, '')}` }
    else { flash('Opens WhatsApp'); window.open(`https://wa.me/${waNumber(phone)}`, '_blank', 'noopener') }
  }

  // ── Home ──
  const avail: Partial<Record<string, boolean>> = {
    today: d.parts.today, requests: d.parts.approve || membersOn, balances: d.parts.balances, close: d.parts.close, records: d.parts.records,
    hire: d.parts.hiring, hireIns: d.parts.insights, talent: d.parts.talent, docDocs: d.parts.docs, docLetters: d.parts.docs, roomSched: d.parts.rooms,
  }
  const act = (k: string): (() => void) => {
    if (k === 'today') return () => goTab('today')
    if (k === 'requests') return () => goTab('approve')
    if (k === 'pplPeople') return () => goTab('people')
    if (k === 'balances') return () => push({ k: 'leave' })
    if (k === 'close') return () => push({ k: 'close' })
    return () => genOpen(k as GenKey)
  }
  const badges: Record<string, number> = { requests: hrWaiting, balances: lowLeave, hire: pendingHires }
  const item = (k: string, label: string, icon: HrIconName, tone: HomeItem['tone']): HomeItem => ({ key: k, label, icon, tone, badge: badges[k] || undefined, go: act(k) })
  const shown = (k: string) => avail[k] !== false
  const quick = ([
    ['today', 'Today', 'in', 'olive'], ['requests', 'Approve', 'approve', 'olive'], ['balances', 'Leave', 'calendar', 'olive'], ['close', 'Month close', 'lock', 'olive'],
    ['hire', 'Hiring', 'hire', 'clay'], ['pay', 'Payroll', 'payroll', 'clay'], ['pplPeople', 'People', 'staff', 'olive'], ['docDocs', 'Documents', 'doc', 'olive'],
  ] as Array<[string, string, HrIconName, HomeItem['tone']]>).filter(([k]) => shown(k)).map(([k, l, i, t]) => item(k, l, i, t))
  const NAV: Array<[string, HomeItem['tone'], Array<[string, string, HrIconName]>]> = [
    ['Hiring', 'clay', [['hire', 'Requests', 'hire'], ['hireIns', 'Insights', 'report'], ['talent', 'Talent Bank', 'staff']]],
    ['Attendance', 'olive', [['today', 'Today', 'in'], ['records', 'Records', 'report'], ['requests', 'Requests', 'approve'], ['balances', 'Leave balances', 'calendar'], ['close', 'Month close', 'lock']]],
    ['HR & Payroll', 'clay', [['hrc', 'HR Costing', 'report'], ['pay', 'Payroll', 'payroll'], ['pmt', 'Payment', 'out']]],
    ['People Management', 'olive', [['pplPeople', 'People', 'staff'], ['hierChart', 'Org chart', 'org'], ['hierLevels', 'Levels', 'tree']]],
    ['Documentation', 'olive', [['docDocs', 'Documents', 'doc'], ['docLetters', 'Letters', 'doc']]],
    ['Admin', 'walnut', [['roomSched', 'Room schedule', 'room'], ['audit', 'Audit Log', 'report']]],
  ]
  const ROMAN = ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.']
  const cats = NAV.map(([label, tone, items]) => ({ label, tone, items: items.filter(([k]) => shown(k)).map(([k, l, i]) => item(k, l, i, tone)) }))
    .filter(c => c.items.length > 0).map((c, i) => ({ ...c, roman: ROMAN[i] }))

  // ── The head ──
  const genKey = top?.k === 'gen' ? top.id : null
  const g = genKey ? genPage(genKey, d, gF[genKey] ?? null, gF.roomSched ?? d.today) : null
  const [eyebrow, title] = !top ? ['', '']
    : top.k === 'req' ? [ar?.ref ?? '', ar && att ? kindLabel(ar, att.config.leaveTypes) : '']
      : top.k === 'mreq' ? [mr?.code ?? '', mr ? MEMBER_KIND[mr.kind] : '']
        : top.k === 'person' ? [attPerson?.department ?? staffPerson?.dept ?? '', attPerson?.name ?? staffPerson?.name ?? '']
          : top.k === 'leave' ? ['Attendance', 'Leave balances']
            : top.k === 'close' ? ['Attendance', 'Month close']
              : top.k === 'gen' ? [g?.eyebrow ?? '', g?.title ?? '']
                : top.k === 'desk' ? ['Opens on desktop', top.id]
                  : top.k === 'hire' ? [hr?.id ?? '', hr ? positionLabel(hr) : '']
                    : top.k === 'talent' ? ['Talent Bank', tt?.name ?? '']
                      : top.k === 'notices' ? ['HR', 'Notifications']
                        : top.k === 'memos' ? ['For you', 'Memos']
                          : top.k === 'memo' ? [mm?.kind ?? 'Memo', mm?.title ?? '']
                            : top.k === 'mydocs' ? ['For you', 'My documents']
                              : ['My documents', mf?.name ?? '']

  // ── Me's Profile carries the old More's rows (the user, 2026-10-17: "keep all … inside Me › Profile") ──
  const leaveMe = (then: () => void) => { setMeOpen(false); setTimeout(then, 280) }
  const accountRows = (
    <AccountRows d={d} memos={memos} pushNow={pushNow} busy={busy} togglePush={togglePush} openGuide={() => setPopUpGuide(true)}
      hasEmail={!!actions.requestEmail} switchView={actions.switchView}
      go={(what) => leaveMe(() => {
        if (what === 'memos') { setTab('home'); setStack([{ k: 'memos' }]) }
        else if (what === 'mydocs') { setTab('home'); setStack([{ k: 'mydocs' }]) }
        else openSheet({ k: what })
      })} />
  )

  const main = !top
  const decideBar = (left: ReactNode, right: ReactNode) => <div className={s.decide}>{left}{right}</div>

  return (
    <div className={s.app} data-hr-app="">
      {d.viewingAs ? <ViewingAsBanner name={d.viewingAs} /> : null}
      {!d.viewingAs ? <PushAsk app="hr" save={actions.pushSave} trouble={actions.pushTrouble} onState={setPushNow} /> : null}

      {main ? (
        <div className={s.mainHead}>
          {tab === 'home' ? (
            <div className={s.brand}>
              <span className={s.brandTile}>H</span>
              <div className={s.brandText}>
                <span className={s.brandName}>HOUZS HR</span>
                <span className={s.brandWho}>{d.meLine || d.greetName}</span>
              </div>
            </div>
          ) : <div className={s.mainTitle} role="heading" aria-level={1}>{TITLE[tab]}</div>}
          <div className={s.headRight}>
            <span className={s.date} style={MONO}>{dayLabel(d.today, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            {tab === 'home' && !d.viewingAs ? (
              <button type="button" className={s.bell} onClick={openNotices} aria-label={d.notices.unread ? `Notifications, ${d.notices.unread} new` : 'Notifications'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></svg>
                {d.notices.unread ? <span className={s.bellDot}>{d.notices.unread > 9 ? '9+' : d.notices.unread}</span> : null}
              </button>
            ) : null}
            {!d.viewingAs ? (
              <button type="button" className={s.meBtn} aria-label={mine ? 'Me' : 'Account'} onClick={() => (mine ? setMeOpen(true) : openSheet({ k: 'account' }))}>
                <Avatar bg={mine ? 'rgb(var(--tone-walnut-deep))' : meAv.bg} fg={mine ? 'var(--hr2-on-accent)' : meAv.fg} ini={meAv.ini} size={34} radius={17} font={12} />
                {card?.punch ? <span className={s.meDot} style={{ background: card.chip === 'Late' ? 'var(--ds-danger)' : 'var(--hr2-accent)' }} /> : null}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={s.subHead}>
          <button type="button" className={s.back} onClick={pop} aria-label="Back">‹</button>
          <div className={s.subText}>
            <span className={s.subEyebrow}>{eyebrow}</span>
            <span className={s.subTitle} role="heading" aria-level={1}>{title}</span>
          </div>
        </div>
      )}

      <div ref={scrollerRef} className={s.scroller}>
        {main && tab === 'home' ? (
          <HomeScreen first={d.greetName} quick={quick} cats={cats} memos={d.viewingAs ? [] : memos.filter(memoWaiting)} openMemo={id => push({ k: 'memo', id })}
            summary={homeSummary(hrWaiting, att && d.parts.today ? tCounts : null, att && d.parts.close ? att.month.month : null)} />
        ) : null}
        {main && tab === 'today' ? (
          <TodayScreen rows={tRows} counts={tCounts} filter={todayF} setFilter={setTodayF} open={id => push({ k: 'person', id })} closed={attShut(d.parts.today)} />
        ) : null}
        {main && tab === 'approve' ? (
          <ApproveScreen tab={reqF} setTab={setReqF} counts={aCounts} membersOn={membersOn} members={d.requests}
            rows={att && d.parts.approve && reqF !== 'members' ? approveRows(att, reqF, now) : []}
            open={id => push({ k: 'req', id })} openMember={id => push({ k: 'mreq', id })} closed={attShut(d.parts.approve)} />
        ) : null}
        {main && tab === 'people' ? (
          <PeopleScreen q={q} setQ={setQ} open={id => push({ k: 'person', id })}
            groups={peopleGroups(att ? att.config.people.map(p => ({ id: p.id, name: p.name, title: p.title ?? 'No title', dept: p.department ?? '' })) : d.staff, q)} />
        ) : null}

        {top?.k === 'req' && ar && arView ? (
          <RequestScreen who={ar.who} kind={att ? kindLabel(ar, att.config.leaveTypes) : ''} when={whenLabel(ar)} v={arView} note={note} setNote={setNote} canDecide={arCanDecide} />
        ) : null}
        {top?.k === 'mreq' && mr ? <MemberScreen r={mr} note={note} setNote={setNote} canDecide={isPendingRequest(mr) && mr.kind !== 'replacement' && d.may.decide && !d.viewingAs} /> : null}
        {top?.k === 'person' && attPerson && att ? (
          <PersonScreen v={personView(att, attPerson)} onCall={() => callOf(attPerson.id, attPerson.name, 'call')} onMessage={() => callOf(attPerson.id, attPerson.name, 'message')}
            onRecords={() => flash(`${dayLabel(att.month.month, { month: 'long' })} records · desktop`)} />
        ) : null}
        {top?.k === 'person' && !attPerson && staffPerson ? (
          <PersonScreen v={{ name: staffPerson.name, title: staffPerson.title || 'No title', dept: staffPerson.dept || 'No department', chip: { label: 'Today · —', bg: 'var(--ds-surface-3)', fg: 'var(--ds-ink-2)' }, facts: [], leave: [] }}
            onCall={() => callOf(staffPerson.id, staffPerson.name, 'call')} onMessage={() => callOf(staffPerson.id, staffPerson.name, 'message')} onRecords={() => flash('Records · desktop')} />
        ) : null}
        {top?.k === 'leave' ? <BalancesScreen rows={bRows} filter={lvF} setFilter={setLvF} open={id => push({ k: 'person', id })} closed={attShut(d.parts.balances)} /> : null}
        {top?.k === 'close' ? <CloseScreen v={att && d.parts.close ? closeView(att) : null} closed={attShut(d.parts.close)} /> : null}
        {top?.k === 'gen' && g ? (
          <GenScreen g={g} filter={gF[top.id] ?? null} setFilter={k => setGF(x => ({ ...x, [top.id]: k }))} onPrimary={() => onPrimary(top.id)} openRow={openRow} />
        ) : null}
        {top?.k === 'desk' ? <DeskScreen title={top.id} icon={top.icon} /> : null}
        {top?.k === 'hire' && hr ? (
          <HireScreen hr={hr} mayEdit={d.may.hireEdit && !d.viewingAs} mayCreate={d.may.hireCreate && !d.viewingAs}
            onStage={(cid, name, cur) => openSheet({ k: 'stage', cid, name, cur })} onAdd={() => openSheet({ k: 'cand' })} />
        ) : null}
        {top?.k === 'talent' && tt ? (
          <TalentScreen t={tt} mayEdit={d.may.talentEdit && !d.viewingAs} notes={talentNotes?.id === tt.id ? talentNotes.text : tt.notes}
            setNotes={text => setTalentNotes({ id: tt.id, text })}
            saveNotes={() => { if (d.may.talentEdit && talentNotes?.id === tt.id && talentNotes.text !== tt.notes) run(() => actions.talentNotes(tt.id, talentNotes.text), undefined, 'Notes saved') }} />
        ) : null}
        {top?.k === 'notices' ? <NoticesScreen items={d.notices.items} fresh={fresh} open={(n: Notice) => openRef(n.refKind, n.refId)} /> : null}
        {top?.k === 'memos' ? <MemosScreen memos={memos} open={id => push({ k: 'memo', id })} /> : null}
        {top?.k === 'memo' ? <MemoScreen m={mm} openFile={id => openInTab(() => actions.memoFile(id, 'view'), flash)} /> : null}
        {top?.k === 'mydocs' || top?.k === 'mydocsFolder' ? (
          <MyDocsScreen docs={d.myDocs ?? null} folder={top.k === 'mydocsFolder' ? top.id : null} tab={top.k === 'mydocsFolder' ? 'personal' : mdTab} setTab={setMdTab}
            openFolder={id => push({ k: 'mydocsFolder', id })} open={(kind, id) => openInTab(() => actions.myDocLink(kind, id), flash, actions.refresh)} />
        ) : null}
      </div>

      {top?.k === 'req' && arCanDecide && arView ? decideBar(
        <button type="button" className={`${s.decideBtn} ${s.outline}`} disabled={busy} onClick={() => decideAtt(false)} style={{ color: note.trim() ? 'var(--ds-danger)' : 'var(--ds-ink-3)' }}>Reject</button>,
        <button type="button" className={`${s.decideBtn} ${s.accent}`} disabled={busy || arOwn} onClick={() => decideAtt(true)}>{arBehalf ? 'Approve on behalf' : 'Approve'}</button>,
      ) : null}
      {top?.k === 'mreq' && mr && isPendingRequest(mr) && mr.kind !== 'replacement' && d.may.decide && !d.viewingAs ? decideBar(
        <button type="button" className={`${s.decideBtn} ${s.outline}`} disabled={busy} onClick={() => decideMember(false)} style={{ color: note.trim() ? 'var(--ds-danger)' : 'var(--ds-ink-3)' }}>Reject</button>,
        <button type="button" className={`${s.decideBtn} ${s.accent}`} disabled={busy} onClick={() => decideMember(true)}>{mr.kind === 'waiting' ? 'Accept to waiting list' : 'Approve'}</button>,
      ) : null}
      {top?.k === 'hire' && hr && d.may.hireApprove && !d.viewingAs && (hr.status === 'submitted' || hr.status === 'needs_info' || hr.status === 'acknowledged') ? (
        hr.status === 'acknowledged' ? decideBar(
          <button type="button" className={`${s.decideBtn} ${s.outline}`} style={{ color: arm ? 'var(--ds-danger)' : 'var(--ds-ink)' }} disabled={busy}
            onClick={() => { if (!arm) { setArm(true); return } run(() => actions.hireCancel(hr.id), () => setArm(false), `${hr.id} cancelled`) }}>{arm ? 'Tap again' : 'Cancel'}</button>,
          <button type="button" className={`${s.decideBtn} ${s.accent}`} onClick={() => openSheet({ k: 'fill' }, { hired: '', source: '', cost: '' })}>Mark filled</button>,
        ) : decideBar(
          <button type="button" className={`${s.decideBtn} ${s.outline}`} onClick={() => openSheet({ k: 'info' }, { note: '' })}>More info</button>,
          <button type="button" className={`${s.decideBtn} ${s.accent}`} onClick={() => openSheet({ k: 'ack' }, { owner: d.meId ?? '' })}>Acknowledge</button>,
        )
      ) : null}
      {top?.k === 'talent' && tt && d.may.talentEdit && !d.viewingAs ? (
        <div className={s.actBar}>
          <button type="button" className={`${s.decideBtn} ${s.outline}`} style={{ color: 'var(--ds-danger)', background: arm ? 'var(--ds-danger-bg)' : undefined }} disabled={busy}
            onClick={() => { if (!arm) { setArm(true); return } run(() => actions.talentRemove(tt.id), () => { pop(); setArm(false) }, `${tt.name} removed`) }}>
            {arm ? 'Tap again to remove' : 'Remove from Talent Bank'}
          </button>
        </div>
      ) : null}
      {top?.k === 'memo' && mm && memoWaiting(mm) && !d.viewingAs ? (
        <div className={s.actBar}>
          <button type="button" className={`${s.decideBtn} ${s.accent}`} disabled={busy} onClick={() => run(async () => {
            const r = await actions.memoMark(mm.id, true)
            if (r.ok) setAcked(prev => new Map(prev).set(mm.id, r.acknowledgedAt ?? new Date().toISOString()))
            return r.ok ? { ok: true } : r
          }, undefined, 'Acknowledged')}>{busy ? 'Recording…' : 'Acknowledge'}</button>
        </div>
      ) : null}

      {main ? (
        <nav ref={barRef} className={`${s.tabs} ${tuck.tuckable}`} style={{ transitionDuration: '.32s' }} data-tucked={tucked ? '' : undefined} inert={tucked || undefined} aria-label="HR app">
          {TABS.map(([k, label, icon]) => {
            const on = tab === k
            return (
              <button key={k} type="button" className={s.tab} aria-current={on ? 'page' : undefined} onClick={() => goTab(k)}
                style={{ color: on ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink-3)' }}>
                <Icon name={icon} size={21} />
                <span className={s.tabLabel} style={{ fontWeight: on ? 700 : 500 }}>{label}</span>
                {k === 'approve' && hrWaiting > 0 ? <span className={s.tabBadge}>{hrWaiting}</span> : null}
              </button>
            )
          })}
        </nav>
      ) : null}

      <SheetLayer d={d} sheet={sheet} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} busy={busy} arm={arm} setArm={setArm}
        close={closeSheet} pop={pop} run={run} actions={actions} hr={hr} day={gF.roomSched ?? d.today} pushNow={pushNow} togglePush={togglePush}
        openGuide={() => setPopUpGuide(true)} flash={flash} />
      {popUpGuide ? <PopUpGuide onClose={() => setPopUpGuide(false)} /> : null}
      <Toast msg={toast} />
      {mine ? <MeOverlay me={me} open={meOpen} onClose={() => { setMeOpen(false); setMeStart(null) }} backLabel="HR" startRequest={meStart} accountRows={accountRows} /> : null}
    </div>
  )
}

// ── Me › Profile's rows (the old More's) ─────────────────────────────────────

function myDocsLine(docs: MyDocuments): string {
  const freshN = docs.company.filter(x => !x.seen).length + personalUnseen(docs.personal)
  return freshN ? `${freshN} new for you` : 'Company and personal'
}

/** A row's tile: the old More's glyph on its tint. */
const Tile = ({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) => (
  <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 15 }}>{children}</span>
)

function AccountRows({ d, memos, pushNow, busy, togglePush, openGuide, hasEmail, switchView, go }: {
  d: HrAppData
  memos: MyMemo[]
  pushNow: PushState | null
  busy: boolean
  togglePush: () => void
  openGuide: () => void
  hasEmail: boolean
  switchView: (v: HrAppView) => void
  go: (what: 'memos' | 'mydocs' | 'password' | 'email') => void
}) {
  const waiting = memos.filter(memoWaiting).length
  const pushOff = busy || pushNow === null || pushNow === 'unsupported' || pushNow === 'denied' || pushNow === 'install'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-hr-account="">
      <Label>Account</Label>
      <ListCard>
        <ListItem leading={<Tile bg="rgb(238 240 226)" fg="rgb(88 98 68)">✉</Tile>} title="Memos" onClick={() => go('memos')}
          subtitle={waiting ? `${waiting} waiting for your acknowledgement` : memos.length ? 'All acknowledged' : 'None for you yet'} />
        {d.myDocs?.staffId ? <ListItem leading={<Tile bg="rgb(255 244 231)" fg="rgb(163 78 37)">▥</Tile>} title="My documents" subtitle={myDocsLine(d.myDocs)} onClick={() => go('mydocs')} /> : null}
        <ListItem leading={<Tile bg="rgb(255 240 228)" fg="rgb(189 74 25)">●</Tile>} title="Phone notifications" subtitle={pushNow ? PUSH_WORDS[pushNow] : '…'} chevron={false}
          trailing={<span aria-hidden="true" style={{ width: 36, height: 22, borderRadius: 11, background: pushNow === 'on' ? 'var(--ds-success)' : 'var(--ds-border)', position: 'relative', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 2, left: pushNow === 'on' ? 16 : 2, width: 18, height: 18, borderRadius: 9, background: 'rgb(255 255 255)', transition: 'left .2s' }} />
          </span>}
          onClick={pushOff ? undefined : togglePush} />
        {pushNow === 'on' && popUpNeedsTurningOn() ? <ListItem leading={<Tile bg="rgb(255 240 228)" fg="rgb(189 74 25)">▣</Tile>} title="Make them pop up" subtitle="Pop on screen, once per phone" onClick={openGuide} /> : null}
        <ListItem leading={<Tile bg="rgb(238 235 231)" fg="rgb(90 78 68)">⚿</Tile>} title="Change password" subtitle="The current one, then a new one twice" onClick={() => go('password')} divider={hasEmail} />
        {hasEmail ? <ListItem leading={<Tile bg="rgb(238 235 231)" fg="rgb(90 78 68)">@</Tile>} title={EMAIL_WORDS.title} subtitle="HR approves the new one" onClick={() => go('email')} divider={false} /> : null}
      </ListCard>
      {d.views ? (
        <div role="group" aria-label="Switch view" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <Label>Switch view</Label>
          <ListCard>
            {HR_APP_VIEWS.map(([v, name, where, dot], i) => {
              const here = v === d.views?.current
              return (
                <ListItem key={v} leading={<Tile bg="rgb(246 242 236)" fg={dot}><span style={{ width: 10, height: 10, borderRadius: 5, background: dot }} /></Tile>} title={name}
                  subtitle={here ? 'You are here' : where} chevron={!here} onClick={here ? undefined : () => switchView(v)} divider={i < HR_APP_VIEWS.length - 1} />
              )
            })}
          </ListCard>
        </div>
      ) : null}
    </div>
  )
}

// ── The sheets ───────────────────────────────────────────────────────────────

function SheetLayer(p: {
  d: HrAppData
  sheet: SheetK | null
  form: Form
  setForm: (f: Form) => void
  formErr: string
  setFormErr: (e: string) => void
  busy: boolean
  arm: boolean
  setArm: (a: boolean) => void
  close: () => void
  pop: () => void
  run: (fn: () => Promise<ActResult>, after?: () => void, done?: string) => void
  actions: HrAppActions
  hr: HrHire | null
  day: string
  pushNow: PushState | null
  togglePush: () => void
  openGuide: () => void
  flash: (m: string) => void
}) {
  const { d, sheet: sh, form: F, setForm, formErr, setFormErr, busy, arm, setArm, close, pop, run, actions, day, pushNow, togglePush, flash } = p
  const hr = p.hr
  const [locked, setLocked] = useState(false)
  if (!sh) return null
  const set = (k: string) => (v: string) => { setForm({ ...F, [k]: v }); setFormErr('') }
  const str = (k: string) => (F[k] == null ? '' : String(F[k]))
  const err = formErr ? <span className={s.err} role="alert">{formErr}</span> : null
  const select = (k: string, label: string, options: Array<{ v: string; l: string }>, choose = true) => (
    <Field label={label}>
      <Select bare className={s.select} value={str(k)} onChange={e => set(k)(e.target.value)}>
        {choose ? <option value="">Choose…</option> : null}
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </Select>
    </Field>
  )

  if (sh.k === 'facts') {
    return <Sheet open eyebrow={sh.eyebrow} title={sh.title} sub={sh.sub} onClose={close} actions={sh.actions ?? [{ label: 'Close', onClick: close }]}><SheetFacts items={sh.facts} /></Sheet>
  }

  if (sh.k === 'stage' && hr) {
    return (
      <Sheet open eyebrow={hr.id} title={`Status · ${sh.name}`} onClose={close}>
        {STAGES.map(v => {
          const cc = candChip(v)
          const on = v === sh.cur
          return (
            <button key={v} type="button" className={s.option} style={{ background: on ? 'var(--hr2-pill-on)' : 'var(--ds-surface-2)' }}
              onClick={() => (on ? close() : run(() => actions.candStage(hr.id, sh.cid, v), close, `${sh.name} · ${CAND_STAGE[v][0]}`))}>
              <span className={s.optionDot} style={{ background: CHIP[cc.tone][1] }} />
              <span style={{ flex: 1, fontWeight: on ? 700 : 500 }}>{cc.label}</span>
              <span>{on ? '✓' : ''}</span>
            </button>
          )
        })}
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'ack' && hr) {
    return (
      <Sheet open eyebrow={hr.id} title={`Acknowledge ${hr.id}`} sub="Pick who in HR owns it" onClose={close} actions={[
        { label: 'Cancel', onClick: close },
        { label: 'Acknowledge', primary: true, disabled: busy, onClick: () => (str('owner') ? run(() => actions.hireAck(hr.id, str('owner')), close, `${hr.id} acknowledged`) : setFormErr('Pick the owner.')) },
      ]}>
        {select('owner', 'Owner', d.owners.map(o => ({ v: o.id, l: o.name })))}
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'info' && hr) {
    return (
      <Sheet open eyebrow={hr.id} title="Ask for more, or decline" onClose={close} actions={[
        { label: 'Decline', danger: true, disabled: busy, onClick: () => (str('note') ? run(() => actions.hireDecline(hr.id, str('note')), close, `${hr.id} declined`) : setFormErr('Give a reason.')) },
        { label: 'Request more info', primary: true, disabled: busy, onClick: () => (str('note') ? run(() => actions.hireInfo(hr.id, str('note')), close, 'More info requested') : setFormErr('Write what you need.')) },
      ]}>
        <Field label="Note to requester"><textarea className={s.textarea} rows={3} placeholder="What do you need from them?" value={str('note')} onChange={e => set('note')(e.target.value)} /></Field>
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'fill' && hr) {
    return (
      <Sheet open eyebrow={hr.id} title="Mark filled" onClose={close} actions={[
        { label: 'Cancel', onClick: close },
        {
          label: 'Mark filled', primary: true, disabled: busy, onClick: () => {
            if (!str('hired') || !str('source')) return setFormErr('Pick who was hired and where from.')
            run(() => actions.hireFill(hr.id, str('hired'), str('source'), str('cost').replace(/[^\d.]/g, '')), close, `${hr.id} filled`)
          },
        },
      ]}>
        {select('hired', 'Hired', hr.candidates.filter(c => c.stage !== 'rejected').map(c => ({ v: c.name, l: c.name })))}
        {select('source', 'Hired through', d.sources.map(x => ({ v: x, l: x })))}
        <Field label="Hiring cost (RM)"><input className={s.input} inputMode="decimal" placeholder="0" value={str('cost')} onChange={e => set('cost')(e.target.value)} /></Field>
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'cand' && hr) {
    return (
      <Sheet open eyebrow={hr.id} title="New candidate" onClose={close} actions={[
        { label: 'Cancel', onClick: close },
        { label: 'Add', primary: true, disabled: busy, onClick: () => (str('name') ? run(() => actions.candAdd(hr.id, { name: str('name'), phone: str('phone'), note: str('note') }), close, `${str('name')} added`) : setFormErr('Add a name.')) },
      ]}>
        <Field label="Name"><input className={s.input} value={str('name')} onChange={e => set('name')(e.target.value)} /></Field>
        <Field label="Phone"><input className={s.input} inputMode="tel" value={str('phone')} onChange={e => set('phone')(e.target.value)} /></Field>
        <Field label="Reference / note"><textarea className={s.textarea} rows={3} placeholder="e.g. Referred by Chea Huan" value={str('note')} onChange={e => set('note')(e.target.value)} /></Field>
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'newHire') {
    const fields = d.hireFields ?? []
    const answers: Record<string, string> = Object.fromEntries(fields.map(f => [f.id, str(`a:${f.id}`)]))
    return (
      <Sheet open eyebrow="New" title="New hiring request" sub="Sent to HR as Pending" onClose={close} actions={[
        { label: 'Cancel', onClick: close },
        {
          label: 'Send', primary: true, disabled: busy, onClick: () => {
            const missing = missingAnswers(fields, answers)
            if (missing.length) return setFormErr('Fill in ' + missing.join(', ') + '.')
            if (!str('by')) return setFormErr('Pick who is asking.')
            run(async () => {
              const r = await actions.hireNew(str('by'), answers)
              if (r.ok) flash(`${r.id} · hiring request sent`)
              return r.ok ? { ok: true } : r
            }, close)
          },
        },
      ]}>
        {select('by', 'Requested by', (d.hirePeople ?? []).map(x => ({ v: x.id, l: x.name + (x.dept ? ` · ${x.dept}` : '') })), !d.hireMe)}
        {fields.map(f => (
          <Field key={f.id} label={f.label + (f.required ? ' *' : '')}>
            {f.type === 'longtext' ? <textarea className={s.textarea} rows={3} value={str(`a:${f.id}`)} onChange={e => set(`a:${f.id}`)(e.target.value)} />
              : f.type === 'select' ? (
                <Select bare className={s.select} value={str(`a:${f.id}`)} onChange={e => set(`a:${f.id}`)(e.target.value)}>
                  <option value="">Choose…</option>
                  {f.options.split(',').map(o => o.trim()).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : f.type === 'range' ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className={s.input} inputMode="numeric" placeholder="From" value={str(`a:${f.id}`).split('–')[0] ?? ''} onChange={e => set(`a:${f.id}`)(`${e.target.value}–${str(`a:${f.id}`).split('–')[1] ?? ''}`)} />
                  <span>to</span>
                  <input className={s.input} inputMode="numeric" placeholder="To" value={str(`a:${f.id}`).split('–')[1] ?? ''} onChange={e => set(`a:${f.id}`)(`${str(`a:${f.id}`).split('–')[0] ?? ''}–${e.target.value}`)} />
                </span>
              ) : <input className={s.input} inputMode={f.type === 'number' ? 'numeric' : undefined} value={str(`a:${f.id}`)} onChange={e => set(`a:${f.id}`)(e.target.value)} />}
          </Field>
        ))}
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'book') {
    const attending = (F.att as string[] | undefined) ?? (d.meId ? [d.meId] : [])
    const total = Math.max(attending.length, Number(F.pax) || 1)
    const pq = str('pq').trim().toLowerCase()
    const times = bookingTimes()
    return (
      <Sheet open eyebrow="Book a room" title="Book a room" sub={dayLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })} onClose={close} actions={[
        { label: 'Cancel', onClick: close },
        {
          label: 'Book', primary: true, disabled: busy, onClick: () => {
            const fr = Number(F.from), to = Number(F.to)
            if (!str('title') || !str('dept') || !str('room') || !fr || !to) return setFormErr('Fill in the title, department, room and time.')
            if (to <= fr) return setFormErr('End must be after start.')
            const clash = clashOf(d.bookings, str('room'), day, fr, to)
            if (clash) return setFormErr(`Taken ${hm(clash.from)}–${hm(clash.to)} · ${clash.title}`)
            const room = d.rooms.find(r => r.id === str('room'))?.name ?? 'Room'
            run(() => actions.book({ title: str('title'), dept: str('dept'), roomId: str('room'), date: day, from: fr, to, attendees: attending, pax: total }), close, `${room} booked ${hm(fr)}–${hm(to)}`)
          },
        },
      ]}>
        <Field label="Meeting title"><input className={s.input} placeholder="e.g. Interview" value={str('title')} onChange={e => set('title')(e.target.value)} /></Field>
        {select('dept', 'Department', d.bookDepts.map(x => ({ v: x.id, l: x.name })))}
        {select('room', 'Room', d.rooms.map(r => ({ v: r.id, l: `${r.name} · ${r.seats} seats` })))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {select('from', 'From', times)}
          {select('to', 'To', times)}
        </div>
        <Field label="Attending" group>
          <div className={s.people}>
            <div className={s.picked}>
              {attending.map(id => {
                const name = d.staff.find(x => x.id === id)?.name ?? id
                return (
                  <span key={id} className={s.pickedChip}>
                    {name}
                    <button type="button" className={s.pickedX} aria-label={`Remove ${name}`} onClick={() => setForm({ ...F, att: attending.filter(x => x !== id) })}>×</button>
                  </span>
                )
              })}
            </div>
            <input className={s.input} placeholder="Add a colleague — type a name" aria-label="Add a colleague" value={str('pq')} onChange={e => setForm({ ...F, pq: e.target.value })} />
            {pq ? (
              <div className={s.picked}>
                {d.staff.filter(x => !attending.includes(x.id) && x.name.toLowerCase().includes(pq)).slice(0, 6).map(x => (
                  <button key={x.id} type="button" className={s.sugg} onClick={() => setForm({ ...F, att: [...attending, x.id], pq: '' })}>+ {x.name}</button>
                ))}
              </div>
            ) : null}
          </div>
        </Field>
        <Field label={`Total pax · ${attending.length} named`} group>
          <span className={s.stepper}>
            <button type="button" className={s.stepBtn} aria-label="One fewer" onClick={() => setForm({ ...F, pax: Math.max(attending.length, total - 1) })}>−</button>
            <span style={{ ...MONO, minWidth: 24, textAlign: 'center' }}>{total}</span>
            <button type="button" className={s.stepBtn} aria-label="One more" onClick={() => setForm({ ...F, pax: total + 1 })}>+</button>
          </span>
        </Field>
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'booking') {
    const bk = d.bookings.find(b => b.id === sh.id)
    if (!bk) return null
    return (
      <Sheet open eyebrow={d.rooms.find(r => r.id === bk.roomId)?.name ?? 'Meeting'} title={bk.title} sub={`${dayLabel(bk.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(bk.from)}–${hm(bk.to)}`} onClose={close}
        actions={bk.mine && !d.viewingAs ? [
          { label: 'Close', onClick: close },
          { label: arm ? 'Tap again to cancel' : 'Cancel meeting', danger: true, disabled: busy, onClick: () => { if (!arm) { setArm(true); return } run(() => actions.bookCancel(bk.id), () => { close(); setArm(false) }, 'Meeting cancelled') } },
        ] : [{ label: 'Close', onClick: close }]}>
        <SheetFacts items={[['Room', d.rooms.find(r => r.id === bk.roomId)?.name ?? ''], ['Booked by', bk.byName], ['From', bk.guest ? bk.company ?? '' : bk.dept], ['People', `${bk.pax} pax`]]} />
        {!bk.mine ? <div className={s.meta}>Only {bk.byName} can cancel this meeting.</div> : null}
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'claim') {
    const decide = (route: 'payroll' | 'payment') => run(() => actions.requestDecide(sh.id, 'approve', str('note'), route), () => { close(); pop() }, route === 'payroll' ? 'Claim approved · added to payroll' : 'Claim approved · payment requested')
    return (
      <Sheet open eyebrow="Member services" title="Approve claim" sub="Where the money goes" onClose={close} actions={[
        { label: 'Request payment', disabled: busy, onClick: () => decide('payment') },
        { label: 'Add to payroll', primary: true, disabled: busy, onClick: () => decide('payroll') },
      ]}>
        <div className={s.meta}>Add to payroll pays it with the salary. Request payment sends it to Finance to pay on its own.</div>
        {err}
      </Sheet>
    )
  }

  if (sh.k === 'password') {
    return <Sheet open eyebrow="Account" title="Change password" onClose={close} locked={locked}><PasswordForm change={actions.changePassword} close={close} onBusy={setLocked} /></Sheet>
  }
  if (sh.k === 'email' && actions.requestEmail) {
    return <Sheet open eyebrow="Account" title={EMAIL_WORDS.title} onClose={close} locked={locked}><EmailForm actions={actions.requestEmail} close={close} onBusy={setLocked} /></Sheet>
  }

  if (sh.k === 'account') {
    const pushOff = busy || pushNow === null || pushNow === 'unsupported' || pushNow === 'denied' || pushNow === 'install'
    return (
      <Sheet open eyebrow="HOUZS HR" title="Account" sub={d.greetName} onClose={close}>
        <SheetFacts items={[['This phone', pushNow ? PUSH_WORDS[pushNow] : '…']]} />
        {!d.viewingAs ? <button type="button" className={`${s.sheetBtn}`} disabled={pushOff} onClick={togglePush}>{pushNow === 'on' ? 'Turn notifications off' : 'Turn notifications on'}</button> : null}
        {pushNow === 'on' && popUpNeedsTurningOn() ? <button type="button" className={s.sheetBtn} onClick={() => { close(); p.openGuide() }}>Make them pop up</button> : null}
        {d.views ? HR_APP_VIEWS.filter(([v]) => v !== d.views?.current).map(([v, name, where]) => (
          <button key={v} type="button" className={s.sheetBtn} onClick={() => actions.switchView(v)}>{name} · {where}</button>
        )) : null}
        <div style={{ height: 6 }} />
      </Sheet>
    )
  }
  return null
}

/** Change password's form (2026-10-12): the current one, the new one twice — the portal's own rules and action. */
function PasswordForm({ change, close, onBusy }: { change: ChangePassword; close: () => void; onBusy: (busy: boolean) => void }) {
  const f = useChangePassword(change)
  const type = f.shown ? 'text' : 'password'
  useEffect(() => { onBusy(f.busy) }, [f.busy, onBusy])
  useEffect(() => () => onBusy(false), [onBusy])
  if (f.done) {
    return (
      <>
        <div className={s.meta} role="status">{PASSWORD_CHANGED}</div>
        <button type="button" className={`${s.sheetBtn} ${s.accent}`} style={{ marginBottom: 'calc(10px + max(20px, var(--safe-bottom)))' }} onClick={close}>Done</button>
      </>
    )
  }
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); f.submit() }} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(10px + max(20px, var(--safe-bottom)))' }}>
      <Field label="Current password"><input className={s.input} type={type} autoComplete="current-password" spellCheck={false} value={f.form.current} onChange={e => f.set('current')(e.target.value)} /></Field>
      <Field label={`New password · at least ${MIN_PASSWORD_LENGTH} characters`}><input className={s.input} type={type} autoComplete="new-password" spellCheck={false} value={f.form.next} onChange={e => f.set('next')(e.target.value)} /></Field>
      <Field label="Confirm new password"><input className={s.input} type={type} autoComplete="new-password" spellCheck={false} value={f.form.confirm} onChange={e => f.set('confirm')(e.target.value)} /></Field>
      <label className={s.check}><input type="checkbox" checked={f.shown} onChange={e => f.setShown(e.target.checked)} />Show passwords</label>
      {f.error ? <span className={s.err} role="alert">{f.error}</span> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button type="button" className={s.sheetBtn} onClick={close} disabled={f.busy}>Cancel</button>
        <button type="submit" className={`${s.sheetBtn} ${s.accent}`} disabled={f.busy}>{f.busy ? 'Changing…' : 'Change password'}</button>
      </div>
    </form>
  )
}

/** Request to change email's form (2026-10-16): the email they sign in with, their latest request, the new one. */
function EmailForm({ actions, close, onBusy }: { actions: RequestEmailActions; close: () => void; onBusy: (busy: boolean) => void }) {
  const f = useRequestEmail(actions, true)
  useEffect(() => { onBusy(f.busy) }, [f.busy, onBusy])
  useEffect(() => () => onBusy(false), [onBusy])
  const W = EMAIL_WORDS
  const current = f.mine?.email ?? ''
  const st = f.state
  const tone = st?.kind === 'waiting' ? CHIP.alert : st?.kind === 'approved' ? CHIP.ledger : CHIP.danger
  const foot = { paddingBottom: 'calc(10px + max(20px, var(--safe-bottom)))' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label={W.current} group><span style={{ fontSize: 14 }}>{f.loading && !current ? '…' : current || '—'}</span></Field>
      {f.sent && st?.kind === 'waiting' ? <div className={s.meta} role="status">{W.sent(current)}</div> : null}
      {st ? (
        <div className={s.facts} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={s.chip} style={{ background: tone[0], color: tone[1], padding: '3px 9px', fontSize: 11.5 }}>{st.kind === 'waiting' ? W.waiting : st.kind === 'approved' ? W.approved : W.declined}</span>
            {st.kind === 'waiting' && st.ref ? <span style={{ ...MONO, fontSize: 11, color: 'var(--ds-ink-3)' }}>{st.ref}</span> : null}
          </span>
          <span style={{ fontSize: 13.5 }}>{st.kind === 'approved' ? W.approvedLine(st.to) : `${W.next} · ${st.to}`}</span>
          {st.kind === 'declined' && st.note ? <span style={{ fontSize: 13.5 }}>“{st.note}”</span> : null}
          {st.kind === 'waiting' ? <button type="button" className={s.sheetBtn} style={{ height: 40 }} disabled={f.busy} onClick={f.withdraw}>{f.busy ? W.withdrawing : W.withdraw}</button> : null}
        </div>
      ) : null}
      {st?.kind === 'waiting' ? (
        <div style={foot}>
          {f.error ? <span className={s.err} role="alert">{f.error}</span> : null}
          <button type="button" className={`${s.sheetBtn} ${s.accent}`} style={{ width: '100%', boxSizing: 'border-box' }} onClick={close} disabled={f.busy}>Done</button>
        </div>
      ) : (
        <form noValidate onSubmit={e => { e.preventDefault(); f.submit() }} style={{ display: 'flex', flexDirection: 'column', gap: 12, ...foot }}>
          <Field label={W.next}><input className={s.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={f.next} onChange={e => f.setNext(e.target.value)} disabled={!f.mine} /></Field>
          {f.error ? <span className={s.err} role="alert">{f.error}</span> : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button type="button" className={s.sheetBtn} onClick={close} disabled={f.busy}>Cancel</button>
            <button type="submit" className={`${s.sheetBtn} ${s.accent}`} disabled={f.busy || !f.mine}>{f.busy ? W.sending : W.send}</button>
          </div>
        </form>
      )}
    </div>
  )
}

