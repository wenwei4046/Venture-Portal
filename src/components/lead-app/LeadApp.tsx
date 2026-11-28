'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { copyText } from '@/lib/leads/clipboard'
import { insertAt } from '@/lib/leads/emoji'
import { handoffText } from '@/lib/leads/handoff'
import { phoneStage } from '@/lib/leads/inbox'
import { FILE_LIMIT, TOO_BIG } from '@/lib/leads/messenger'
import type { LeadOutlet } from '@/lib/leads/outlets'
import { stageOf, type LeadStage } from '@/lib/leads/stage'
import type { LeadCardFields, LeadConfig, LeadContact, LeadLabel, LeadThread } from '@/lib/leads/types'
import { createClient } from '@/lib/supabase/client'
import type { SwitchTarget } from '@/lib/view-switch'
import { figtree } from '@/components/layout/lead-fonts'
import { setViewAs } from '@/components/layout/view-as-actions'
import ViewAsPersonPicker from '@/components/layout/ViewAsPersonPicker'
import ViewingAsBanner from '@/components/layout/ViewingAsBanner'
import { useBackStep } from '@/components/member/app/useBackStep'
import { cancelVoice, startVoice, stopVoice } from '@/components/member/crm/shared/voice'
import { useStatusBar } from '@/components/pwa/status-bar'
import BrandSheet from './BrandSheet'
import ChatScreen, { type MenuItem } from './ChatScreen'
import CustomerSheet from './CustomerSheet'
import EmojiSheet from './EmojiSheet'
import InboxScreen from './InboxScreen'
import LeadsScreen from './LeadsScreen'
import ProfileScreen from './ProfileScreen'
import SignOutSheet from './SignOutSheet'
import SwitchViewSheet from './SwitchViewSheet'
import TabBar, { type TabItem } from './TabBar'
import { LIVE_ACTIONS, type LeadAppActions } from './live-actions'
import { Scrim, Toast, lv } from './parts'
import {
  brandPills, byLastUpdate, chatSub, inboxBadge, inboxChips, initials, leadRowOf, matchesLead, matchesQuery, passes, rowOf, salesGroup, stageChips,
  stripOf, wallOf, type InboxFilter, type PendingMessage, type SeenState, type Tab,
} from './vm'
import s from './lead-app.module.css'

/** Read again every 15 s while in view (the desktop Inbox's fallback), and 300 ms after the last ping of a burst. */
const LIST_REFRESH_MS = 15_000
const LIVE_SETTLE_MS = 300
/** Shorter than this, the mic was tapped, not held. */
const HOLD_MS = 600
const TOAST_MS = 2400
const TOAST_LONG_MS = 5000

type SheetKind = 'info' | 'brands' | 'emoji' | 'switch' | 'signout'

export interface LeadAppProps {
  config: LeadConfig
  contacts: LeadContact[]
  /** The chat `?c=` named, read with the page. */
  initialThread: LeadThread | null
  initialTab: Tab
  /** The chats this person marked unread to answer later. */
  marked: string[]
  labels: LeadLabel[]
  outlets: LeadOutlet[]
  /** Lead View · Create / Edit, as the Inbox's own boxes leave them. */
  canReply: boolean
  canEdit: boolean
  /** Which tabs open — each as its desktop page would. */
  open: { inbox: boolean; leads: boolean }
  /** Who is signed in: the hand-over's text names them. */
  csName: string
  me: { name: string; sub: string }
  /** The house goes back to where the app was opened from; not for an account whose phone opens here. */
  home: boolean
  canSwitch: boolean
  /** Viewing the portal as this person (read-only). */
  viewingAs: string | null
  /** The server's clock when the page was drawn (the rows' times start from it). */
  now: string
  /** Why the Inbox could not be read, in words. */
  problem: string | null
  /** What it reads and writes (the desktop Inbox's own); the preview and the tests hand in theirs. */
  actions?: LeadAppActions
  /** The preview's clock stands still at `now` (its sample's waits stay the handoff's). */
  stillClock?: boolean
}

