'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { flash } from '@/components/hrv/toast'
import { readMktChat, sendMktChat } from '@/lib/marketing/actions'
import {
  anyUnread, CHAT_MAX, CHAT_POLL_MS, chatTime, LOBBY, peerPreview, peersInOrder, tidyMessage, type ChatList, type ChatMessage, type ChatTask,
  type ChatThread,
} from '@/lib/marketing/chat'
import { groupTone, toneBg } from '@/lib/marketing/groups'
import { initialOf } from '@/lib/marketing/shell'
import { fileRoute } from '@/lib/storage/browser'
import { readChatListNow, readChatThread } from './chat-read'
import s from './myspace.module.css'

// My Space's chat (`My Space Bento.dc.html` › the chat tile, ⑦-3 — the user's answers 35, 36, 37 and 39): *💬 My
// chats* — a teammate each, the last message, a dot while unread — and *🏛️ Lobby*, the team's thread. A chat opened:
// its messages (a task attached opens its page), and a line to write with *📎* to attach a task; Enter sends. Somebody
// off the roster reads the lobby and writes nothing. Messages stay as they were sent; unread is a dot, nothing more.

export interface ChatTileProps {
  list: ChatList
  /** On the roster with a login, and Marketing · Edit: they write. */
  canSpeak: boolean
  /** What a message may carry: the board's tasks, newest first. */
  tasks: ChatTask[]
  /** Open on a teammate's chat (a visit's *💬 Message*). */
  openWith?: string | null
}

type Tab = 'dm' | 'lobby'

