'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { acceptMktStage, decideMktStage, putMktFree, saveMktStageFiles, saveMktWork, setMktSeries, submitMktStage } from '@/lib/marketing/actions'
import { nameOf, seriesView, subsOutText, taskView, trailLines, type FreeBlock, type FreeType, type MktTaskPage, type TaskViewer, type Tone } from '@/lib/marketing/task'
import { missingWork, type FormField, type PickPerson, type StageFile, type StageWork, type WorkLink } from '@/lib/marketing/tasks'
import { LIB_MAX_BYTES, STAGE_MAX_FILES, stagePath, type TaskFile } from '@/lib/marketing/library'
import { createClient } from '@/lib/supabase/client'
import ProjectSheet from '../audit/ProjectSheet'
import a from '../audit/audit.module.css'
import StageFiles from './StageFiles'
import TaskLibrary from './TaskLibrary'
import TaskPosts from './TaskPosts'
import TaskSubtasks from './TaskSubtasks'
import s from './task.module.css'

// A task's page (`New Task Page.dc.html`): where it stands and who it is with, what the viewer may do now — Accept,
// work their stage (its fields, notes, links and files — uploaded, ②b-2e) and Submit for approval / Complete it, or as its approver Approve /
// Request changes — the stages in a rail, the stage's subtasks (✂️ Split, a delivery, Review delivery — TaskSubtasks),
// each stage's work, the Free space anybody on the task writes in, a recurring task's runs, and the trail. Every answer
// comes back with the task as it now stands.

const TONE: Record<Tone, string> = { red: s.red, waiting: s.waiting, done: s.done, draft: s.draft }
const INPUT_TYPES = new Set(['Text', 'Number', 'Date', 'Person', 'Select', 'Multi-select'])
const blockId = () => (Math.random().toString(36).slice(2) + '00000000').slice(0, 10)
const isLink = (v: string) => /^https?:\/\/\S+$/i.test(v.trim())