/**
 * Lead View on a phone (2026-11-28 — the Claude Design handoff `docs/design_handoff_lead_view_phone`, LeadPhone.dc.html):
 * the Revenue CRM's phone frame in Lead View's colours. One screen: the tab on show (Inbox · Leads · Profile), the chat
 * sliding in from the right over it, the sheets rising from the bottom, the toast. Every read is Lead View's own (the
 * desktop Inbox's), every write the desktop's own Server Action — gated on `/leads`, so a box unticked there closes it
 * here too.
 */
export default function LeadApp(p: LeadAppProps) {
  const router = useRouter()
  const act = p.actions ?? LIVE_ACTIONS
  const brands = useMemo(() => new Map(p.config.brands.map(b => [b.id, b])), [p.config.brands])
  const brandName = useCallback((id: string) => brands.get(id)?.name ?? '', [brands])
  const firstTab: Tab = p.open.inbox ? 'inbox' : p.open.leads ? 'leads' : 'profile'
  const [tab, setTab] = useState<Tab>(() => (p.initialTab === 'leads' && p.open.leads) || (p.initialTab === 'profile') ? p.initialTab : firstTab)
  const [now, setNow] = useState(() => new Date(p.now))
  const still = !!p.stillClock
  useEffect(() => {
    if (still) return
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [still])

  // ── The toast ──
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flash = useCallback((text: string, long = false) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), long ? TOAST_LONG_MS : TOAST_MS)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ── What this screen knows on top of the list ──
  const [threads, setThreads] = useState<Record<string, LeadThread>>(() => (p.initialThread ? { [p.initialThread.contact.id]: p.initialThread } : {}))
  const [readAt, setReadAt] = useState<Record<string, string>>({})
  const [marks, setMarks] = useState<Set<string>>(() => new Set(p.marked))
  const markedKey = p.marked.join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- markedKey stands for marked
  useEffect(() => { setMarks(new Set(p.marked)) }, [markedKey])
  const seen: SeenState = useMemo(() => ({ readAt, marks }), [readAt, marks])
  // A chat's own copy (read with it) knows its newest outlet, labels and block (the desktop Inbox's rule); the rest is
  // the list's, read again after every write.
  const live = useCallback((c: LeadContact): LeadContact => {
    const t = threads[c.id]?.contact
    return t ? { ...c, outletId: t.outletId, outletBy: t.outletBy, labels: t.labels, blockedAt: t.blockedAt } : c
  }, [threads])
  const contacts = useMemo(() => p.contacts.map(live), [p.contacts, live])

  // ── The chat ──
  const [chatId, setChatId] = useState<string | null>(p.initialThread?.contact.id ?? null)
  // What the layer shows while it slides out.
  const [lastChat, setLastChat] = useState<string | null>(chatId)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, PendingMessage[]>>({})
  const [links, setLinks] = useState<Record<string, string>>({})
  const [busy, startBusy] = useTransition()
  const listRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const readNow = useCallback(async (id: string): Promise<boolean> => {
    const r = await act.readThread(id)
    if (!r.ok) { flash(r.reason, true); return false }
    if (r.data) {
      const t = r.data
      setThreads(m => ({ ...m, [id]: t }))
      setReadAt(m => ({ ...m, [id]: t.contact.lastAt }))
      setMarks(m => { if (!m.has(id)) return m; const n = new Set(m); n.delete(id); return n })
    }
    return true
  }, [flash, act])
  const reload = useCallback((id: string) => { startBusy(async () => { await readNow(id) }) }, [readNow])

  const openChat = (id: string) => {
    if (!p.open.inbox) { flash('Chats open in the Inbox, which is not open to you'); return }
    setChatId(id)
    setLastChat(id)
    setMenu(false)
    reload(id)
  }
  const closeChat = useCallback(() => {
    setChatId(null)
    setMenu(false)
    setSheet(k => (k === 'info' || k === 'emoji' ? null : k))
  }, [])
  // The phone's Back closes what is on top: a sheet, then the chat.
  useBackStep('lead-chat', closeChat, chatId !== null)
  const closeSheet = useCallback(() => setSheet(null), [])
  useBackStep('lead-sheet', closeSheet, sheet !== null)

  // The list stays live (the desktop Inbox's: the private channel `leads:inbox`, every 15 s, and on coming back).
  useEffect(() => {
    const fresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    const timer = window.setInterval(fresh, LIST_REFRESH_MS)
    document.addEventListener('visibilitychange', fresh)
    let soon: ReturnType<typeof setTimeout> | undefined
    const ping = () => { clearTimeout(soon); soon = setTimeout(fresh, LIVE_SETTLE_MS) }
    const db = createClient()
    let channel: RealtimeChannel | null = null
    let gone = false
    void db.realtime.setAuth().catch(() => undefined).then(() => {
      if (gone) return
      channel = db.channel('leads:inbox', { config: { private: true } }).on('broadcast', { event: 'message' }, ping).subscribe()
    })
    return () => {
      gone = true
      clearTimeout(soon)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', fresh)
      if (channel) void db.removeChannel(channel)
    }
  }, [router])
  // The open chat follows the list: a new message there reads it again.
  const openLastAt = p.contacts.find(c => c.id === chatId)?.lastAt
  const seenLast = useRef(openLastAt)
  useEffect(() => {
    if (chatId && openLastAt && seenLast.current !== openLastAt) reload(chatId)
    seenLast.current = openLastAt
  }, [openLastAt, chatId, reload])

  const shownId = chatId ?? lastChat
  const thread = shownId ? threads[shownId] ?? null : null
  const chatContact = shownId ? thread?.contact ?? contacts.find(c => c.id === shownId) ?? null : null
  const chatBrand = chatContact ? brandName(chatContact.brandId) : ''
  const wall = useMemo(() => (shownId && thread ? wallOf(thread.messages, thread.contact, now, pending[shownId] ?? []) : []),
    [shownId, thread, now, pending])
  // Files Customer Service sent are ours (lead-media): a signed link each, asked once.
  useEffect(() => {
    const missing = [...new Set((thread?.messages ?? []).map(m => m.mediaPath).filter((x): x is string => !!x && !links[x]))]
    if (!missing.length) return
    void act.leadMediaLinks(missing).then(r => { if (r.ok) setLinks(l => ({ ...l, ...r.data })) })
  }, [thread, links, act])
  // A new bubble, or the chat opened: the wall to its foot.
  const wallCount = wall.length
  useLayoutEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [wallCount, shownId])

  // ── Writes ──
  const draft = shownId ? drafts[shownId] ?? '' : ''
  const setDraft = (text: string) => { if (shownId) setDrafts(d => ({ ...d, [shownId]: text })) }
  const send = () => {
    const id = chatId
    if (!id) return
    const text = draft.trim()
    if (!text) { flash('Hold to record a voice note'); return }
    const mine: PendingMessage = { id: -Date.now(), body: text, at: new Date().toISOString() }
    setPending(m => ({ ...m, [id]: [...(m[id] ?? []), mine] }))
    setDrafts(d => ({ ...d, [id]: '' }))
    startBusy(async () => {
      const r = await act.replyToLead(id, text)
      if (!r.ok) {
        flash(r.reason, true)
        setDrafts(d => ({ ...d, [id]: d[id] ? d[id] : text }))
      } else if (r.data.notSent) flash('Saved but not sent: ' + r.data.notSent, true)
      await readNow(id)
      setPending(m => ({ ...m, [id]: (m[id] ?? []).filter(x => x.id !== mine.id) }))
      router.refresh()
    })
  }
  const sendMedia = (file: File, caption: string) => {
    const id = chatId
    if (!id) return
    if (file.size > FILE_LIMIT) { flash(TOO_BIG, true); return }
    const kind = file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'voice note' : 'file'
    const mine: PendingMessage = { id: -Date.now(), body: `Sending ${kind}…`, at: new Date().toISOString() }
    setPending(m => ({ ...m, [id]: [...(m[id] ?? []), mine] }))
    if (caption) setDrafts(d => ({ ...d, [id]: '' }))
    startBusy(async () => {
      const name = file.name.replace(/[\\/]/g, '_').slice(-120) || 'file'
      const path = `chat/${id}/${crypto.randomUUID()}-${name}`
      const mime = file.type || 'application/octet-stream'
      const refused = await act.upload(path, file, mime)
      if (refused) flash(refused, true)
      else {
        const r = await act.sendLeadMedia(id, path, mime, caption)
        if (!r.ok) flash(r.reason, true)
        else if (r.data.notSent) flash('Saved but not sent: ' + r.data.notSent, true)
        await readNow(id)
        router.refresh()
      }
      setPending(m => ({ ...m, [id]: (m[id] ?? []).filter(x => x.id !== mine.id) }))
    })
  }
  const pickFile = (file: File) => sendMedia(file, draft.trim())

  // The mic: held, it records; released, the note goes; slid off or tapped, nothing is sent.
  const [rec, setRec] = useState<number | null>(null)
  const holding = useRef(false)
  const recOn = useRef(false)
  const pressedAt = useRef(0)
  const micDown = () => {
    holding.current = true
    pressedAt.current = Date.now()
    void startVoice().then(why => {
      if (why) { holding.current = false; flash(why, true); return }
      if (!holding.current) { cancelVoice(); return }
      recOn.current = true
      setRec(Date.now())
    })
  }
  const micEnd = (sendIt: boolean) => {
    if (!holding.current) return
    holding.current = false
    const held = Date.now() - pressedAt.current
    const started = recOn.current
    recOn.current = false
    setRec(null)
    if (!started) { if (sendIt) flash('Hold to record a voice note'); return }
    if (!sendIt || held < HOLD_MS) { cancelVoice(); if (sendIt) flash('Hold to record a voice note'); return }
    void stopVoice().then(file => { if (file) sendMedia(file, '') })
  }
  useEffect(() => () => { if (recOn.current) cancelVoice() }, [])

  const pickEmoji = (emoji: string) => {
    const ta = boxRef.current
    const start = ta?.selectionStart ?? draft.length
    const end = ta?.selectionEnd ?? start
    const r = insertAt(draft, start, end, emoji)
    setDraft(r.text)
    requestAnimationFrame(() => { const el = boxRef.current; if (el) el.setSelectionRange(r.caret, r.caret) })
  }

  const saveCard = (c: LeadContact, fields: LeadCardFields, done: string) => {
    startBusy(async () => {
      const r = await act.saveLeadCard(c.id, fields)
      if (!r.ok) { flash(r.reason, true); return }
      flash(done)
      await readNow(c.id)
      router.refresh()
    })
  }
  const confirmPhone = (c: LeadContact) => saveCard(c, { phone: c.phone ?? '' }, 'Number confirmed')
  const notPhone = (c: LeadContact) => saveCard(c, { phone: '' }, 'Removed — not a phone')
  const saveInfo = async (c: LeadContact, fields: LeadCardFields): Promise<string | null> => {
    const r = await act.saveLeadCard(c.id, fields)
    if (!r.ok) return r.reason
    flash('Saved')
    await readNow(c.id)
    router.refresh()
    return null
  }
  const pickOutlet = (c: LeadContact, choice: string) => {
    startBusy(async () => {
      const r = await act.setContactOutlet(c.id, choice)
      if (!r.ok) { flash(r.reason, true); return }
      await readNow(c.id)
      router.refresh()
    })
  }
  const copyDetails = (c: LeadContact) => {
    void copyText(handoffText(c, brandName(c.brandId), null, p.csName)).then(ok => flash(ok ? 'Copied — paste it to the sales group' : 'Could not copy — try again'))
  }
  // Hand over: the message to the brand's sales group, copied and opened in WhatsApp in the tap, then recorded.
  const handOver = (c: LeadContact) => {
    if (c.handedAt) return
    const brand = brandName(c.brandId)
    const stage = phoneStage(c)
    if (stage === 'detected') { flash('Confirm the number first'); return }
    if (stage !== 'confirmed') {
      void copyText(handoffText(c, brand, null, p.csName)).then(ok => flash(ok ? 'No phone yet — details copied for the sales group' : 'Could not copy — try again'))
      return
    }
    if (!p.canEdit) { flash('View only — you can’t hand over'); return }
    const text = handoffText(c, brand, null, p.csName)
    void copyText(text)
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    setSheet(null)
    setMenu(false)
    startBusy(async () => {
      const r = await act.handLeadToGroup(c.id)
      if (!r.ok) { flash(r.reason, true); return }
      flash(`Handed to ${brand} sales · WhatsApp opened`)
      await readNow(c.id)
      router.refresh()
    })
  }
  const markLater = (c: LeadContact) => {
    setMenu(false)
    startBusy(async () => {
      const r = await act.markUnread(c.id)
      if (!r.ok) { flash(r.reason, true); return }
      setMarks(m => new Set(m).add(c.id))
      setReadAt(m => { const n = { ...m }; delete n[c.id]; return n })
      closeChat()
      flash('Marked unread')
    })
  }
  const menuItems: MenuItem[] = chatContact ? [
    { label: 'Customer info', sub: 'Phone, outlet, visit, note', icon: 'userRound', bg: lv('avatar-bg'), fg: lv('pos'), go: () => { setMenu(false); setSheet('info') } },
    { label: chatContact.handedAt ? 'Handed over' : 'Hand over', sub: salesGroup(chatBrand), icon: 'send', bg: lv('accent-tint'), fg: lv('accent'), go: () => { setMenu(false); handOver(chatContact) } },
    { label: 'Mark unread', sub: 'Answer later', icon: 'clock', bg: lv('surface-sel'), fg: lv('fg-2'), go: () => markLater(chatContact) },
  ] : []

  // ── The Inbox ──
  const [filter, setFilter] = useState<InboxFilter>('waiting')
  const [brand, setBrand] = useState('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const listed = contacts.filter(c => !c.blockedAt)
  const pool = listed.filter(c => (brand === 'all' || c.brandId === brand) && matchesQuery(c, q))
  const chips = inboxChips(pool, p.labels, filter, seen)
  const rows = pool.filter(c => passes(c, filter, seen) || c.id === chatId).map(c => rowOf(c, brandName(c.brandId), seen, now))
  const badge = inboxBadge(contacts, seen)
  const pills = brandPills(contacts, p.config.brands)
  const brandLabel = brand === 'all' ? 'All brands' : brands.get(brand)?.name ?? 'All brands'

  // ── Leads ──
  const [stage, setStage] = useState<LeadStage | 'all'>('all')
  const [lq, setLq] = useState('')
  const leadPool = useMemo(() => byLastUpdate(listed), [listed])
  const leadRows = leadPool.filter(c => matchesLead(c, lq) && (stage === 'all' || stageOf(c) === stage))
    .map(c => leadRowOf(c, brandName(c.brandId), p.outlets))

  // ── Profile ──
  const [switching, startSwitch] = useTransition()
  const [picking, setPicking] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const switchTo = (to: SwitchTarget) => {
    if (to === 'person') { setSheet(null); setPicking(true); return }
    const form = new FormData()
    form.set('role', to)
    startSwitch(async () => { await setViewAs(form) })
  }
  const signOut = async () => {
    setSigningOut(true)
    await createClient().auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }
  const goHome = p.home ? () => { window.location.href = '/' } : null
  const groups = [{
    title: 'The portal',
    rows: [
      ...(p.canSwitch ? [{ key: 'switch', label: 'Switch view', icon: 'eye' as const, n: 'Lead View', go: () => setSheet('switch') }] : []),
      { key: 'signout', label: 'Sign out', icon: 'logOut' as const, go: () => setSheet('signout') },
    ],
  }]

  // ── The frame ──
  const tabs: TabItem[] = [
    ...(p.open.inbox ? [{ id: 'inbox' as const, label: 'Inbox', icon: 'inbox' as const, badge }] : []),
    ...(p.open.leads ? [{ id: 'leads' as const, label: 'Leads', icon: 'contact' as const }] : []),
    { id: 'profile', label: 'Profile', icon: 'userRound' },
  ]
  const pickTab = (t: Tab) => { setTab(t); setSearchOpen(false); setQ('') }
  // The phone's status bar in the colour under it: the wash's top on Profile, else white.
  const root = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<string | null>(null)
  const barToken = chatId === null && tab === 'profile' ? 'rail' : 'surface'
  useLayoutEffect(() => {
    const el = root.current
    const v = el ? getComputedStyle(el).getPropertyValue(`--lv-${barToken}`).trim() : ''
    setBar(v ? `rgb(${v})` : null)
  }, [barToken])
  useStatusBar(bar, bar !== null)
  const scrimOn = sheet !== null

  return (
    <div ref={root} data-lead-view="" data-lead-app="" className={`${s.app} ${figtree.variable}`} style={{ display: 'flex', flexDirection: 'column' }}>
      {p.viewingAs ? <ViewingAsBanner name={p.viewingAs} /> : null}
      {/* The top inset in the colour of the screen's top: Profile's wash, else white. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingTop: 'var(--lv-top)',
        background: tab === 'profile' ? lv('rail') : lv('surface') }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {tab === 'inbox' ? (
            p.problem ? (
              <div role="alert" style={{ margin: 20, padding: '14px 16px', borderRadius: 14, background: lv('accent-tint'), color: lv('accent'), fontSize: 14 }}>{p.problem}</div>
            ) : (
              <InboxScreen rows={rows} chips={chips} brandLabel={brandLabel} searchOpen={searchOpen} q={q} onQuery={setQ}
                onToggleSearch={() => { setSearchOpen(o => !o); setQ('') }} onBrands={() => setSheet('brands')} onChip={setFilter} onOpen={openChat}
                onBell={() => flash('No new notifications')} onHome={goHome} />
            )
          ) : tab === 'leads' ? (
            <LeadsScreen count={leadPool.length} q={lq} onQuery={setLq} chips={stageChips(leadPool, stage)} onChip={setStage} rows={leadRows} onOpen={openChat} />
          ) : (
            <ProfileScreen name={p.me.name} sub={p.me.sub} ini={initials(p.me.name || '?')} groups={groups} onHome={goHome} />
          )}
        </div>
        <TabBar tabs={tabs} on={tab} onPick={pickTab} />
      </div>

      {chatContact ? (
        <ChatScreen open={chatId !== null} name={chatContact.name || 'Customer'} ini={initials(chatContact.name || '?')} sub={chatSub(chatContact, chatBrand)}
          strip={stripOf(chatContact, chatBrand, p.canEdit)} wall={wall} links={links} menu={menuItems} menuOpen={menu}
          onToggleMenu={() => setMenu(m => !m)} onCloseMenu={() => { if (menu) setMenu(false) }} onBack={closeChat} onInfo={() => setSheet('info')}
          onConfirm={() => confirmPhone(chatContact)} onNotPhone={() => notPhone(chatContact)} onHand={() => handOver(chatContact)}
          draft={draft} onDraft={setDraft} onSend={send} onMicDown={micDown} onMicUp={() => micEnd(true)} onMicCancel={() => micEnd(false)} rec={rec}
          onPickFile={pickFile} onPickCamera={pickFile} onEmoji={() => setSheet('emoji')} canReply={p.canReply} busy={busy} listRef={listRef} boxRef={boxRef} />
      ) : null}

      <Scrim open={scrimOn} onClose={closeSheet} />
      <CustomerSheet open={sheet === 'info'} contact={chatContact} brandName={chatBrand} outlets={p.outlets} canEdit={p.canEdit} busy={busy} now={now}
        onConfirm={() => chatContact && confirmPhone(chatContact)} onNotPhone={() => chatContact && notPhone(chatContact)}
        onCopy={() => chatContact && copyDetails(chatContact)} onHand={() => chatContact && handOver(chatContact)}
        onSave={fields => (chatContact ? saveInfo(chatContact, fields) : Promise.resolve('No customer open.'))}
        onOutlet={choice => chatContact && pickOutlet(chatContact, choice)} />
      <BrandSheet open={sheet === 'brands'} pills={pills} picked={brand} onPick={id => { setBrand(id); setSheet(null) }} />
      <EmojiSheet open={sheet === 'emoji'} onPick={pickEmoji} />
      {p.canSwitch ? <SwitchViewSheet open={sheet === 'switch'} busy={switching} onPick={switchTo} /> : null}
      <SignOutSheet open={sheet === 'signout'} busy={signingOut} onCancel={closeSheet} onSignOut={() => void signOut()} />
      {p.canSwitch ? <ViewAsPersonPicker open={picking} onClose={() => setPicking(false)} z={90} /> : null}
      <Toast text={toast} inChat={chatId !== null} />
    </div>
  )
}
