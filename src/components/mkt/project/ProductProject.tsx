'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { beginMktProduct, fillMktMinutes, overrideMktProject, resendMktProject, sendMktMinutes, signMktMinutes, type Done } from '@/lib/marketing/actions'
import {
  bothWaiting, campaignLine, canBeginWork, deliverableProgress, editedAfterApproval, fillPatch, linkUrl, productStatus, productTrail, requiredTally, sendProblems,
  stepsOf, typedCampaign, whatsappUrl, type MinutesDoc, type MinutesEdit, type MinutesValue, type ProductProjectPage,
} from '@/lib/marketing/project'
import { picNames } from '@/lib/marketing/clients'
import { ACCEPT_HOURS, workingHours } from '@/lib/marketing/board'
import { ordinal, trailTime } from '@/lib/marketing/task'
import ProjectSheet from '../audit/ProjectSheet'
import a from '../audit/audit.module.css'
import BillCard from './BillCard'
import Deliverables from './Deliverables'
import MinutesForm from './MinutesForm'
import RunDay, { RUN_DAYS } from './RunDay'
import p from './project.module.css'
import t from '../task/task.module.css'

// A 📦 product project before its work starts (`New Project.dc.html`, steps 2–4): the stepper; the project, for whom
// and on what; the PIC's name and WhatsApp and the product's intake minutes, written with the PIC and saved as they
// are typed (only what changed, never over another's save); the attendees' signatures; the internal meeting notes;
// and at the side where it stands — what is still missing, the tracking link made and shared, the PIC's answer, the
// manager starting before approval — with the trail. Then the work: *Plan assignments →* makes its deliverables (②b-2a),
// listed above the minutes, each planned on its own Assignment Plan. The manager's Billing card under it (②b-2b): the
// amount, when it is billed, *Stop* for a recurring one.

const TONE = { red: t.red, waiting: t.waiting, done: t.done, draft: t.draft } as const

type SaveState = { state: 'saved' | 'saving' } | { state: 'error'; reason: string; stale: boolean }

const intakeOf = (page: ProductProjectPage): MinutesDoc | null => page.minutes.find(m => m.intake) ?? page.minutes[0] ?? null
const editOf = (page: ProductProjectPage): MinutesEdit => {
  const doc = intakeOf(page)
  return { vals: doc?.vals ?? {}, notes: doc?.notes ?? '', pic: page.project.pic, whatsapp: page.project.whatsapp,
    pic2: page.project.pic2, whatsapp2: page.project.whatsapp2 }
}

