'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { planMktDeliverable } from '@/lib/marketing/actions'
import { groupLabel, groupTone, sameGroup } from '@/lib/marketing/groups'
import {
  datesLabel, firstStart, planChanged, planCrew, planDates, planFromTask, planOpen, planPayload, planProblems, planSummary,
  reasonsNeeded, REASON_MAX, REASON_MIN, stageEditable, unassigned, type PlanDraft, type PlanStage,
} from '@/lib/marketing/plan'
import type { MktTaskPage, PlanAppr } from '@/lib/marketing/task'
import type { PickPerson } from '@/lib/marketing/tasks'
import { personBg } from '../builder/people'
import s from './plan.module.css'

// A deliverable's Assignment Plan (`Assignment Plan.dc.html`; ②b-2a — the user's answer 10): each stage's person (the
// manager assigns, or 🔓 the stage before picks from its candidates), its approvals (a manager, or the PIC on the
// link — always locked, never passed on), its working days and dates, whether it splits into subtasks; the day it
// starts; the summary — days, PIC approvals, start and finish, the holidays skipped, who is on it — and Save. Once the
// deliverable has opened, a stage done is locked, a change of hands asks why, and the stage open now is the new
// person's to Accept again (the database says the same: mkt_deliverable_plan).

const TONE_TAG: Record<string, string> = {
  content: s.tag_content, social: s.tag_social, design: s.tag_design, ads: s.tag_ads, brand: s.tag_brand, manager: s.tag_manager, none: s.tag_none,
}

type Menu = { i: number; k: 'a' | 'p' } | null