export default function ChatTile({ list: initial, canSpeak, tasks, openWith = null }: ChatTileProps) {
  const [list, setList] = useState<ChatList>(initial)
  const me = list.me
  const peerOpen = openWith && initial.dms.some(d => d.staff === openWith) ? openWith : null
  const [tab, setTab] = useState<Tab>(me ? 'dm' : 'lobby')
  const [dm, setDm] = useState<string | null>(peerOpen)
  const [threads, setThreads] = useState<Record<string, ChatThread>>({})
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<ChatTask | null>(null)
  const [attach, setAttach] = useState(false)
  const [sending, setSending] = useState(false)
  const log = useRef<HTMLDivElement>(null)

  const showing = tab === 'lobby' ? LOBBY : dm
  const thread = showing ? threads[showing] : undefined
  const peer = dm ? list.dms.find(d => d.staff === dm) ?? null : null
  const dots = anyUnread(list)

  // How far this page has marked each thread read. A mark is sent only on the person's own move — a thread opened, a
  // click in it, a message sent — never by itself after a navigation or as messages arrive (speed.md).
  const marked = useRef<Record<string, number>>({})
  const mark = useCallback((w: string, t: ChatThread | undefined) => {
    const last = t?.messages.at(-1)
    if (!last || !me || !canSpeak) return
    setList(cur => (w === LOBBY
      ? { ...cur, lobby: { ...cur.lobby, unread: false } }
      : { ...cur, dms: cur.dms.map(d => (d.staff === w ? { ...d, unread: false } : d)) }))
    if (last.id <= (marked.current[w] ?? 0)) return
    marked.current[w] = last.id
    if (last.from !== me) void readMktChat(w, last.id)
  }, [me, canSpeak])

  /** Read a thread — and, opened by the person, mark it read as far as it goes. */
  const load = useCallback(async (w: string, opened: boolean) => {
    const t = await readChatThread(w)
    if (!t) return
    setThreads(cur => ({ ...cur, [w]: t }))
    if (opened) mark(w, t)
  }, [mark])
  const open = (nextTab: Tab, peerId: string | null) => {
    setTab(nextTab)
    setDm(peerId)
    setAttach(false)
    const w = nextTab === 'lobby' ? LOBBY : peerId
    if (w) void load(w, true)
  }

  // The thread shown when the page opens (a visit's Message; the lobby off the roster): read, not marked.
  useEffect(() => {
    if (showing) void load(showing, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page opens
  }, [])
  // …and read again now and then while it is in view.
  useEffect(() => {
    if (!showing) return
    const id = setInterval(() => {
      if (!document.hidden) void load(showing, false)
    }, CHAT_POLL_MS)
    return () => clearInterval(id)
  }, [showing, load])

  // The list (its dots and last lines), read again now and then while no thread hides it.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return
      const next = await readChatListNow()
      if (next) setList(next)
    }, CHAT_POLL_MS * 2)
    return () => clearInterval(id)
  }, [])

  // The newest message in view.
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
    if (!showing || sending) return
    const body = tidyMessage(draft)
    if (!body && !pending) return
    setSending(true)
    try {
      const r = await sendMktChat(showing, body, pending?.id ?? null)
      if (!r.ok) {
        flash(r.reason)
        return
      }
      const add = (m: ChatMessage) => setThreads(cur => {
        const t = cur[showing] ?? { with: showing, messages: [], more: false }
        return t.messages.some(x => x.id === m.id) ? cur : { ...cur, [showing]: { ...t, messages: [...t.messages, m] } }
      })
      add(r.message)
      // The database marked the sender's thread read to their message.
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

  const tabs: { key: Tab; label: string; unread: boolean }[] = me
    ? [{ key: 'dm', label: '💬 My chats', unread: dots.dms }, { key: 'lobby', label: '🏛️ Lobby', unread: dots.lobby }]
    : [{ key: 'lobby', label: '🏛️ Lobby', unread: false }]
  const writes = canSpeak && !!showing && (showing === LOBBY || !!peer)

  return (
    <div className={s.chat}>
      <div className={s.chatTabs} role="tablist" aria-label="Chats">
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={s.chatTab}
            onClick={() => open(t.key, null)}>
            {t.label}
            {t.unread && tab !== t.key ? <span className={s.chatTabDot} aria-label="Unread" /> : null}
          </button>
        ))}
      </div>

      {tab === 'dm' && !dm ? (
        <div className={s.chatPeers}>
          {list.dms.length ? null : <div className={s.chatEmpty}>Nobody to message yet</div>}
          {peersInOrder(list.dms).map(p => (
            <button key={p.staff} type="button" className={s.chatPeer} data-unread={p.unread ? '' : undefined}
              aria-label={`${p.first}${p.unread ? ' · unread' : ''}`} onClick={() => open('dm', p.staff)}>
              <span className={s.chatAv} style={{ background: toneBg(groupTone(p.title)) }} aria-hidden="true">
                {p.avatarPath ? <img src={fileRoute('marketing', p.avatarPath)} alt="" /> : initialOf(p.first)}
                {p.unread ? <span className={s.chatAvDot} /> : null}
              </span>
              <span className={s.chatPeerMain}>
                <span className={s.chatPeerTop}>
                  <span className={s.chatPeerName}>{p.first}</span>
                  <span className={s.chatPeerTime}>{p.last ? chatTime(p.last.at) : ''}</span>
                </span>
                <span className={s.chatPreview}>{peerPreview(p, me)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {tab === 'dm' && peer ? (
            <div className={s.chatHead}>
              <button type="button" className={s.chatBack} title="All chats" aria-label="All chats" onClick={() => { setDm(null); setAttach(false); setPending(null) }}>←</button>
              <span className={s.chatAvSmall} style={{ background: toneBg(groupTone(peer.title)) }} aria-hidden="true">
                {peer.avatarPath ? <img src={fileRoute('marketing', peer.avatarPath)} alt="" /> : initialOf(peer.first)}
              </span>
              <span className={s.chatHeadName}>{peer.first}</span>
              {peer.title ? <span className={s.chatHeadRole}>{peer.title}</span> : null}
            </div>
          ) : (
            <div className={s.chatNote}>Everyone sees this</div>
          )}
          <div ref={log} className={s.chatLog} role="log" aria-label={tab === 'lobby' ? 'The lobby' : `Messages with ${peer?.first ?? ''}`}
            onPointerDown={() => showing && mark(showing, thread)}>
            {thread?.more ? <button type="button" className={s.chatEarlier} onClick={() => void earlier()}>Earlier messages</button> : null}
            {thread && !thread.messages.length ? <div className={s.chatEmpty}>No messages yet</div> : null}
            {thread?.messages.map(m => {
              const mine = m.from === me
              return (
                <div key={m.id} className={s.chatMsg} data-mine={mine ? '' : undefined}>
                  <span className={s.chatMeta}>{mine ? 'You' : m.first || 'Someone'} · {chatTime(m.at)}</span>
                  {m.body ? <div className={s.chatBubble}>{m.body}</div> : null}
                  {m.project ? (
                    <Link href={`/marketing/projects/${encodeURIComponent(m.project.track || m.project.id)}`} className={s.chatTask}>
                      <span className={s.chatTaskId}>📎 {m.project.track}</span>
                      <span className={s.chatTaskTitle}>{m.project.title}</span>
                    </Link>
                  ) : null}
                </div>
              )
            })}
          </div>
          {writes ? (
            <>
              {attach ? (
                <div className={s.chatAttach} role="listbox" aria-label="Attach a task">
                  {tasks.length ? null : <div className={s.chatEmpty}>No tasks to attach</div>}
                  {tasks.map(t => (
                    <button key={t.id} type="button" role="option" aria-selected={pending?.id === t.id} className={s.chatAttachRow}
                      onClick={() => { setPending(t); setAttach(false) }}>
                      <span className={s.chatAttachTitle}>{t.title}</span>
                      <span className={s.chatTaskId}>{t.track}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {pending ? (
                <div className={s.chatPending}>
                  <span className={s.chatPendingTitle}>📎 {pending.title}</span>
                  <button type="button" className={s.chatPendingOff} aria-label="Take the task off" onClick={() => setPending(null)}>✕</button>
                </div>
              ) : null}
              <div className={s.chatCompose}>
                <button type="button" className={s.chatClip} title="Attach a task" aria-label="Attach a task" aria-pressed={attach}
                  onClick={() => setAttach(a => !a)}>📎</button>
                <input className={s.chatInput} value={draft} maxLength={CHAT_MAX} disabled={sending} aria-label="Message"
                  placeholder={tab === 'lobby' ? 'Message the lobby' : `Message ${peer?.first ?? ''}`}
                  onChange={e => setDraft(e.target.value)} onKeyDown={onKey} onFocus={() => showing && mark(showing, thread)} />
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