export default function ProductProject({ initial, can }: { initial: ProductProjectPage; can: { edit: boolean; manage: boolean } }) {
  const [page, setPage] = useState(initial)
  const [edit, setEdit] = useState<MinutesEdit>(() => editOf(initial))
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [pending, start] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [modal, setModal] = useState(false)
  // How long the PIC has been silent, only once in the browser (the server's clock and the browser's differ).
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [page])
  const [logOpen, setLogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  // The second PIC's two fields: shown once named, or once the manager asks for them.
  const [second, setSecond] = useState(() => !!initial.project.pic2)
  const [origin, setOrigin] = useState('')
  // A recurring one's run day, asked as its work starts (②b-2f): today's, the 28th at most.
  const [runAsk, setRunAsk] = useState(false)
  const [runDay, setRunDay] = useState(() => Math.min(Number(initial.today.slice(8, 10)) || 1, 28))

  const pr = page.project
  const doc = intakeOf(page)
  // A campaign's run (④-2b — the user's answer 13): before it, live, or ran — as the intake's Campaign period is typed,
  // else as saved.
  const typed = doc?.intake ? typedCampaign(doc.template.fields, edit.vals) : undefined
  const run = typed === undefined ? pr.campaign : typed
  const campaign = run ? campaignLine(run, page.today) : null
  const editRef = useRef(edit)
  const savedRef = useRef(edit)
  const revRef = useRef(doc?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docId = doc?.id ?? null
  const intake = doc?.intake ?? false

  const say = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  // The save: whatever changed since the last one, one at a time, on the minutes as this page last saw them.
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const now = editRef.current
      const patch = docId ? fillPatch(savedRef.current, now, intake) : null
      // Nothing left to send (a change and its undo before the save went): what is on screen is what is kept.
      if (!docId || !patch) {
        setSave(s => (s.state === 'error' ? s : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await fillMktMinutes(docId, pr.id, revRef.current, patch)
      if (!r.ok) {
        setSave({ state: 'error', reason: r.reason, stale: /since you opened them/.test(r.reason) })
        return false
      }
      revRef.current = r.rev
      savedRef.current = now
      // The page comes back when the PIC must approve again — or when the second PIC changed (their link made or gone).
      if (r.page) setPage(r.page)
      if (r.reapproval) say(`Changed after approval · back to ${picNames(now.pic, now.pic2) || 'the PIC'}`)
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [docId, intake, pr.id, say])

  const change = (next: MinutesEdit) => {
    editRef.current = next
    setEdit(next)
    if (save.state === 'error' && save.stale) return
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  const setVal = (name: string, v: MinutesValue | undefined) => {
    const vals = { ...editRef.current.vals }
    if (v === undefined) delete vals[name]
    else vals[name] = v
    change({ ...editRef.current, vals })
  }

  useEffect(() => {
    setOrigin(window.location.origin)
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || fillPatch(savedRef.current, editRef.current, intake)) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [flush, intake])

  // Each step saves what is typed first, then answers with the project as it now stands.
  const act = (run: () => Promise<Done<{ page: ProductProjectPage | null }>>, done: string, after?: () => void) =>
    start(async () => {
      if (!(await flush())) return say('Not saved — reload before going on')
      const r = await run()
      if (!r.ok) return say(r.reason)
      after?.()
      if (r.page) {
        setPage(r.page)
        const d = intakeOf(r.page)
        if (d) revRef.current = d.rev
      }
      say(done)
    })

  if (!doc) return <div className={p.page}><div className={p.empty}>No minutes on this project</div></div>

  const rules = doc.template.rules
  const writes = can.manage && !doc.locked && pr.status !== 'done' && pr.status !== 'cancelled'
  const stale = save.state === 'error' && save.stale
  const readOnly = !writes || pending || stale
  const picName = picNames(edit.pic, edit.pic2) || 'the PIC'
  // Both PICs sign off (②b-2d-2b): whose approval is in, whom the minutes wait for.
  const halfway = bothWaiting(page)
  const live = { ...doc, vals: edit.vals }
  const pics = { name: edit.pic, whatsapp: edit.whatsapp, name2: edit.pic2, whatsapp2: edit.whatsapp2 }
  const problems = sendProblems(live, pics, page.team)
  const tally = requiredTally(doc, edit.vals, pics)
  const complete = tally.done >= tally.total
  const status = productStatus(pr.status)
  const steps = stepsOf(pr.status, rules.pic)
  const edited = editedAfterApproval(page)
  // Each PIC their own link (2026-10-24 — the user's answer 29), shared with them on WhatsApp.
  const links = [
    { key: 'pic', who: edit.pic.trim(), code: pr.link, whatsapp: edit.whatsapp },
    { key: 'pic2', who: edit.pic2.trim(), code: edit.pic2.trim() ? pr.link2 : null, whatsapp: edit.whatsapp2 },
  ].flatMap(l => {
    if (!l.code) return []
    const url = linkUrl(origin, l.code)
    return [{ ...l, url, wa: whatsappUrl(l.whatsapp, `Hi ${l.who || 'there'}, the minutes of our meeting for ${pr.title} — please review and approve: ${url}`) }]
  })
  const waiting = pr.status === 'waiting_pic' || pr.status === 'changes'
  const lines = productTrail(page)
  const begin = canBeginWork(page)
  const progress = deliverableProgress(page.deliverables)

  const sign = () => act(() => signMktMinutes(doc.id, pr.id), 'Signed')
  const send = () => act(() => sendMktMinutes(doc.id, pr.id, revRef.current), rules.pic ? `Tracking link ready · share it with ${picName}` : 'Minutes complete · approved')
  const resend = () => act(() => resendMktProject(pr.id), `Resent to ${picName}`)
  // The work starts: each action × its quantity a deliverable, each to plan (②b-2a); a recurring one asks its run day
  // first — each month's work made on it after (②b-2f).
  const recurring = pr.product?.kind === 'recurring'
  const beginWork = () => (recurring ? setRunAsk(true) : act(() => beginMktProduct(pr.id), 'Deliverables made · plan each one'))
  const beginRuns = () => act(() => beginMktProduct(pr.id, runDay), `Deliverables made · every month on the ${ordinal(runDay)}`, () => setRunAsk(false))
  const override = () => act(() => overrideMktProject(pr.id, reason.trim()), 'Started before approval · kept in the trail', () => {
    setModal(false)
    setReason('')
  })
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 2000)
    } catch {
      say('Copy it from the box')
    }
  }

  return (
    <div className={p.page}>
      <div className={p.crumbs}>
        <Link href="/marketing/projects" className={p.crumbLink}>← Projects</Link>
        <span>/</span>
        {page.sub ? (
          <>
            <Link href={`/marketing/projects?sub=${encodeURIComponent(page.sub.code)}`} className={p.crumbLink}>{page.sub.name}</Link>
            <span>/</span>
          </>
        ) : null}
        <span className={p.crumbText}>{pr.track}</span>
      </div>

      <div className={p.steps}>
        {steps.map((st, i) => (
          <div key={st.label} className={p.step}>
            <span className={`${p.stepMark}${st.state === 'done' ? ` ${p.stepDone}` : st.state === 'current' ? ` ${p.stepCur}` : ''}`}>{st.state === 'done' ? '✓' : i + 1}</span>
            <span className={`${p.stepLabel}${st.state === 'todo' ? '' : ` ${p.stepLabelOn}`}${st.state === 'current' ? ` ${p.stepLabelCur}` : ''}`}>{st.label}</span>
            {i < steps.length - 1 ? <span className={p.stepLine} /> : null}
          </div>
        ))}
      </div>

      <div className={p.head}>
        <div className={p.headLeft}>
          <div className={p.track}>{pr.track}</div>
          <div className={p.title}>{pr.title}</div>
          <div className={p.who}>
            {page.sub ? (
              <>
                <span className={p.subDot} style={{ background: page.sub.dot }} aria-hidden="true" />
                <span>{page.sub.name}</span>
                <span>·</span>
              </>
            ) : null}
            {pr.product ? (
              <>
                <span>{pr.product.name} v{pr.product.version}</span>
                <span>·</span>
              </>
            ) : null}
            <span>Owner {pr.ownerName ?? '—'}</span>
            {campaign ? (
              <>
                <span>·</span>
                <span className={campaign.live ? p.live : undefined} aria-label="Campaign">📢 {campaign.text}</span>
              </>
            ) : null}
          </div>
        </div>
        {writes || stale ? (
          save.state === 'error' ? (
            <span className={p.notSaved} role="alert">
              Not saved · {save.reason}
              {save.stale ? <button type="button" className={p.reload} onClick={() => window.location.reload()}>Reload</button> : null}
            </span>
          ) : (
            <span className={p.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
          )
        ) : doc.locked ? <span className={p.saved}>🔒 Locked</span> : null}
      </div>

      {pr.status === 'changes' && pr.picReply ? (
        <div className={`${p.banner} ${p.bannerRed}`}>
          <span className={p.bannerDot} aria-hidden="true" />
          <div className={p.bannerText}>
            <div className={p.bannerHead}>Changes requested by {pr.picReply.name || 'the PIC'} (PIC)</div>
            {pr.picReply.reason ? <div className={p.bannerQuote}>“{pr.picReply.reason}”</div> : null}
          </div>
          {pr.picReply.at ? <span className={p.bannerAt}>via link · {trailTime(pr.picReply.at)}</span> : null}
        </div>
      ) : null}
      {edited ? (
        <div className={`${p.banner} ${p.bannerWait}`}>
          <span className={p.bannerDot} aria-hidden="true" />
          <div className={p.bannerText}><strong className={p.bannerStrong}>Edited after approval — needs PIC re-approval.</strong> {edited} changed.</div>
        </div>
      ) : null}

      <div className={p.grid}>
        <div className={p.main}>
          <Deliverables page={page} manage={can.manage} />
          <section className={p.card}>
            <div className={p.cardHead}><span className={p.cardTitle}>Meeting</span></div>
            <div className={p.meeting}>
              <label className={p.field}>
                <span className={p.fieldLabel}>PIC name<span className={p.marks}><span title="Required">⭐</span><span title="The PIC sees it on the link">👁</span></span></span>
                <input className={p.input} value={edit.pic} maxLength={80} readOnly={readOnly} onChange={e => change({ ...editRef.current, pic: e.target.value })} />
              </label>
              <label className={p.field}>
                <span className={p.fieldLabel}>PIC WhatsApp<span className={p.marks}>{rules.pic ? <span title="Required">⭐</span> : null}<span title="Internal only — the PIC never sees it">🔒</span></span></span>
                <input className={`${p.input} ${p.mono}`} value={edit.whatsapp} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" readOnly={readOnly}
                  onChange={e => change({ ...editRef.current, whatsapp: e.target.value })} />
              </label>
              {/* A second PIC (the user's answer 29): their own link; either PIC's answer counts. */}
              {second || edit.pic2 ? (
                <>
                  <label className={p.field}>
                    <span className={p.fieldLabel}>Second PIC<span className={p.marks}><span title="The PICs see it on the link">👁</span></span></span>
                    <input className={p.input} value={edit.pic2} maxLength={80} readOnly={readOnly} onChange={e => change({ ...editRef.current, pic2: e.target.value })} />
                  </label>
                  <label className={p.field}>
                    <span className={p.fieldLabel}>Second PIC WhatsApp<span className={p.marks}>{rules.pic && edit.pic2.trim() ? <span title="Required">⭐</span> : null}<span title="Internal only — the PIC never sees it">🔒</span></span></span>
                    <input className={`${p.input} ${p.mono}`} value={edit.whatsapp2} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" readOnly={readOnly}
                      onChange={e => change({ ...editRef.current, whatsapp2: e.target.value })} />
                  </label>
                </>
              ) : !readOnly ? (
                <button type="button" className={`${p.textBtn} ${p.addPic}`} onClick={() => setSecond(true)}>+ Second PIC</button>
              ) : null}
            </div>
          </section>

          <section className={p.card}>
            <div className={p.cardHead}>
              <span className={p.cardTitle}>{doc.intake ? 'Intake' : doc.title} · {pr.product?.name ?? doc.template.name}</span>
              <span className={p.grow} />
              <span className={p.tplChip}>{doc.template.name} v{doc.template.version}</span>
            </div>
            <div className={p.cardBody}>
              <MinutesForm
                doc={doc}
                vals={edit.vals}
                track={pr.track}
                title={pr.title}
                team={page.team}
                me={can.edit ? page.me : null}
                readOnly={readOnly}
                onVal={setVal}
                onSign={sign}
                signing={pending}
              />
            </div>
          </section>

          <section className={p.card}>
            <div className={p.cardHead}>
              <span className={p.cardTitle}>Meeting notes</span>
              <span className={p.marks}><span title="Internal only — the PIC never sees it">🔒</span></span>
            </div>
            <textarea className={p.notes} rows={5} value={edit.notes} maxLength={4000} readOnly={readOnly} aria-label="Meeting notes"
              onChange={e => change({ ...editRef.current, notes: e.target.value })} />
          </section>
        </div>

        <aside className={p.side}>
          <div className={p.sideCard}>
            <div className={p.sideHead}>
              <span className={p.cardTitle}>{doc.template.name} minutes</span>
              <span className={`${t.pill} ${TONE[status.tone]}`}><span className={t.pillDot} aria-hidden="true" />{status.label}</span>
            </div>

            {pr.status === 'minutes' ? (
              <>
                <div className={p.reqRow}>
                  <span className={p.reqLabel}>Required</span>
                  <span className={`${p.reqCount}${complete ? ` ${p.reqDone}` : ''}`}>{tally.done}/{tally.total}</span>
                </div>
                <div className={p.bar}>
                  <div className={`${p.barFill}${complete ? ` ${p.barDone}` : ''}`} style={{ width: `${tally.total ? Math.round((tally.done / tally.total) * 100) : 100}%` }} />
                </div>
                {can.manage ? (
                  <>
                    <div className={p.sendWrap}>
                      <button type="button" className={p.primary} disabled={pending || problems.length > 0 || save.state === 'error'} onClick={send}>
                        {rules.pic ? 'Generate tracking link' : 'Complete minutes'}
                      </button>
                      {problems.length ? (
                        <div className={p.tip} role="tooltip">
                          <div className={p.tipHead}>Still missing</div>
                          {problems.map(x => <div key={x}>• {x}</div>)}
                        </div>
                      ) : null}
                    </div>
                    {problems.length ? <div className={p.left}>{problems.length} left</div> : null}
                  </>
                ) : null}
              </>
            ) : null}

            {/* The PIC's link: for the minutes they sign off — and, once the work is under way, for the stages they approve (②b-2d). */}
            {links.length && (rules.pic || page.deliverables.length > 0) && pr.status !== 'minutes' ? (
              <div className={p.linkBox}>
                {/* Each PIC their own link (2026-10-24 — the user's answer 29), named when there are two. */}
                {links.map(l => (
                  <div key={l.key} className={p.linkOne}>
                    {links.length > 1 ? <div className={p.linkWho}>{l.who || 'The PIC'}</div> : null}
                    <div className={p.linkUrl}><span>{l.url}</span></div>
                    <div className={p.linkBtns}>
                      <button type="button" className={p.ghost} onClick={() => void copy(l.url)}>{copied === l.url ? 'Copied ✓' : 'Copy link'}</button>
                      {l.wa ? <a className={`${p.ghost} ${p.ghostWide}`} href={l.wa} target="_blank" rel="noreferrer">Share via WhatsApp</a> : null}
                    </div>
                  </div>
                ))}
                {pr.status === 'waiting_pic' && pr.linkSentAt ? (() => {
                  // No reply after 4 working hours: red (2026-10-24 — the user's answer 2, the PIC's wait as a stage's).
                  const hours = now ? workingHours(pr.linkSentAt, now, new Set()) : 0
                  return hours >= ACCEPT_HOURS
                    ? <div className={`${p.wait} ${p.waitLate}`}>Sent {trailTime(pr.linkSentAt)}{halfway ? '' : ' · no reply'} · {Math.floor(hours)} working hours</div>
                    : <div className={p.wait}>Sent {trailTime(pr.linkSentAt)}</div>
                })() : null}
                {halfway ? <div className={p.wait}>{halfway}</div> : null}
                {pr.status === 'changes' && can.manage ? (
                  <button type="button" className={p.primary} disabled={pending} onClick={resend}>Resend to {picName}</button>
                ) : null}
              </div>
            ) : null}

            {page.deliverables.length ? (
              <>
                <div className={p.reqRow}>
                  <span className={p.reqLabel}>Deliverables done</span>
                  <span className={`${p.reqCount}${progress.all && progress.done >= progress.all ? ` ${p.reqDone}` : ''}`}>{progress.done}/{progress.all}</span>
                </div>
                <div className={p.bar}>
                  <div className={`${p.barFill}${progress.all && progress.done >= progress.all ? ` ${p.barDone}` : ''}`}
                    style={{ width: `${progress.all ? Math.round((progress.done / progress.all) * 100) : 0}%` }} />
                </div>
                <RunDay page={page} manage={can.manage} onPage={setPage} say={say} />
              </>
            ) : null}

            {begin && can.manage && pr.status !== 'approved' ? (
              <div className={p.approved}>
                <button type="button" className={p.primary} disabled={pending} onClick={beginWork}>Plan assignments →</button>
              </div>
            ) : null}

            {pr.status === 'approved' ? (
              <div className={p.approved}>
                {can.manage ? <button type="button" className={p.primary} disabled={pending} onClick={beginWork}>Plan assignments →</button> : null}
                <div className={p.wait}>
                  {pr.picReply?.decision === 'approved'
                    ? `Approved by ${pr.picReply.name || 'the PIC'} via link${pr.picReply.at ? ` · ${trailTime(pr.picReply.at)}` : ''}`
                    : doc.completedAt ? `Completed · ${trailTime(doc.completedAt)}` : 'Approved'}
                </div>
              </div>
            ) : null}

            {can.manage && waiting && !pr.override ? (
              <div className={p.overrideRow}>
                <button type="button" className={p.textBtn} disabled={pending} onClick={() => setModal(true)}>Start before approval…</button>
              </div>
            ) : null}
            {pr.override && waiting ? (
              <div className={p.overrideBox}>
                <div className={p.overrideHead}>Override · started before PIC approval</div>
                <div className={p.overrideWhy}>{pr.override.by || 'Somebody'}: “{pr.override.reason}”</div>
                <button type="button" className={p.outline} disabled title="The Assignment Plan comes next">Plan assignments →</button>
              </div>
            ) : null}
          </div>

          {can.manage && page.bill ? <BillCard key={`${page.bill.amount}:${page.bill.until}`} page={page} bill={page.bill} onPage={setPage} say={say} /> : null}

          <div className={p.trail} aria-label="Audit trail">
            <div className={t.trailHead}>
              <span>Audit trail</span>
              <button type="button" className={a.open} onClick={() => setLogOpen(true)}>Formal log</button>
            </div>
            {lines.map(l => (
              <div key={l.key} className={t.trailLine}>
                <div className={t.trailTime}>{l.t}</div>
                {l.text}
              </div>
            ))}
          </div>
        </aside>
      </div>
      {logOpen ? <ProjectSheet project={pr.id} track={pr.track} title={pr.title} page={null} tab="audit" manage={can.manage} onClose={() => setLogOpen(false)} /> : null}

      {modal ? (
        <div className={t.scrim} onClick={() => !pending && setModal(false)}>
          <div className={t.dialog} role="dialog" aria-modal="true" aria-label="Start before PIC approval" onClick={e => e.stopPropagation()}>
            <div>
              <div className={t.dialogTitle}>Start before PIC approval</div>
              <div className={t.dialogSub}>Kept in the audit trail · the PIC still approves</div>
            </div>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Reason (required)</span>
              <textarea className={t.dialogArea} value={reason} maxLength={300} autoFocus placeholder="e.g. Kelvin confirmed by phone; ads must be live by 1 Nov"
                onChange={e => setReason(e.target.value)} />
            </label>
            <div className={t.dialogBtns}>
              <button type="button" className={t.dialogBtn} onClick={() => setModal(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending || reason.trim().length < 5} onClick={override}>Start anyway</button>
            </div>
          </div>
        </div>
      ) : null}
      {runAsk ? (
        <div className={t.scrim} onClick={() => !pending && setRunAsk(false)}>
          <div className={t.dialog} role="dialog" aria-modal="true" aria-label="Its monthly run" onClick={e => e.stopPropagation()}>
            <div>
              <div className={t.dialogTitle}>Every month on the {ordinal(runDay)}</div>
              <div className={t.dialogSub}>Each month’s work made on this day · its plan carried from the month before</div>
            </div>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Run day</span>
              <select className={p.input} value={runDay} onChange={e => setRunDay(Number(e.target.value))}>
                {RUN_DAYS.map(d => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
            </label>
            <div className={t.dialogBtns}>
              <button type="button" className={t.dialogBtn} onClick={() => setRunAsk(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${t.dialogBtn} ${t.dialogOk}`} disabled={pending} onClick={beginRuns}>Start the work</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className={t.toast} role="status">{toast}</div> : null}
    </div>
  )
}
