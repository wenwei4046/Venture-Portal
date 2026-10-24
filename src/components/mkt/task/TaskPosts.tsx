'use client'

import { useState, useTransition } from 'react'
import { markMktPost, unmarkMktPost } from '@/lib/marketing/actions'
import { shortDay } from '@/lib/marketing/board'
import { linkPlace, postLinkOk, taskPosts } from '@/lib/marketing/posts'
import type { MktTaskPage, TaskViewer } from '@/lib/marketing/task'
import s from './task.module.css'
import p from './posts.module.css'

// A task's posts (④-2c — the user's answer 15: "a post is a deliverable with a 📣 Post day; done = Scheduled, its owner
// marks it Posted, with its link"): each Post day its stages hold and where it stands — In production, Overdue,
// Scheduled, Posted — and, once the task is done, its owner's (the task's, the stage's) or the manager's *Mark posted…*
// with the link, or *Take back*.

const TONE: Record<string, string> = { done: p.done, waiting: p.waiting, red: p.red, draft: p.draft }

export default function TaskPosts({ page, can, onPage, say }: {
  page: MktTaskPage
  can: TaskViewer
  onPage: (next: MktTaskPage | null) => void
  say: (text: string) => void
}) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const posts = taskPosts(page, can.manage)
  if (!posts.length) return null
  const done = page.project.status === 'done'

  const mark = (stage: number, field: string) =>
    start(async () => {
      const r = await markMktPost(page.project.id, stage, field, link.trim())
      if (!r.ok) return say(r.reason)
      onPage(r.page)
      setOpen(null)
      setLink('')
      say(`${field} · posted`)
    })
  const unmark = (stage: number, field: string) =>
    start(async () => {
      const r = await unmarkMktPost(page.project.id, stage, field)
      if (!r.ok) return say(r.reason)
      onPage(r.page)
      say(`${field} · the posted mark taken back`)
    })

  return (
    <div>
      <div className={s.secHead}>
        <span className={s.secIcon} aria-hidden="true">📣</span>
        <span className={s.secTitle}>Posts</span>
      </div>
      <div className={p.list} aria-label="Posts">
        {posts.map(x => (
          <div key={x.key} className={p.row}>
            <span className={p.field}>{x.field}</span>
            <span className={p.day}>{shortDay(x.day)}</span>
            <span className={`${p.pill} ${TONE[x.state.tone] ?? p.draft}`}><span className={p.dot} aria-hidden="true" />{x.state.label}</span>
            {x.posted ? (
              <span className={p.posted}>
                <a href={x.posted.link} target="_blank" rel="noopener noreferrer" className={p.link}>{linkPlace(x.posted.link)} ↗</a>
                <span> · {x.posted.name}</span>
              </span>
            ) : null}
            <span className={p.grow} />
            {x.mine && done && !x.posted && open !== x.key ? (
              <button type="button" className={p.markBtn} disabled={pending} onClick={() => { setOpen(x.key); setLink('') }}>Mark posted…</button>
            ) : null}
            {x.mine && x.posted ? (
              <button type="button" className={p.takeBack} disabled={pending} onClick={() => unmark(x.stage, x.field)}>Take back</button>
            ) : null}
            {open === x.key ? (
              <span className={p.ask}>
                <input className={p.input} value={link} maxLength={500} placeholder="https://…" aria-label={`${x.field} link`} autoFocus
                  onChange={e => setLink(e.target.value)} onKeyDown={e => e.key === 'Enter' && postLinkOk(link) && mark(x.stage, x.field)} />
                <button type="button" className={p.cancel} disabled={pending} onClick={() => setOpen(null)}>Cancel</button>
                <button type="button" className={p.markBtn} disabled={pending || !postLinkOk(link)} onClick={() => mark(x.stage, x.field)}>
                  {pending ? 'Saving…' : 'Posted'}
                </button>
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
