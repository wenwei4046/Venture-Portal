'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { fileRoute } from '@/lib/storage/browser'
import {
  CHAT_POLL_MS, LOBBY, chatTime, peerPreview, peersInOrder, tidyMessage, type ChatList, type ChatMessage, type ChatTask, type ChatThread,
} from '@/lib/marketing/chat'
import { groupTone, toneBg } from '@/lib/marketing/groups'
import { initialOf } from '@/lib/marketing/shell'
import { readChatListNow, readChatThread } from '@/components/mkt/myspace/chat-read'
import { BackStep, Seg } from '../kit'
import { Shell } from './TaskScreen'
import s from '../mkt-app.module.css'

// The chat, pushed from Space (`Marketing App iOS + Android.dc.html` › Chat; My Space's chat, ⑦-3 — the desktop tile's
// rules, ChatTile.tsx): 💬 My chats and 🏛️ Lobby, a dot on the other while it holds something unread; a thread's
// bubbles, a task attached opening its page; 📎 attaches one of the board's tasks. A thread is read from the browser
// when it opens and every 15 s while it is in view, the list every 30 s; a read mark is sent only on the person's own
// move — a thread opened, a tap in it, the box focused — never by itself (speed.md).

export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

export interface ChatActions {
  send: (to: string, body: string | null, project: string | null) => Promise<Done<{ message: ChatMessage }>>
  read: (to: string, last: number) => Promise<Done>
}

export interface ChatScreenProps {
  list: ChatList
  tasks: ChatTask[]
  /** On the roster with a login, Marketing · Edit: writes and marks. Anybody else reads the lobby. */
  canSpeak: boolean
  /** null: the list; 'lobby'; a teammate's staff id. */
  with: string | null
  onWith: (w: string | null) => void
  onOpenTask: (trackId: string) => void
  onBack: () => void
  onList: (list: ChatList) => void
  say: (text: string) => void
  actions: ChatActions
}

/** The box's limit on the phone (the handoff's). The database's is longer (CHAT_MAX). */
const PHONE_MAX = 500

