'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useTuckOnScroll } from '@/components/pwa/tuck'
import tuck from '@/components/pwa/tuck.module.css'
import PortalPushAsk from '@/components/pwa/PortalPushAsk'
import { useStatusBar } from '@/components/pwa/status-bar'
import ViewingAsBanner from '@/components/layout/ViewingAsBanner'
import { MeOverlay } from '@/components/me/MeOverlay'
import { useClock, useMe } from '@/components/me/useMe'
import type { ChangePassword } from '@/components/account/use-change-password'
import { todayCard } from '@/lib/me/today'
import { officeToday } from '@/lib/office-time'
import { fileRoute } from '@/lib/storage/browser'
import { openTarget } from '@/lib/push/notices'
import type { DrivePath } from '@/lib/marketing/drive'
import type { ChatList, ChatMessage } from '@/lib/marketing/chat'
import type { NewTaskInput } from '@/lib/marketing/actions'
import type { MktNotice } from '@/lib/marketing/shell'
import type { ProjectScope } from '@/lib/marketing/projects'
import type { PetStats, Space } from '@/lib/marketing/space'
import type { SwitchTarget } from '@/lib/view-switch'
import {
  punchChip, punchRow, QUICK_TITLE_MIN, QUICK_TYPES, quickStage, subCards, todayCount, turnCount, unreadChats, weeklyRule, type MktAppData,
} from '@/lib/mkt-app/model'
import { BackStep, useToast } from './kit'
import TasksTab from './screens/TasksTab'
import ProjectsTab from './screens/ProjectsTab'
import SpaceTab from './screens/SpaceTab'
import MoreTab, { type MoreRow, type MoreTile } from './screens/MoreTab'
import TaskScreen, { type TaskActions } from './screens/TaskScreen'
import CalendarScreen from './screens/CalendarScreen'
import ChatScreen from './screens/ChatScreen'
import NoticesScreen from './screens/NoticesScreen'
import StubScreen from './screens/StubScreen'
import ClaimScreen, { type ClaimActions } from './screens/ClaimScreen'
import { NewSheet, PasswordSheet, PickSheet, QuickSheet, ReasonSheet, SignOutSheet, ViewsSheet, type QuickForm } from './sheets'
import s from './mkt-app.module.css'

// The Marketing app (2026-11-28 — the Claude Design handoff "Marketing View 电话版设计", `Marketing App iOS +
// Android.dc.html`; .claude/rules/marketing/marketing-app.md): Marketing's view on a phone. Five tabs — Tasks ·
// Projects · ＋ · Space · More — screens pushed over them from the right (Task, Calendar, Chat, Notifications, Claim),
// sheets rising from the bottom (New, a Quick / Recurring task, Request changes, the handoff's pick, Change view …), a
// toast. My profile and the punch are Me's (components/me — the HR app's and the Finance app's). Every read is the
// portal's own under the viewer's session; every write the module's own Server Action. The app keeps only where you
// are and what you are typing.

export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

export interface MktAppActions extends TaskActions {
  refresh: () => void
  createTask: (input: NewTaskInput) => Promise<Done<{ id: string; track: string; open: string }>>
  saveSpace: (patch: { status?: string; room?: Space['room'] }) => Promise<Done<{ space: Space }>>
  care: (what: 'feed' | 'workout') => Promise<Done<{ pet: PetStats }>>
  send: (to: string, body: string | null, project: string | null) => Promise<Done<{ message: ChatMessage }>>
  read: (to: string, last: number) => Promise<Done>
  noticesRead: (ids?: string[] | null) => Promise<Done>
  switchView: (view: SwitchTarget) => void
  changePassword: ChangePassword
  signOut: () => Promise<void>
  claims: ClaimActions
}

type Tab = 'tasks' | 'projects' | 'space' | 'more'
type Screen =
  | { k: 'task'; key: string }
  | { k: 'calendar' }
  | { k: 'chat'; with: string | null }
  | { k: 'notices' }
  | { k: 'claim'; open?: string | null }
  | { k: 'stub'; emoji: string; label: string }
type SheetState =
  | { k: 'new' }
  | { k: 'quick' }
  | { k: 'reason'; title: string; to: string; send: (reason: string) => Promise<string | null> }
  | { k: 'pick'; stage: string; people: { id: string; name: string; role: string }[]; pick: (id: string) => void }
  | { k: 'views' }
  | { k: 'password' }
  | { k: 'signout' }