export default function TaskPage({ initial, can, files = [], splitPeople = [] }: {
  initial: MktTaskPage
  can: TaskViewer
  files?: TaskFile[]
  /** Whom ✂️ Split into subtasks offers — read only for the owner of a stage that splits. */
  splitPeople?: PickPerson[]
}) {
  const router = useRouter()
  const [page, setPage] = useState(initial)
  const [pending, start] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState<'map' | 'audit' | null>(null)
  const [reason, setReason] = useState('')
  const [linkDraft, setLinkDraft] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])
  const say = (t: string) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  const p = page.project
  const view = taskView(page, can)
  const mine = view.mine

  // The viewer's own stage, worked here: a copy of its work, saved field by field (only what changed).
  const mineKey = mine ? `${p.id}:${mine.idx}:${mine.status}:${mine.ver}` : ''
  const [workFor, setWorkFor] = useState(mineKey)
  const [work, setWork] = useState<StageWork | null>(mine?.work ?? null)
  const saved = useRef<StageWork | null>(mine?.work ?? null)
  if (workFor !== mineKey) {
    setWorkFor(mineKey)
    setWork(mine?.work ?? null)
    saved.current = mine?.work ?? null
  }
  const missing = mine && work ? missingWork(mine.form, work) : view.missing
  /** Why the viewer's stage is not handed on yet: its fields first, then its subtasks. */
  const holdNote = missing.length ? `Fill in ${missing.join(', ')}` : view.subsOut ? subsOutText(view.subsOut) : ''

  // The Free space: block by block.
  const [freeFor, setFreeFor] = useState(p.id)
  const [free, setFree] = useState<FreeBlock[]>(p.free)
  if (freeFor !== p.id) {
    setFreeFor(p.id)
    setFree(p.free)
  }
  const me = page.me
  const onTask = !!me && (p.owner === me || page.stages.some(x => x.owner === me || x.appr.some(a => a.kind === 'person' && a.staff === me)) || page.subtasks.some(t => t.assignee === me))
  const canFree = (can.manage || (can.edit && onTask)) && p.status !== 'cancelled'

  const fresh = (next: MktTaskPage | null) => {
    if (next) setPage(next)
    else router.refresh()
  }

  const accept = () =>
    start(async () => {
      const r = await acceptMktStage(p.id)
      if (!r.ok) return say(r.reason)
      fresh(r.page)
      say('Accepted — it’s yours')
    })

  const submit = () =>
    start(async () => {
      if (!mine) return
      const next = page.stages[mine.idx + 1]
      const approver = mine.appr[0]
      const r = await submitMktStage(p.id)
      if (!r.ok) return say(r.reason)
      fresh(r.page)
      if (approver) say(`Submitted · sent to ${approver.kind === 'pic' ? 'the PIC' : nameOf(page.team, approver.staff)}`)
      else say(next ? `Done · ${next.name} opens for ${nameOf(page.team, next.owner)}` : 'Task complete 🎉')
    })

  const decide = (approve: boolean) =>
    start(async () => {
      const cur = page.stages[p.cur]
      const r = await decideMktStage(p.id, approve, approve ? undefined : reason.trim())
      if (!r.ok) return say(r.reason)
      setModal(false)
      setReason('')
      fresh(r.page)
      if (!approve) return say('Sent back')
      const nextLevel = cur?.appr[cur.apprIdx + 1]
      const next = page.stages[p.cur + 1]
      say(nextLevel ? `Approved · on to ${nextLevel.kind === 'pic' ? 'the PIC' : nameOf(page.team, nextLevel.staff)}` : next ? `Approved · ${next.name} opens next` : 'Approved · task done')
    })

  const series = (to: 'pause' | 'resume' | 'end') =>
    start(async () => {
      if (!page.series) return
      const r = await setMktSeries(page.series.id, to, p.id)
      if (!r.ok) return say(r.reason)
      fresh(r.page)
      say(to === 'pause' ? 'Paused · its runs wait' : to === 'resume' ? 'Resumed' : 'Ended · no more runs')
    })

  const save = async (patch: Parameters<typeof saveMktWork>[1], after: (w: StageWork) => StageWork) => {
    const r = await saveMktWork(p.id, patch)
    if (!r.ok) return say(r.reason)
    if (saved.current) saved.current = after(saved.current)
  }
  const saveVal = (f: FormField, value: string | boolean) => {
    if (!saved.current) return
    const before = saved.current.vals[f.label]
    const empty = value === '' || value === false
    if (before === value || (before === undefined && empty)) return
    void save({ vals: { [f.label]: empty && typeof value === 'string' ? null : value } }, w => {
      const vals = { ...w.vals }
      if (empty && typeof value === 'string') delete vals[f.label]
      else vals[f.label] = value
      return { ...w, vals }
    })
  }
  const saveNotes = () => {
    if (!work || !saved.current || work.notes === saved.current.notes) return
    const notes = work.notes
    void save({ notes }, w => ({ ...w, notes }))
  }
  const setLinks = (links: WorkLink[]) => {
    setWork(w => (w ? { ...w, links } : w))
    void save({ links }, w => ({ ...w, links }))
  }
  const addLink = () => {
    const url = linkDraft.trim()
    if (!work || !isLink(url)) return say('A link starts with https://')
    setLinks([...work.links, { url, label: '' }])
    setLinkDraft('')
  }

  // The stage's files: the whole list saved as it now stands — a refused save takes back what was just sent.
  const keepFiles = (list: StageFile[]) => list.map(f => ({ path: f.path, name: f.name, field: f.field }))
  const stageFilesSaved = (next: MktTaskPage | null) => {
    fresh(next)
    const now = next?.stages[next.project.cur]
    if (!now || now.idx !== mine?.idx) return
    setWork(w => (w ? { ...w, files: now.work.files } : w))
    if (saved.current) saved.current = { ...saved.current, files: now.work.files }
  }
  const sendFiles = (field: string | null, list: FileList) =>
    start(async () => {
      if (!saved.current) return
      const db = createClient() as unknown as SupabaseClient
      const room = STAGE_MAX_FILES - saved.current.files.length
      const picked = Array.from(list).filter(f => {
        if (f.size > LIB_MAX_BYTES) say(`${f.name} is over 2 GB — add it as a link.`)
        return f.size <= LIB_MAX_BYTES
      })
      if (picked.length > room) say('Twenty files at most on a stage.')
      const sent: { path: string; name: string; field: string | null }[] = []
      for (const [k, f] of picked.slice(0, Math.max(0, room)).entries()) {
        setSending(`Uploading ${k + 1} of ${Math.min(picked.length, room)} · ${f.name}`)
        const path = stagePath(f.name, crypto.randomUUID())
        const put = await db.storage.from('marketing').upload(path, f, { contentType: f.type || undefined })
        if (put.error) {
          say(put.error.message || `${f.name} could not be uploaded.`)
          continue
        }
        sent.push({ path, name: f.name, field })
      }
      setSending(null)
      if (!sent.length) return
      const r = await saveMktStageFiles(p.id, [...keepFiles(saved.current.files), ...sent])
      if (!r.ok) {
        await db.storage.from('marketing').remove(sent.map(x => x.path))
        return say(r.reason)
      }
      stageFilesSaved(r.page)
      say(sent.length === 1 ? `Uploaded ${sent[0].name}` : `${sent.length} files uploaded`)
    })
  const dropFile = (path: string) =>
    start(async () => {
      if (!saved.current) return
      const r = await saveMktStageFiles(p.id, keepFiles(saved.current.files.filter(f => f.path !== path)))
      if (!r.ok) return say(r.reason)
      stageFilesSaved(r.page)
    })

  const putBlock = async (b: FreeBlock, op: 'put' | 'remove' = 'put') => {
    const r = await putMktFree(p.id, op, { id: b.id, type: b.type, text: b.text, done: b.done })
    if (!r.ok) return say(r.reason)
    // The blocks as they stand (others' too), keeping what is being typed here.
    setFree(cur => r.free.map(x => {
      const here = cur.find(y => y.id === x.id)
      return here ? { ...x, text: here.text, done: here.done } : x
    }))
  }
  const addBlock = (type: FreeType) => {
    const b: FreeBlock = { id: blockId(), type, text: '', done: false, by: '' }
    setFree(cur => [...cur, b])
    void putBlock(b)
  }
  const editBlock = (id: string, patch: Partial<FreeBlock>) => setFree(cur => cur.map(x => (x.id === id ? { ...x, ...patch } : x)))

  const sv = seriesView(page)
  const lines = trailLines(page)
  const cur = page.stages[p.cur]
  const sendsBackTo = cur && cur.back != null && cur.back < cur.idx ? page.stages[cur.back] : null

  return (
    <div>
      <div className={s.top}>
        <div className={s.crumbs}>
          <Link href="/marketing/projects" className={s.crumbLink}>← Projects</Link>
          <span>/</span>
          {page.sub ? <Link href={`/marketing/projects?sub=${encodeURIComponent(page.sub.code)}`} className={s.crumbLink}>{page.sub.name}</Link> : null}
          <span>/</span>
          {p.parentProject ? (
            <>
              <Link href={`/marketing/projects/${encodeURIComponent(p.parentProject.trackId)}`} className={s.crumbLink}>📦 {p.parentProject.title}</Link>
              <span>/</span>
            </>
          ) : null}
          <span className={s.crumbText}>{p.title}</span>
          <span className={s.grow} />
          <span className={s.ver}>{view.version}</span>
        </div>
        <div className={s.headRow}>
          <div className={s.headLeft}>
            <div className={s.idRow}>
              <span className={s.track}>{p.trackId}</span>
              <span className={`${s.pill} ${TONE[view.tone]}`}><span className={s.pillDot} aria-hidden="true" />{view.status}</span>
            </div>
            <div className={s.title}>{p.title}</div>
          </div>
          <div className={s.headRight}>
            {/* A deliverable's Assignment Plan, the manager's (②b-2a). */}
            {can.manage && p.kind === 'deliverable' && (p.status === 'planning' || p.status === 'active') ? (
              <Link href={`/marketing/projects/${encodeURIComponent(p.trackId)}?plan=1`} className={`${s.btn}${p.status === 'planning' ? ` ${s.btnPrimary}` : ''}`}>
                {p.status === 'planning' ? 'Plan it →' : 'Assignment plan'}
              </Link>
            ) : null}
            {view.actions.length ? (
              <div className={s.actions}>
                {view.actions.map(a => {
                  const ready = a.key === 'submit' || a.key === 'complete' ? !holdNote : !a.disabled
                  return (
                    <button
                      key={a.key}
                      type="button"
                      disabled={pending || !ready}
                      className={`${s.btn}${a.key === 'changes' ? ` ${s.btnDanger}` : ` ${s.btnPrimary}`}`}
                      onClick={() => (a.key === 'accept' ? accept() : a.key === 'changes' ? setModal(true) : a.key === 'approve' ? decide(true) : submit())}
                    >
                      {a.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {sending ? <span className={s.note} role="status">{sending}</span> : null}
            {mine ? (
              <span className={`${s.note}${holdNote ? ` ${s.noteRed}` : ''}`}>{holdNote || 'Ready'}</span>
            ) : view.note ? (
              <span className={`${s.note}${view.noteRed ? ` ${s.noteRed}` : ''}`}>{view.note}</span>
            ) : null}
          </div>
        </div>
        <div className={s.meta}>
          {view.meta.map(m => (
            <div key={m.k}>
              <div className={s.metaK}>{m.k}</div>
              <div className={s.metaV}>{m.v}</div>
            </div>
          ))}
        </div>
        <div className={s.rail}>
          {view.rail.map((r, i) => (
            <div key={r.idx} className={s.railStage}>
              <div className={s.railTop}>
                <div className={`${s.railMark}${r.state === 'done' ? ` ${s.railDone}` : r.state === 'current' ? ` ${s.railCur}` : ''}`}>{r.mark}</div>
                {i < view.rail.length - 1 ? <div className={`${s.railLine}${r.state === 'done' ? ` ${s.railLineDone}` : ''}`} /> : null}
              </div>
              <div className={s.railText}>
                <div className={`${s.railName}${r.state === 'current' ? ` ${s.railNameCur}` : ''}`}>{r.name}</div>
                <div className={s.railWho}>{r.who}</div>
                <div className={s.railAppr}>{r.appr} · due {r.due}</div>
              </div>
            </div>
          ))}
        </div>
        <TaskSubtasks part="list" page={page} can={can} people={splitPeople} onPage={fresh} say={say} />
      </div>

      {view.banner ? <div className={`${s.banner} ${TONE[view.banner.tone]}`}>{view.banner.text}</div> : null}

      <div className={s.body}>
        <div className={s.main}>
          <div>
            <div className={s.secHead}>
              <span className={s.secIcon} aria-hidden="true">📋</span>
              <span className={s.secTitle}>Requirements</span>
              <span className={s.tag}>🔒 Locked</span>
            </div>
            <div className={s.req}>
              <div className={s.reqSource}>{view.requirements.source}</div>
              <div className={s.reqText}>{view.requirements.text}</div>
            </div>
          </div>

          <TaskPosts page={page} can={can} onPage={fresh} say={say} />

          <TaskSubtasks part="deliver" page={page} can={can} onPage={fresh} say={say} />

          {!view.isSeries ? (
            <TaskLibrary project={page.project.id} sub={page.project.sub} initial={files}
              open={page.project.status !== 'done' && page.project.status !== 'cancelled'} canEdit={can.edit} />
          ) : null}

          {sv ? (
            <div>
              <div className={s.secHead}>
                <span className={s.secIcon} aria-hidden="true">🔁</span>
                <span className={s.secTitle}>Repeat</span>
                <span className={`${s.pill} ${TONE[sv.tone]}`}><span className={s.pillDot} aria-hidden="true" />{sv.status}</span>
              </div>
              <div className={s.series}>
                <div className={s.seriesHead}>
                  <span className={s.seriesRule}>{sv.rule}</span>
                  <span className={s.seriesPeriod}>{sv.period}</span>
                </div>
                <div className={s.runs}>
                  {sv.runs.map(r => (
                    <Link key={r.id} href={`/marketing/projects/${r.id}`} className={`${s.run}${r.current ? ` ${s.runCur}` : ''}`}>
                      <span>{r.label}</span>
                      <span className={s.runDay}>{r.day}</span>
                      <span style={{ display: 'flex' }}><span className={`${s.pill} ${TONE[r.tone]}`}><span className={s.pillDot} aria-hidden="true" />{r.status}</span></span>
                    </Link>
                  ))}
                </div>
                {can.manage && page.series && page.series.status !== 'done' && page.series.status !== 'cancelled' ? (
                  <div className={s.seriesBtns}>
                    {page.series.status === 'active' ? <button type="button" className={s.btn} disabled={pending} onClick={() => series('pause')}>Pause</button> : null}
                    {page.series.status === 'paused' ? <button type="button" className={s.btn} disabled={pending} onClick={() => series('resume')}>Resume</button> : null}
                    <button type="button" className={`${s.btn} ${s.btnDanger}`} disabled={pending} onClick={() => series('end')}>End series</button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {view.work.map(w => {
            const live = w.editable && mine?.idx === w.idx && work
            const ww = live ? work : w.work
            return (
              <div key={w.idx}>
                <div className={s.secHead}>
                  <span className={s.secIcon} aria-hidden="true">🎯</span>
                  <span className={s.secTitle}>Stage {w.idx + 1} · {w.name}</span>
                  <span className={`${s.tag}${w.badgeTone === 'done' ? ` ${s.tagDone}` : ''}`}>{w.badge}</span>
                </div>
                <div className={`${s.workBox}${live ? ` ${s.workBoxOpen}` : ''}`}>
                  {w.form.map(f => {
                    const v = ww.vals[f.label]
                    if (f.type === 'Note') return <div key={f.label} className={s.fNote}>{f.label}</div>
                    return (
                      <div key={f.label} className={s.f}>
                        <span className={s.fLabel}>{f.label} <span className={s.fType}>· {f.type}</span></span>
                        {f.type === 'File' ? (
                          <StageFiles files={ww.files.filter(x => x.field === f.label)} live={!!live} busy={pending} label={f.label}
                            onPick={list => sendFiles(f.label, list)} onRemove={dropFile} />
                        ) : null}
                        {INPUT_TYPES.has(f.type) || (f.type === 'File' && (live || (typeof v === 'string' && v) || !ww.files.some(x => x.field === f.label))) ? (
                          !live && f.type === 'File' && typeof v === 'string' && isLink(v) ? (
                            <a className={s.fileChip} href={v} target="_blank" rel="noreferrer">📎 <span>{v}</span></a>
                          ) : (
                            <input
                              className={s.fInput}
                              type={f.type === 'Number' ? 'number' : f.type === 'Date' ? 'date' : f.type === 'File' ? 'url' : 'text'}
                              value={typeof v === 'string' ? v : ''}
                              disabled={!live || pending}
                              placeholder={live ? (f.type === 'File' ? 'or a link — https://…' : 'Fill in…') : '—'}
                              onChange={e => live && setWork(cw => (cw ? { ...cw, vals: { ...cw.vals, [f.label]: e.target.value } } : cw))}
                              onBlur={e => live && saveVal(f, e.target.value.trim())}
                            />
                          )
                        ) : f.type === 'Checkbox' ? (
                          <button
                            type="button"
                            className={`${s.box}${v === true ? ` ${s.boxOn}` : ''}`}
                            disabled={!live || pending}
                            aria-pressed={v === true}
                            aria-label={f.label}
                            onClick={() => {
                              if (!live) return
                              const next = v !== true
                              setWork(cw => (cw ? { ...cw, vals: { ...cw.vals, [f.label]: next } } : cw))
                              saveVal(f, next)
                            }}
                          >
                            {v === true ? '✓' : ''}
                          </button>
                        ) : f.type === 'Table' ? (
                          <span className={s.tableSum}>▤ {(f.cols ?? []).map(c => c.name).join(' · ') || 'Table'}</span>
                        ) : null}
                      </div>
                    )
                  })}
                  {w.bare ? (
                    <>
                      <div className={s.f}>
                        <span className={s.fLabel}>What you did</span>
                        <textarea
                          className={s.fArea}
                          rows={3}
                          maxLength={4000}
                          value={ww.notes}
                          disabled={!live || pending}
                          placeholder={live ? 'e.g. Updated price on the banner, exported 1080×1350' : '—'}
                          onChange={e => live && setWork(cw => (cw ? { ...cw, notes: e.target.value } : cw))}
                          onBlur={() => live && saveNotes()}
                        />
                      </div>
                      <div className={s.f}>
                        <span className={s.fLabel}>Files</span>
                        <div className={s.files}>
                          {ww.links.map((l, k) => (
                            <span key={`${l.url}${k}`} className={s.fileChip}>
                              <a href={l.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', gap: 6, minWidth: 0 }}>📎 <span>{l.label || l.url}</span></a>
                              {live ? <button type="button" className={s.fileX} aria-label="Remove link" onClick={() => setLinks(ww.links.filter((_, j) => j !== k))}>×</button> : null}
                            </span>
                          ))}
                          {!ww.links.length && !live && !ww.files.some(x => !x.field) ? <span className={s.noFiles}>No files</span> : null}
                        </div>
                        <StageFiles files={ww.files.filter(x => !x.field)} live={!!live} busy={pending} label={w.name}
                          onPick={list => sendFiles(null, list)} onRemove={dropFile} />
                        {live ? (
                          <div className={s.linkAdd}>
                            <input
                              className={`${s.fInput} ${s.linkInput}`}
                              type="url"
                              value={linkDraft}
                              placeholder="https://… (a link to the file)"
                              onChange={e => setLinkDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  addLink()
                                }
                              }}
                            />
                            <button type="button" className={s.dashBtn} disabled={!linkDraft.trim()} onClick={addLink}>+ Add link</button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}

          {!view.isSeries ? (
            <>
              <div className={s.freeRule}>
                <div className={s.freeLine} />
                <span className={s.freeLabel}>Free space</span>
                <div className={s.freeLine} />
              </div>
              <div className={s.free}>
                {free.map(b => (
                  <div key={b.id} className={s.block}>
                    <div className={s.blockBody}>
                      {b.type === 'heading' ? (
                        <input className={s.blockHeading} value={b.text} placeholder="Heading" readOnly={!canFree} maxLength={2000}
                          onChange={e => editBlock(b.id, { text: e.target.value })} onBlur={() => canFree && void putBlock(b)} />
                      ) : b.type === 'text' ? (
                        <textarea className={s.blockText} rows={2} value={b.text} placeholder="Write something…" readOnly={!canFree} maxLength={2000}
                          onChange={e => editBlock(b.id, { text: e.target.value })} onBlur={() => canFree && void putBlock(b)} />
                      ) : b.type === 'check' ? (
                        <div className={s.blockCheck}>
                          <button
                            type="button"
                            className={`${s.box}${b.done ? ` ${s.boxOn}` : ''}`}
                            disabled={!canFree}
                            aria-pressed={b.done}
                            aria-label="Done"
                            onClick={() => {
                              const next = { ...b, done: !b.done }
                              editBlock(b.id, { done: next.done })
                              void putBlock(next)
                            }}
                          >
                            {b.done ? '✓' : ''}
                          </button>
                          <input className={`${s.blockCheckText}${b.done ? ` ${s.blockDone}` : ''}`} value={b.text} placeholder="To-do" readOnly={!canFree} maxLength={2000}
                            onChange={e => editBlock(b.id, { text: e.target.value })} onBlur={() => canFree && void putBlock(b)} />
                        </div>
                      ) : (
                        <div className={s.blockDivider} />
                      )}
                    </div>
                    {canFree ? (
                      <button type="button" className={s.blockX} title="Remove" aria-label="Remove" onClick={() => {
                        setFree(cur => cur.filter(x => x.id !== b.id))
                        void putBlock(b, 'remove')
                      }}>✕</button>
                    ) : null}
                  </div>
                ))}
                {canFree ? (
                  <div className={s.freeAdds}>
                    {([['text', '+ Text'], ['heading', '+ Heading'], ['check', '+ Checklist'], ['divider', '+ Divider']] as const).map(([t, label]) => (
                      <button key={t} type="button" className={s.freeAdd} onClick={() => addBlock(t)}>{label}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <aside className={s.trail} aria-label="Audit trail">
          <div className={s.trailHead}>
            <span>Audit trail</span>
            <span className={a.opens}>
              {page.stages.length ? <button type="button" className={a.open} onClick={() => setSheet('map')}>Map</button> : null}
              <button type="button" className={a.open} onClick={() => setSheet('audit')}>Formal log</button>
            </span>
          </div>
          {lines.map(l => (
            <div key={l.id} className={s.trailLine}>
              <div className={s.trailTime}>{l.t}</div>
              {l.text}
            </div>
          ))}
        </aside>
        {sheet ? (
          <ProjectSheet project={page.project.id} track={page.project.trackId} title={page.project.title} page={page} tab={sheet} onClose={() => setSheet(null)} />
        ) : null}
      </div>

      {modal && cur ? (
        <div className={s.scrim} onClick={() => !pending && setModal(false)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Request changes" onClick={e => e.stopPropagation()}>
            <div>
              <div className={s.dialogTitle}>Request changes</div>
              <div className={s.dialogSub}>{cur.name} v{cur.ver} · back to {sendsBackTo ? `${sendsBackTo.name} (${nameOf(page.team, sendsBackTo.owner)})` : nameOf(page.team, cur.owner)}</div>
            </div>
            <textarea className={s.dialogArea} value={reason} maxLength={1000} autoFocus placeholder="What should change? (required)" onChange={e => setReason(e.target.value)} />
            <div className={s.dialogBtns}>
              <button type="button" className={s.dialogBtn} onClick={() => setModal(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${s.dialogBtn} ${s.dialogOk}`} disabled={pending || !reason.trim()} onClick={() => decide(false)}>Send back</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className={s.toast} role="status">{toast}</div> : null}
    </div>
  )
}