export default function AssignmentPlan({ initial, people, approvers }: { initial: MktTaskPage; people: PickPerson[]; approvers: PickPerson[] }) {
  const [page, setPage] = useState(initial)
  const saved = useMemo(() => planFromTask(page), [page])
  const open = planOpen(page)
  const planning = page.project.status === 'planning'
  const holidays = useMemo(() => new Set(page.holidays.map(h => h.day)), [page.holidays])
  const [draft, setDraft] = useState<PlanDraft>(() => {
    const d = planFromTask(initial)
    return d.start ? d : { ...d, start: firstStart(initial.today, new Set(initial.holidays.map(h => h.day))) }
  })
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [menu, setMenu] = useState<Menu>(null)
  const [ask, setAsk] = useState<{ i: number; who: string; reason: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, start] = useTransition()
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const p = page.project
  const pic = page.sub?.pic || p.pic
  const nameOf = (id: string | null | undefined) => (id ? people.find(x => x.id === id)?.first ?? approvers.find(x => x.id === id)?.first ?? 'someone' : '')
  const person = (id: string | null | undefined) => people.find(x => x.id === id) ?? approvers.find(x => x.id === id)
  const dates = planDates(draft, holidays)
  const summary = planSummary(draft, page.holidays)
  const crew = planCrew(draft, page.team, pic)
  const needed = reasonsNeeded(saved, draft, open)
  const problems = planProblems(saved, draft, open, page.today, reasons)
  const changed = planChanged(saved, draft, planning)
  const canSave = !pending && changed && problems.length === 0 && !justSaved

  const say = (t: string) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }
  const upd = (i: number, patch: Partial<PlanStage>) => {
    setDraft(d => ({ ...d, stages: d.stages.map(x => (x.idx === i ? { ...x, ...patch } : x)) }))
    setMenu(null)
    setJustSaved(false)
  }
  const assign = (i: number, who: string | null) => {
    const was = saved.stages[i]
    // Mid-way, a stage that had its person changes hands with a reason.
    if (open && who && was?.owner && was.owner !== who) {
      setMenu(null)
      setAsk({ i, who, reason: reasons[i] ?? '' })
      return
    }
    if (open && was?.owner === who) setReasons(r => { const n = { ...r }; delete n[i]; return n })
    upd(i, { owner: who })
  }
  const save = () => {
    if (!canSave) return
    const payload = planPayload(draft, reasons, needed)
    const notify = crew.filter(c => !c.pic).length
    start(async () => {
      const r = await planMktDeliverable(p.id, payload)
      if (!r.ok) return say(r.reason)
      if (r.page) {
        setPage(r.page)
        setDraft(planFromTask(r.page))
      }
      setReasons({})
      setJustSaved(true)
      if (open) say(`Plan updated · ${r.reassigned} change${r.reassigned === 1 ? '' : 's'} of hands logged · new people told`)
      else {
        const first = nameOf(draft.stages[0]?.owner)
        say(`${notify} ${notify === 1 ? 'person' : 'people'} on the plan told · ${first} has it to Accept on ${summary.starts}`)
      }
    })
  }

  const statusChip = planning
    ? { label: 'Not planned', cls: s.chipDraft }
    : open
      ? { label: `In progress · Stage ${p.cur + 1} of ${page.stages.length}`, cls: s.chipWait }
      : { label: `Planned · starts ${summary.starts}`, cls: s.chipDone }
  const saveNote = problems[0] ?? (justSaved ? (open ? 'Saved · everyone changed was told' : 'Saved · everyone on the plan was told')
    : !changed ? 'Nothing changed yet' : open ? `${needed.length} change${needed.length === 1 ? '' : 's'} of hands with reasons`
      : `Notifies ${crew.filter(c => !c.pic).length} people`)

  return (
    <div className={s.page} onClick={() => menu && setMenu(null)}>
      <div className={s.crumbs}>
        <Link href="/marketing/projects" className={s.crumbLink}>← Projects</Link>
        <span>/</span>
        {p.parentProject ? (
          <>
            <Link href={`/marketing/projects/${encodeURIComponent(p.parentProject.trackId)}`} className={s.crumbLink}>{p.parentProject.title}</Link>
            <span>/</span>
          </>
        ) : null}
        <Link href={`/marketing/projects/${encodeURIComponent(p.trackId)}`} className={s.crumbLink}>{p.title}</Link>
        <span>/</span>
        <span>Assignment plan</span>
      </div>

      <div className={s.head}>
        <div className={s.headLeft}>
          <div className={s.track}>{p.trackId}</div>
          <div className={s.title}>{p.title}</div>
          <div className={s.headChips}>
            <span className={`${s.chip} ${statusChip.cls}`}><span className={s.chipDot} aria-hidden="true" />{statusChip.label}</span>
            {p.workflow ? <span className={s.muted}>Workflow template · {p.workflow} ({page.stages.length} stage{page.stages.length === 1 ? '' : 's'})</span> : null}
          </div>
        </div>
        {p.locked ? (
          <span className={`${s.lock} ${s.lockOn}`} title="Workflow setting from the Workflow Builder">
            <span className={s.lockTrack}><span className={s.lockKnob} /></span>
            <span>🔒 Locked workflow</span>
          </span>
        ) : null}
      </div>

      {p.locked ? <div className={s.note}>Locked workflow: every stage is assigned by MM. &ldquo;Picked by previous stage&rdquo; and subtasks are turned off.</div> : null}
      {open ? <div className={s.note}>Changing a plan mid-way: finished stages are locked. Every change of hands needs a reason, and a new person on the current stage has to Accept again.</div> : null}

      <div className={s.grid}>
        <div className={s.stages}>
          {draft.stages.map((st, i) => {
            const was = saved.stages[i]
            const ed = stageEditable(was ?? st, open)
            const done = was?.status === 'done'
            const current = open && i === p.cur && !done
            const un = unassigned(st)
            const picked = !st.owner && !un
            const owner = person(st.owner)
            const tone = groupTone(st.dept)
            const ranked = [...people].sort((x, y) => Number(sameGroup(y.group, st.dept)) - Number(sameGroup(x.group, st.dept)))
            const canPick = st.mode === 'prev' && i > 0 && !p.locked && !open
            const pickWhy = p.locked ? '🔓 Picked by previous stage is off — Locked workflow'
              : i === 0 ? 'The first stage is always assigned by MM'
                : st.mode !== 'prev' ? 'This stage is the manager’s to assign (its template says so)'
                  : 'Mid-way changes must name a person'
            const pool = st.cands.map(c => nameOf(c)).filter(Boolean).join(' / ') || 'its candidates'
            const reason = needed.includes(i) ? (reasons[i] ?? '').trim() : ''
            const note = reason
              ? `Changed from ${nameOf(was?.owner)}: “${reason}”${current ? ` · ${nameOf(st.owner)} must Accept again` : ''}`
              : picked ? `${i > 0 ? nameOf(draft.stages[i - 1].owner) || 'The stage before' : 'The stage before'} chooses when they finish` : ''
            const state = done ? { label: 'Done', cls: s.chipDone } : current ? { label: was?.status === 'review' ? 'Waiting for its approval' : 'In progress', cls: s.chipWait } : null
            const apprOpts: { a: PlanAppr; icon: string; label: string }[] = [
              ...approvers.filter(x => !st.appr.some(a => a.kind === 'person' && a.staff === x.id)).map(x => ({ a: { kind: 'person', staff: x.id } as PlanAppr, icon: '👤', label: x.first })),
              ...(st.appr.some(a => a.kind === 'pic') ? [] : [{ a: { kind: 'pic' } as PlanAppr, icon: '🔗', label: `PIC (${pic || 'the PIC'}) via link` }]),
            ]
            const setLevel = (k: number | null, a: PlanAppr) => {
              const at = k ?? st.appr.findIndex(x => x.kind === 'assign')
              upd(i, { appr: at >= 0 ? st.appr.map((x, j) => (j === at ? a : x)) : [...st.appr, a] })
            }
            return (
              <div key={st.idx} className={s.stageRow}>
                <div className={s.rail}>
                  <span className={`${s.num}${done ? ` ${s.numDone}` : un ? ` ${s.numUn}` : current ? ` ${s.numCur}` : ''}`}>{done ? '✓' : i + 1}</span>
                  {i < draft.stages.length - 1 ? <span className={s.railLine} /> : null}
                </div>
                <section className={`${s.card}${un ? ` ${s.cardUn}` : current ? ` ${s.cardCur}` : ''}${done ? ` ${s.cardDone}` : ''}`} aria-label={`Stage ${i + 1} · ${st.name}`}>
                  <div className={s.cardHead}>
                    <span className={s.stageName}>{st.name}</span>
                    {st.dept ? <span className={`${s.tag} ${TONE_TAG[tone]}`} title={st.dept}>{groupLabel(st.dept)}</span> : null}
                    <span className={s.grow} />
                    {state ? <span className={`${s.chip} ${state.cls}`}><span className={s.chipDot} aria-hidden="true" />{state.label}</span> : null}
                    {un ? <span className={s.unassigned}>Unassigned</span> : null}
                  </div>
                  <div className={s.cardBody}>
                    <div className={s.col}>
                      <span className={s.label}>Assignee</span>
                      <button type="button" className={`${s.field}${un ? ` ${s.fieldUn}` : ''}`} disabled={!ed.people} aria-expanded={menu?.i === i && menu.k === 'a'}
                        onClick={e => { e.stopPropagation(); setMenu(m => (m?.i === i && m.k === 'a' ? null : { i, k: 'a' })) }}>
                        {owner ? (
                          <>
                            <span className={s.av} style={{ background: personBg(owner) }}>{owner.first.charAt(0).toUpperCase()}</span>
                            <span className={s.person}>{owner.first}</span>
                            {st.extra ? <span className={s.extra}>{st.extra}</span> : null}
                            <span className={s.lockIcon} aria-hidden="true">🔒</span>
                          </>
                        ) : picked ? (
                          <>
                            <span className={s.lockIcon} aria-hidden="true">🔓</span>
                            <span className={s.pickedText}><span className={s.pickedHead}>Picked by previous stage</span><br /><span className={s.muted}>from {pool}</span></span>
                          </>
                        ) : <span className={s.choose}>Choose someone…</span>}
                        <span className={s.grow} />
                        {ed.people ? <span className={s.caret}>▼</span> : null}
                      </button>
                      {note ? <span className={`${s.fieldNote}${current && reason ? ` ${s.fieldNoteWait}` : ''}`}>{note}</span> : null}
                      {menu?.i === i && menu.k === 'a' ? (
                        <div className={s.menu} role="menu" onClick={e => e.stopPropagation()}>
                          <div className={s.menuHead}>Assign to · {st.dept ? groupLabel(st.dept) : 'anyone'} first</div>
                          {ranked.map(x => (
                            <button key={x.id} type="button" role="menuitem" className={`${s.opt}${st.owner === x.id ? ` ${s.optOn}` : ''}`} onClick={() => assign(i, x.id)}>
                              <span className={s.av} style={{ background: personBg(x) }}>{x.first.charAt(0).toUpperCase()}</span>
                              <span className={s.optName}>{x.first}</span>
                              <span className={s.optLoad}>· {x.hint.split(' · ').at(-1)}</span>
                              <span className={s.grow} />
                              <span className={s.optRole}>{x.group || '—'}</span>
                            </button>
                          ))}
                          {canPick ? (
                            <>
                              <div className={s.menuLine} />
                              <button type="button" role="menuitem" className={s.opt} onClick={() => assign(i, null)}>
                                <span>🔓</span><span><span className={s.optName}>Previous stage picks</span> <span className={s.muted}>from {pool}</span></span>
                              </button>
                            </>
                          ) : <div className={s.menuWhy}>{pickWhy}</div>}
                        </div>
                      ) : null}
                    </div>

                    <div className={s.col}>
                      <span className={s.label}>Approver</span>
                      <div className={s.apprs}>
                        {!st.appr.length ? <span className={s.noAppr}>— No approval</span> : null}
                        {st.appr.map((a, k) => (
                          <span key={`${a.kind}${a.kind === 'person' ? a.staff : ''}${k}`} className={s.apprWrap}>
                            {k > 0 ? <span className={s.arrow}>→</span> : null}
                            {a.kind === 'assign' ? (
                              <button type="button" className={`${s.appr} ${s.apprPick}`} disabled={!ed.people}
                                onClick={e => { e.stopPropagation(); setMenu({ i, k: 'p' }) }}>👤 Pick who approves</button>
                            ) : (
                              <span className={s.appr} title="Approvers are always locked">
                                <span>{a.kind === 'pic' ? '🔗' : '👤'}</span>
                                <span className={s.apprName}>{a.kind === 'pic' ? `PIC · ${pic || 'the PIC'}` : nameOf(a.staff)}</span>
                                <span className={s.lockSmall} aria-hidden="true">🔒</span>
                                {ed.people ? (
                                  <button type="button" className={s.apprX} aria-label={`Remove ${a.kind === 'pic' ? 'the PIC' : nameOf(a.staff)}`}
                                    onClick={() => upd(i, { appr: st.appr.filter((_, j) => j !== k) })}>×</button>
                                ) : null}
                              </span>
                            )}
                          </span>
                        ))}
                        {ed.people && st.appr.length < 3 && !st.appr.some(a => a.kind === 'assign') ? (
                          <button type="button" className={s.addLevel} onClick={e => { e.stopPropagation(); setMenu(m => (m?.i === i && m.k === 'p' ? null : { i, k: 'p' })) }}>+ Level</button>
                        ) : null}
                      </div>
                      {menu?.i === i && menu.k === 'p' ? (
                        <div className={`${s.menu} ${s.menuNarrow}`} role="menu" onClick={e => e.stopPropagation()}>
                          {apprOpts.map(o => (
                            <button key={o.label} type="button" role="menuitem" className={s.opt} onClick={() => setLevel(null, o.a)}>
                              <span>{o.icon}</span>{o.label}
                            </button>
                          ))}
                          <div className={s.menuWhy}>Approvers are always 🔒 and can&rsquo;t be passed on.</div>
                        </div>
                      ) : null}
                    </div>

                    <div className={s.col}>
                      <span className={s.label}>SLA · est. dates</span>
                      <div className={s.slaRow}>
                        <div className={s.stepper}>
                          {ed.days ? <button type="button" className={s.stepBtn} aria-label="One day less" onClick={() => upd(i, { sla: Math.max(1, st.sla - 1) })}>−</button> : null}
                          <span className={s.slaNum}>{st.sla}d</span>
                          {ed.days ? <button type="button" className={s.stepBtn} aria-label="One day more" onClick={() => upd(i, { sla: Math.min(30, st.sla + 1) })}>+</button> : null}
                        </div>
                        <span className={s.small}>working days</span>
                      </div>
                      <span className={s.dates}>{datesLabel(dates[i])}</span>
                    </div>

                    <div className={s.col}>
                      <span className={s.label}>Subtasks</span>
                      <button type="button" className={`${s.split}${st.split ? ` ${s.splitOn}` : ''}`} disabled={p.locked || !ed.split}
                        title={p.locked ? 'Locked workflow: no subtasks' : 'Allow this stage to split into subtasks'}
                        aria-pressed={st.split} onClick={() => upd(i, { split: !st.split })}>
                        {st.split ? '✓ Yes' : '✗ No'}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )
          })}
        </div>

        <aside className={s.side}>
          <div className={s.sideCard}>
            <div className={s.label}>Summary</div>
            <div className={s.figures}>
              <div><div className={s.figure}>{summary.days}</div><div className={s.figureLabel}>working days</div></div>
              <div><div className={s.figure}>{summary.pic}</div><div className={s.figureLabel}>PIC approval{summary.pic === 1 ? '' : 's'}</div></div>
            </div>
            <div className={s.facts}>
              <span className={s.muted}>Starts</span>
              {open ? <span className={s.factMono}>{summary.starts}</span> : (
                <input type="date" className={s.dateInput} aria-label="Starts" value={draft.start} min={page.today}
                  onChange={e => { setDraft(d => ({ ...d, start: e.target.value })); setJustSaved(false) }} />
              )}
              <span className={s.muted}>Est. finish</span><span className={`${s.factMono} ${s.factStrong}`}>{summary.finishes}</span>
              <span className={s.muted}>Internal approvals</span><span className={s.factMono}>{summary.internal}</span>
            </div>
            <div className={s.skips}>Skips weekends and Selangor&rsquo;s public holidays: {summary.skipped}</div>
            <div className={s.crewBox}>
              <div className={s.label}>On this plan</div>
              <div className={s.crew}>
                {crew.length ? crew.map(c => (
                  <span key={c.id} className={s.crewChip}>
                    <span className={s.crewAv} style={{ background: c.pic ? 'rgb(var(--mk-surface-2))' : personBg(person(c.id)) }}>{c.name.charAt(0).toUpperCase()}</span>{c.name}
                  </span>
                )) : <span className={s.muted}>Nobody yet</span>}
              </div>
            </div>
          </div>
          <div className={s.saveCard}>
            <button type="button" className={s.save} disabled={!canSave} onClick={save}>
              {justSaved ? 'Plan saved ✓' : planning ? 'Save plan' : 'Save changes'}
            </button>
            <span className={`${s.saveNote}${problems.length ? ` ${s.saveNoteRed}` : ''}`}>{saveNote}</span>
          </div>
        </aside>
      </div>

      {ask ? (
        <div className={s.backdrop} onClick={() => setAsk(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label={`Reassign ${draft.stages[ask.i].name}`} onClick={e => e.stopPropagation()}>
            <div>
              <div className={s.dialogTitle}>Reassign {draft.stages[ask.i].name}</div>
              <div className={s.dialogSub}>
                {nameOf(saved.stages[ask.i]?.owner)} → {nameOf(ask.who)}{ask.i === p.cur ? ` · ${nameOf(ask.who)} must Accept again` : ''}
              </div>
            </div>
            <label className={s.dialogField}>
              <span className={s.label}>Reason (required)</span>
              <textarea className={s.textarea} value={ask.reason} maxLength={REASON_MAX} placeholder="e.g. Ali is on MC until Friday"
                onChange={e => setAsk(a => (a ? { ...a, reason: e.target.value } : a))} />
            </label>
            <div className={s.dialogBtns}>
              <button type="button" className={s.btn} onClick={() => setAsk(null)}>Cancel</button>
              <button type="button" className={s.btnOk} disabled={ask.reason.trim().length < REASON_MIN}
                onClick={() => {
                  setReasons(r => ({ ...r, [ask.i]: ask.reason.trim() }))
                  upd(ask.i, { owner: ask.who })
                  setAsk(null)
                }}>Reassign</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className={s.toast} role="status">{toast}</div> : null}
    </div>
  )
}