const MANAGER_TOOLS: ReadonlyArray<{ key: string; emoji: string; label: string; sub: string; tone: MoreRow['tone'] }> = [
  { key: 'tracking', emoji: '📊', label: 'Tracking Dashboard', sub: 'Who is late, who is free', tone: 'sand' },
  { key: 'workflow', emoji: '🧩', label: 'Workflow Builder', sub: 'Stages and approvers', tone: 'mist' },
  { key: 'product', emoji: '📦', label: 'Product Builder', sub: 'Products, prices, versions', tone: 'peach' },
  { key: 'minutes', emoji: '📝', label: 'Minutes Builder', sub: 'Meeting minutes templates', tone: 'cream' },
  { key: 'replace', emoji: '🔁', label: 'Replace Person', sub: 'Hand over somebody’s stages', tone: 'mist' },
  { key: 'billing', emoji: '💰', label: 'Billing', sub: 'This month’s lines for Finance', tone: 'peach' },
  { key: 'pool', emoji: '🏦', label: 'Pool', sub: 'Marketing P and L, cash flow', tone: 'sand' },
]

/** A token's colour as the phone's status bar takes it (`#f3f3f1`), read off the app's own stylesheet. */
function tokenHex(el: HTMLElement | null, token: string): string | null {
  if (!el) return null
  const raw = getComputedStyle(el).getPropertyValue(token).trim()
  const m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(raw)
  if (!m) return null
  return `#${[m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')}`
}