export default function ChatScreen(p: ChatScreenProps) {
  const me = p.list.me
  const [threads, setThreads] = useState<Record<string, ChatThread>>({})
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<ChatTask | null>(null)
  const [attach, setAttach] = useState(false)
  const [sending, setSending] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const marked = useRef<Record<string, number>>({})
  const list = p.list
  const showing = p.with
  const thread = showing ? threads[showing] : undefined
  const peer = showing && showing !== LOBBY ? list.dms.find(d => d.staff === showing) ?? null : null
  const canSpeak = p.canSpeak && !!me

  const setList = (fn: (l: ChatList) => ChatList) => p.onList(fn(list))
  const mark = useCallback((w: string, t: ChatThread | undefined) => {
    const last = t?.messages.at(-1)
    if (!last || !me || !canSpeak) return
    p.onList(w === LOBBY
      ? { ...list, lobby: { ...list.lobby, unread: false } }
      : { ...list, dms: list.dms.map(d => (d.staff === w ? { ...d, unread: false } : d)) })
    if (last.id <= (marked.current[w] ?? 0)) return
    marked.current[w] = last.id
    if (last.from !== me) void p.actions.read(w, last.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, canSpeak, list])

  const load = useCallback(async (w: string, opened: boolean) => {
    const t = await readChatThread(w)
    if (!t) return
    setThreads(cur => ({ ...cur, [w]: t }))
    if (opened) mark(w, t)
  }, [mark])

  // A teammate's thread opened from the list: Back (‹, the phone's) is the list again — one step over the chat's own.
  const [fromList, setFromList] = useState(false)
  /** A thread opened by the person — from the tabs or the list: read, and marked as far as it goes. */
  const open = (w: string | null, fromRow = false) => {
    setAttach(false)
    setPending(null)
    setDraft('')
    setFromList(fromRow)
    p.onWith(w)
    if (w) void load(w, true)
  }

  // The thread shown as the screen opens (a visit's Message): read, not marked until the person moves in it.
  useEffect(() => {
    if (showing) void load(showing, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the screen opens
  }, [])
  useEffect(() => {
    if (!showing) return
    const id = setInterval(() => { if (!document.hidden) void load(showing, false) }, CHAT_POLL_MS)
    return () => clearInterval(id)
  }, [showing, load])
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return
      const next = await readChatListNow()
      if (next) p.onList(next)
    }, CHAT_POLL_MS * 2)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const count = thread?.messages.length ?? 0
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count, showing])

  const earlier = async () => {
    if (!showing || !thread?.messages.length) return
    const older = await readChatThread(showing, thread.messages[0].id)
    if (!older) return
    setThreads(cur => ({ ...cur, [showing]: { ...older, messages: [...older.messages, ...(cur[showing]?.messages ?? [])] } }))
  }

  const send = async () => {
    if (!showing || sending || !canSpeak) return
    const body = tidyMessage(draft)
    if (!body && !pending) return
    setSending(true)
    try {
      const r = await p.actions.send(showing, body, pending?.id ?? null)
      if (!r.ok) return p.say(r.reason)
      setThreads(cur => {
        const t = cur[showing] ?? { with: showing, messages: [], more: false }
        return t.messages.some(x => x.id === r.message.id) ? cur : { ...cur, [showing]: { ...t, messages: [...t.messages, r.message] } }
      })
      marked.current[showing] = Math.max(marked.current[showing] ?? 0, r.message.id)
      setList(cur => (showing === LOBBY
        ? { ...cur, lobby: { last: r.message, unread: false } }
        : { ...cur, dms: cur.dms.map(d => (d.staff === showing ? { ...d, last: r.message, unread: false } : d)) }))
      setDraft('')
      setPending(null)
      setAttach(false)
    } finally {
      setSending(false)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  const tabsShown = !showing || showing === LOBBY
  const title = peer ? peer.first : 'Chat'
  const tab: 'dm' | 'lobby' = showing === LOBBY ? 'lobby' : 'dm'
  const tabs = me
    ? [
      { key: 'dm' as const, label: '💬 My chats', dot: showing === LOBBY && list.dms.some(d => d.unread) },
      { key: 'lobby' as const, label: '🏛️ Lobby', dot: showing !== LOBBY && list.lobby.unread },
    ]
    : [{ key: 'lobby' as const, label: '🏛️ Lobby', dot: false }]
  const nameOf = (m: ChatMessage) => (m.from === me ? 'You' : m.first || peer?.first || 'Someone')

  const toList = fromList && !!peer
  return (
    <Shell title={title} sub={peer?.title ?? undefined} onBack={toList ? () => open(null) : p.onBack}>
      {toList ? <BackStep k="mkt-app-chat-thread" onBack={() => open(null)} /> : null}
      {tabsShown ? (
        <div className={s.chatTabs}>
          <Seg label="Chats" look="chat" value={tab} onPick={k => open(k === 'lobby' ? LOBBY : null)} items={tabs} />
        </div>
      ) : null}
      {!showing ? (
        <div className={s.scroll}>
          <div className={s.peers}>
            {peersInOrder(list.dms).map(d => (
              <button key={d.staff} type="button" className={s.peer} onClick={() => open(d.staff, true)}>
                <span className={s.peerAv} style={{ background: toneBg(groupTone(d.title)) }}>
                  {d.avatarPath ? <img src={fileRoute('marketing', d.avatarPath)} alt="" /> : initialOf(d.first)}
                  {d.unread ? <span className={s.peerDot} /> : null}
                </span>
                <span className={s.grow}>
                  <span className={s.peerTop}>
                    <span className={s.peerName} data-unread={d.unread ? 'true' : 'false'}>{d.first}</span>
                    {d.last ? <span className={s.peerTime}>{chatTime(d.last.at)}</span> : null}
                  </span>
                  <span className={s.peerLast} data-unread={d.unread ? 'true' : 'false'} style={{ display: 'block' }}>{peerPreview(d, me)}</span>
                </span>
              </button>
            ))}
            {list.dms.length ? null : <div className={s.emptyTall}>No teammates to message yet.</div>}
          </div>
        </div>
      ) : (
        <>
          {showing === LOBBY ? <div className={s.lobbyNote}>Everyone sees this</div> : null}
          <div className={s.scroll} ref={log} onClick={() => mark(showing, thread)}>
            <div className={s.log}>
              {thread?.more ? <button type="button" className={s.earlier} onClick={() => void earlier()}>Earlier messages</button> : null}
              {thread === undefined ? <div className={s.emptyTall}>…</div> : null}
              {thread && !thread.messages.length ? <div className={s.emptyTall}>No messages yet</div> : null}
              {thread?.messages.map(m => {
                const mine = m.from === me
                return (
                  <div key={m.id} className={s.msg} data-me={mine ? 'true' : 'false'}>
                    <span className={s.msgMeta}>{nameOf(m)} · {chatTime(m.at)}</span>
                    {m.body ? <div className={s.bubble}>{m.body}</div> : null}
                    {m.project ? (
                      <button type="button" className={s.msgTask} onClick={() => m.project && p.onOpenTask(m.project.track || m.project.id)}>
                        <span className={s.msgTrack}>📎 {m.project.track}</span>
                        <span className={s.msgTaskTitle}>{m.project.title}</span>
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
          {canSpeak && (showing === LOBBY || !!peer) ? (
            <>
              {attach ? (
                <div className={s.attach}>
                  {p.tasks.map(t => (
                    <button key={t.id} type="button" className={s.attachRow} onClick={() => { setPending(t); setAttach(false) }}>
                      <span className={s.ellipsis} style={{ display: 'block', fontWeight: 500 }}>{t.title}</span>
                      <span className={s.attachTrack}>{t.track}</span>
                    </button>
                  ))}
                  {p.tasks.length ? null : <div className={s.emptyTall}>No tasks to attach.</div>}
                </div>
              ) : null}
              {pending ? (
                <div className={s.pending}>
                  <span className={`${s.grow} ${s.ellipsis}`}>📎 {pending.title}</span>
                  <button type="button" className={s.pendingX} onClick={() => setPending(null)} aria-label="Take the task off">✕</button>
                </div>
              ) : null}
              <div className={s.composer}>
                <button type="button" className={s.clip} data-on={attach ? 'true' : 'false'} onClick={() => setAttach(a => !a)} aria-label="Attach a task">📎</button>
                <input className={s.draft} value={draft} maxLength={PHONE_MAX} onChange={e => setDraft(e.target.value)} onKeyDown={onKey}
                  onFocus={() => mark(showing, thread)} placeholder={showing === LOBBY ? 'Message the lobby' : `Message ${peer?.first ?? ''}`} aria-label="Message" />
                <button type="button" className={s.send} data-off={draft.trim() || pending ? 'false' : 'true'} disabled={sending} onClick={() => void send()} aria-label="Send">↑</button>
              </div>
            </>
          ) : null}
        </>
      )}
    </Shell>
  )
}