export default function MktApp({ data: d, actions, platform }: { data: MktAppData; actions: MktAppActions; platform: 'ios' | 'android' }) {
  const [tab, setTab] = useState<Tab>('tasks')
  const [stack, setStack] = useState<Screen[]>([])
  const [last, setLast] = useState<Screen | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [lastSheet, setLastSheet] = useState<SheetState | null>(null)
  const [sheetKey, setSheetKey] = useState(0)
  const [visit, setVisit] = useState<string | null>(null)
  const [path, setPath] = useState<DrivePath>({ sub: null, project: null })
  const [scope, setScope] = useState<ProjectScope>('open')
  const [q, setQ] = useState('')
  const [chat, setChat] = useState<ChatList>(d.chat)
  const [notices, setNotices] = useState<MktNotice[]>(d.notices)
  const [quick, setQuick] = useState<QuickForm>({ kind: 'quick', sub: d.subs[0]?.code ?? '', title: '', type: 'social' })
  const [quickBad, setQuickBad] = useState(false)
  const [creating, setCreating] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [meOpen, setMeOpen] = useState(false)
  const [meStart, setMeStart] = useState<string | null>(null)
  const [mePunch, setMePunch] = useState<'in' | 'out' | null>(null)
  const { toast, say } = useToast()
  const root = useRef<HTMLDivElement>(null)

  // Fresh reads after a write (router.refresh): the lists follow; where the person is stays.
  useEffect(() => { setChat(d.chat) }, [d.chat])
  useEffect(() => { setNotices(d.notices) }, [d.notices])

  // Me (components/me): a login of their own with a People record — the punch, My profile.
  const mine = d.personalLogin && !d.viewingAs
  const me = useMe(mine)
  const nowSec = useClock(me.s.today?.now, me.s.todayAt)
  const card = mine ? todayCard(me.s.today, nowSec, officeToday()) : null

  const top = stack.length ? stack[stack.length - 1] : null
  const shown = top ?? last
  const sheetShown = sheet ?? lastSheet

  // ── Moving about ──
  // Each layer open — a tab other than Tasks, a visit, each pushed screen, a sheet, Me — holds one history step, stacked
  // in the order they opened (the BackSteps below), so the phone's Back closes the top one. A step closed on screen is
  // taken back a moment later (useBackStep), and that Back takes whatever step is on top by then: one layer closing as
  // another opens, or two closing at once, would take the wrong step, or ask the browser for two Backs in one moment. So
  // the layers nest — none hangs on another's being shut — and a sheet that hands over to something else closes first.
  const push = useCallback((scr: Screen) => {
    setStack(st => [...st, scr])
    setLast(scr)
    setSheet(null)
  }, [])
  const pop = useCallback(() => setStack(st => st.slice(0, -1)), [])
  const openSheet = (sh: SheetState) => {
    setSheet(sh)
    setLastSheet(sh)
    setSheetKey(k => k + 1)
  }
  const closeSheet = () => setSheet(null)
  const sheetOpen = useRef(false)
  useEffect(() => { sheetOpen.current = !!sheet }, [sheet])
  /** `then` once the step going now has been taken back (its popstate) — or after 400 ms when none comes. */
  const landed = (then: () => void) => {
    let done = false
    const land = () => {
      if (done) return
      done = true
      window.removeEventListener('popstate', land)
      clearTimeout(t)
      then()
    }
    window.addEventListener('popstate', land)
    const t = setTimeout(land, 400)
  }
  /** The sheet closed, and `then` once its step is gone: a sheet's button that goes on somewhere (a screen, a tab, a view). */
  const closeSheetThen = (then: () => void) => {
    if (!sheetOpen.current) return then()
    landed(then)
    setSheet(null)
  }
  const goTab = (t: Tab) => {
    // Out of a visit straight to Tasks: the visit's step first, then the tab's.
    if (t === 'tasks' && tab !== 'tasks' && visit) {
      landed(() => setTab('tasks'))
      setVisit(null)
      return
    }
    setTab(t)
    setVisit(null)
  }
  const openTask = (key: string) => push({ k: 'task', key })

  // A tapped push (lib/push/notices.ts › pushUrl → the start → `?open=task:` / `claim:`), or one's own request decided
  // (`?open=me:`): opened once, then the address forgets it.
  useEffect(() => {
    const t = openTarget(new URLSearchParams(window.location.search).get('open'))
    if (!t) return
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (t.k === 'task') openTask(t.id)
    else if (t.k === 'claim' && d.parts.claims) push({ k: 'claim', open: t.id })
    else if (t.k === 'me' && mine) {
      setMeStart(t.id)
      setMeOpen(true)
    }
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── The punch: Me, straight on its camera (the punch a phone makes — the fence, the photo, a reason) ──
  const punch = () => {
    if (!mine) return
    setMeStart(null)
    setMePunch(card?.punch ?? null)
    setMeOpen(true)
  }
  const openProfile = () => {
    setMeStart(null)
    setMePunch(null)
    setMeOpen(true)
  }

  // ── Notices ──
  const unreadNotices = notices.filter(n => !n.read).length
  const openNotice = (n: MktNotice) => {
    if (!n.read) {
      setNotices(cur => cur.map(x => (x.id === n.id ? { ...x, read: true } : x)))
      void actions.noticesRead([n.id])
    }
    if (n.refKind === 'mkt_project' && n.ref) openTask(n.ref)
    else if (n.refKind === 'payment_request' && n.ref && d.parts.claims) push({ k: 'claim', open: n.ref })
    else if (n.refKind === 'mkt_quote') push({ k: 'stub', emoji: '📦', label: 'Product Builder' })
  }

  // ── New: a Quick or Recurring task (New Project's own write) ──
  const canNew = d.may.create && !!d.me.staff && d.subs.length > 0
  const quickSub = d.subs.find(x => x.code === quick.sub) ?? d.subs[0] ?? null
  const createQuick = () => {
    const title = quick.title.trim()
    if (title.length < QUICK_TITLE_MIN) return setQuickBad(true)
    if (!quickSub || !d.me.staff || creating) return
    const type = QUICK_TYPES.find(t => t.key === quick.type) ?? QUICK_TYPES[1]
    setCreating(true)
    void actions.createTask({
      sub: quickSub.id,
      kind: quick.kind,
      title,
      type: type.key,
      brief: '',
      stages: [quickStage(d.me.staff, type.label)],
      recur: quick.kind === 'recurring' ? weeklyRule(d.today) : null,
    }).then(r => {
      setCreating(false)
      if (!r.ok) return say(r.reason)
      setQuick(f => ({ ...f, title: '' }))
      closeSheetThen(() => goTab('tasks'))
      say(`${quick.kind === 'recurring' ? 'Recurring' : 'Quick'} task created · ${r.track}`)
      actions.refresh()
    })
  }

  // ── After a step on a task: back to the list, read again (the Request changes sheet, when it was asked, first) ──
  const afterStep = () => closeSheetThen(() => {
    pop()
    actions.refresh()
  })

  // ── The bars ──
  const tabsRef = useRef<HTMLElement>(null)
  const atRoot = !top
  const tucked = useTuckOnScroll(tabsRef, atRoot && !sheet && !meOpen, `${tab}:${visit ?? ''}:${path.sub ?? ''}:${path.project ?? ''}`)
  const turn = turnCount(d.columns)
  const chats = unreadChats(chat)
  const tabs: { key: Tab | 'plus'; emoji: string; label: string; badge: number }[] = [
    { key: 'tasks', emoji: '👉', label: 'Tasks', badge: turn },
    ...(d.parts.projects ? [{ key: 'projects' as const, emoji: '📁', label: 'Projects', badge: 0 }] : []),
    ...(canNew ? [{ key: 'plus' as const, emoji: '+', label: 'New', badge: 0 }] : []),
    { key: 'space', emoji: '🏠', label: 'Space', badge: chats },
    { key: 'more', emoji: '☰', label: 'More', badge: 0 },
  ]

  // ── The phone's status bar: the colour at the top of the screen (pwa.md) ──
  const [barColor, setBarColor] = useState<string | null>(null)
  useEffect(() => {
    const el = root.current
    const token = top ? '--mk-white' : visit && tab === 'space' ? '--mk-ink' : tab === 'space' ? '--mk-surface-2' : tab === 'projects' ? '--mk-white' : '--mk-app'
    setBarColor(tokenHex(el, token))
  }, [top, tab, visit])
  useStatusBar(barColor, !meOpen)

  // ── Back on the phone (Android's ◁): Me, else a sheet, else the pushed screen, else a visit (SpaceTab's), else Tasks ──
  const backSteps = (
    <>
      {tab !== 'tasks' ? <BackStep k="mkt-app-tab" onBack={() => setTab('tasks')} /> : null}
      {stack.map((_, i) => <BackStep key={`push-${i}`} k={`mkt-app-push-${i}`} onBack={pop} />)}
      {sheet ? <BackStep k="mkt-app-sheet" onBack={closeSheet} /> : null}
      {meOpen ? <BackStep k="mkt-app-me" onBack={() => setMeOpen(false)} /> : null}
    </>
  )

  // ── More ──
  const claimsCount = d.claims
    ? d.parts.claimsApprove && d.claims.approval
      ? d.claims.approval.requests.filter(r => r.status === 'pending_approval' && !r.mine).length
      : d.claims.mine.filter(r => r.status === 'rejected').length
    : 0
  const tiles: MoreTile[] = [
    ...(d.parts.calendar ? [{ key: 'calendar', emoji: '📅', label: 'Calendar', sub: `${todayCount(d.today, d.events)} today`, tone: 'mist' as const, count: 0, go: () => push({ k: 'calendar' }) }] : []),
    ...(d.parts.claims ? [{
      key: 'claim', emoji: '🧾', label: d.parts.claimsApprove ? 'Claim & approve' : 'Claim',
      sub: d.parts.claimsApprove ? 'Waiting for you' : 'Claims and direct payments', tone: 'cream' as const, count: claimsCount,
      go: () => push({ k: 'claim' }),
    }] : []),
    ...(d.parts.library ? [{ key: 'library', emoji: '📚', label: 'Library', sub: 'Brand files and footage', tone: 'mist' as const, count: 0, go: () => push({ k: 'stub', emoji: '📚', label: 'Library' }) }] : []),
    ...(d.parts.rooms ? [{ key: 'rooms', emoji: '🚪', label: 'Meeting Rooms', sub: 'Book a room', tone: 'peach' as const, count: 0, go: () => push({ k: 'stub', emoji: '🚪', label: 'Meeting Rooms' }) }] : []),
  ]
  const manager: MoreRow[] | null = d.parts.manager
    ? MANAGER_TOOLS.map(t => ({ ...t, count: t.key === 'tracking' ? d.counts.tracking : 0, go: () => push({ k: 'stub', emoji: t.emoji, label: t.label }) }))
    : null
  const foot: MoreRow[] = [
    { key: 'look', emoji: '⚙️', label: 'Appearance', value: 'Font size, density', go: () => push({ k: 'stub', emoji: '⚙️', label: 'Appearance' }) },
    ...(d.views ? [{ key: 'view', emoji: '🔀', label: 'Change view', value: 'Marketing', go: () => openSheet({ k: 'views' }) }] : []),
    ...(d.personalLogin && !d.viewingAs ? [{ key: 'password', emoji: '🔑', label: 'Change password', go: () => openSheet({ k: 'password' }) }] : []),
    { key: 'signout', emoji: '↩︎', label: 'Sign out', danger: true, go: () => openSheet({ k: 'signout' }) },
  ]
  const avatar = d.space.avatarPath ? fileRoute('marketing', d.space.avatarPath) : null
  const subs = useMemo(() => subCards(d.subs, d.rows), [d.subs, d.rows])

  const style = { '--tab-n': tabs.length, '--toast-at': top ? 'calc(100px + var(--safe-bottom))' : 'calc(80px + var(--safe-bottom))' } as CSSProperties

  return (
    <div ref={root} className={`mkt-shell ${s.app}`} data-mkt-app="" data-platform={platform} style={style}>
      {d.viewingAs ? <ViewingAsBanner name={d.viewingAs} /> : <PortalPushAsk />}
      {backSteps}

      {tab === 'tasks' ? (
        <TasksTab columns={d.columns} week={d.week} punch={punchChip(card)} unread={unreadNotices} onPunch={punch}
          onNotices={() => push({ k: 'notices' })} onOpen={openTask} onCalendar={d.parts.calendar ? () => push({ k: 'calendar' }) : null} />
      ) : null}
      {tab === 'projects' && d.parts.projects ? (
        <ProjectsTab rows={d.rows} subs={d.subs} path={path} scope={scope} q={q} onPath={setPath} onScope={setScope} onQ={setQ} onOpen={openTask} />
      ) : null}
      {tab === 'space' ? (
        <SpaceTab me={d.me} space={d.space} pet={d.pet} hasPet={d.hasPet} plate={d.plate} lobby={d.lobby} chat={chat}
          canEdit={d.may.space} canChat={d.may.space && !!chat.me} visit={visit} onVisit={setVisit}
          onChat={w => push({ k: 'chat', with: w })} say={say}
          actions={{
            saveSpace: actions.saveSpace,
            care: actions.care,
            wave: async staff => {
              const r = await actions.send(staff, '👋', null)
              return r.ok ? { ok: true } : r
            },
          }} />
      ) : null}
      {tab === 'more' ? (
        <MoreTab me={d.me} avatar={avatar} punch={mine ? punchRow(card) : null} onProfile={mine ? openProfile : null} onPunch={punch}
          tiles={tiles} subs={subs} onSub={d.parts.projects ? code => { setPath({ sub: code, project: null }); setQ(''); setScope('open'); goTab('projects') } : null}
          manager={manager} foot={foot} />
      ) : null}

      <nav ref={tabsRef} className={`${s.tabs} ${tuck.tuckable}`} data-tucked={tucked ? '' : undefined} inert={tucked || undefined} aria-label="Marketing">
        {tabs.map(t => t.key === 'plus' ? (
          <button key="plus" type="button" className={s.tab} onClick={() => openSheet({ k: 'new' })} aria-label="New">
            <span className={`${s.tabIcon} ${s.tabPlus}`}>+</span>
            <span className={s.tabLabel}>New</span>
          </button>
        ) : (
          <button key={t.key} type="button" className={s.tab} aria-current={tab === t.key ? 'page' : undefined} onClick={() => goTab(t.key as Tab)}>
            <span className={s.tabIcon}>
              {t.emoji}
              {t.badge ? <span className={s.tabBadge}>{t.badge > 99 ? '99+' : t.badge}</span> : null}
            </span>
            <span className={s.tabLabel}>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className={s.push} data-open={top ? 'true' : 'false'} role={top ? 'dialog' : undefined} aria-hidden={top ? undefined : true} inert={top ? undefined : true}>
        {shown?.k === 'task' ? (
          <TaskScreen key={`${stack.length}:${shown.key}`} taskKey={shown.key} may={d.may} actions={actions} say={say} onDone={afterStep} onBack={pop}
            askReason={(to, send) => openSheet({ k: 'reason', title: 'Request changes', to, send: async r => { const no = await send(r); if (!no) setSheet(null); return no } })}
            askPick={(stage, people, pick) => openSheet({ k: 'pick', stage, people, pick: id => closeSheetThen(() => pick(id)) })} />
        ) : null}
        {shown?.k === 'calendar' ? <CalendarScreen today={d.today} events={d.events} me={d.me.staff} onOpen={openTask} onBack={pop} say={say} /> : null}
        {shown?.k === 'chat' ? (
          <ChatScreen key={`${stack.length}`} list={chat} tasks={d.chatTasks} canSpeak={d.may.space} with={shown.with}
            onWith={w => setStack(st => st.map((x, i) => (i === st.length - 1 && x.k === 'chat' ? { ...x, with: w } : x)))}
            onOpenTask={openTask} onBack={pop} onList={setChat} say={say} actions={{ send: actions.send, read: actions.read }} />
        ) : null}
        {shown?.k === 'notices' ? <NoticesScreen notices={notices} onOpen={openNotice} onBack={pop} /> : null}
        {shown?.k === 'claim' && d.claims ? (
          <ClaimScreen key={`${stack.length}`} claims={d.claims} approver={d.parts.claimsApprove} meName={d.me.full} open={shown.open ?? null}
            actions={actions.claims} say={say} onBack={pop} refresh={actions.refresh}
            askReason={(to, send) => openSheet({ k: 'reason', title: 'Send back', to, send: async r => { const no = await send(r); if (!no) setSheet(null); return no } })} />
        ) : null}
        {shown?.k === 'stub' ? <StubScreen emoji={shown.emoji} label={shown.label} onBack={pop} /> : null}
      </div>

      <div className={s.scrim} data-open={sheet ? 'true' : 'false'} onClick={closeSheet} aria-hidden="true" />
      <div className={s.sheet} data-open={sheet ? 'true' : 'false'} role="dialog" aria-modal="true" aria-hidden={sheet ? undefined : true} inert={sheet ? undefined : true}>
        <div className={s.grab} />
        {sheetShown?.k === 'new' ? (
          <NewSheet subs={d.subs} sub={quick.sub} onSub={code => setQuick(f => ({ ...f, sub: code }))} manager={d.may.manage}
            onKind={k => {
              if (k === 'product') return closeSheetThen(() => push({ k: 'stub', emoji: '📦', label: 'New product project' }))
              setQuick(f => ({ ...f, kind: k }))
              setQuickBad(false)
              openSheet({ k: 'quick' })
            }} />
        ) : null}
        {sheetShown?.k === 'quick' ? (
          <QuickSheet form={quick} subName={quickSub?.name ?? ''} today={d.today} bad={quickBad} busy={creating}
            onForm={patch => { setQuick(f => ({ ...f, ...patch })); setQuickBad(false) }} onBack={() => openSheet({ k: 'new' })} onCreate={createQuick} />
        ) : null}
        {sheetShown?.k === 'reason' ? <ReasonSheet key={sheetKey} title={sheetShown.title} to={sheetShown.to} onSend={sheetShown.send} /> : null}
        {sheetShown?.k === 'pick' ? <PickSheet stage={sheetShown.stage} people={sheetShown.people} onPick={sheetShown.pick} /> : null}
        {sheetShown?.k === 'views' && d.views ? <ViewsSheet current={d.views.current} onPick={v => closeSheetThen(() => actions.switchView(v))} /> : null}
        {sheetShown?.k === 'password' ? <PasswordSheet key={sheetKey} change={actions.changePassword} onDone={closeSheet} /> : null}
        {sheetShown?.k === 'signout' ? (
          <SignOutSheet busy={signingOut} onCancel={closeSheet} onSignOut={() => { setSigningOut(true); void actions.signOut() }} />
        ) : null}
      </div>

      <div className={s.toast} data-on={toast.on ? 'true' : 'false'} role="status" aria-live="polite">{toast.text}</div>

      {mine ? (
        <MeOverlay me={me} open={meOpen} onClose={() => setMeOpen(false)} backLabel="More" startPunch={meOpen ? mePunch : null} startRequest={meOpen ? meStart : null} />
      ) : null}
    </div>
  )
}
