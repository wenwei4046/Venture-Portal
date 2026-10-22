'use client'

import { useMemo, useState } from 'react'
import { longDay, type MktDept } from '@/lib/marketing/board'
import { DEPTS, MAX_APPROVALS, MAX_SLA, MAX_STAGES, moveStage, newStage, removeStage, stageDates, stageProblems, type DraftStage } from '@/lib/marketing/tasks'
import FieldsEditor from '../builder/FieldsEditor'
import { TEAM_BG, type BuilderPerson } from '../builder/people'
import StageList, { Fact } from '../builder/StageList'
import b from '../builder/builder.module.css'

export type { BuilderPerson }

// New Project's stages — the handoff's Workflow Builder in its quick mode (`Workflow Builder.dc.html`, quick): the
// stages in order (drag to move them), each with its person, its approval levels (Marketing's managers, at most three),
// its working days and the day it is due, where changes go back to, and the fields it fills in; the selected stage's
// settings beside them; the total, when it finishes and what is missing at the foot.

export default function StageBuilder({
  stages,
  onChange,
  people,
  approvers,
  me,
  start,
  holidays,
}: {
  stages: DraftStage[]
  onChange: (next: DraftStage[]) => void
  people: BuilderPerson[]
  /** Who may be picked to approve: Marketing's managers. */
  approvers: BuilderPerson[]
  me: string | null
  /** The day the first stage starts (today, or a recurring task's first run). */
  start: string
  holidays: ReadonlySet<string>
}) {
  const [sel, setSel] = useState(0)
  const [dd, setDd] = useState<string | null>(null)

  const at = Math.min(sel, stages.length - 1)
  const st = stages[at]
  const dates = useMemo(() => stageDates(start, stages.map(x => x.sla), holidays), [start, stages, holidays])
  const name = (id: string | null) => {
    if (!id) return null
    const p = people.find(x => x.id === id) ?? approvers.find(x => x.id === id)
    return p ? (id === me ? `Me (${p.first})` : p.first) : '—'
  }
  const apprText = (x: DraftStage) => (x.appr.length ? x.appr.map(a => `👤 ${name(a)}`).join(' → ') : '— No approval')
  const upd = (patch: Partial<DraftStage>) => onChange(stages.map((x, i) => (i === at ? { ...x, ...patch } : x)))
  const toggle = (k: string) => setDd(cur => (cur === k ? null : k))
  const problems = stageProblems(stages)
  const total = stages.reduce((n, x) => n + x.sla, 0)

  const pickWho = (id: string) => {
    const p = people.find(x => x.id === id)
    const team = p?.team && (DEPTS as readonly string[]).includes(p.team) ? (p.team as MktDept) : st.dept
    upd({ who: id, dept: team })
    setDd(null)
  }
  const setLevel = (li: number, id: string | null) => {
    setDd(null)
    if (id === null) return upd({ appr: [] })
    const next = [...st.appr]
    next[li] = id
    upd({ appr: next })
  }
  const nextApprover = st ? approvers.find(a => !st.appr.includes(a.id)) : undefined

  return (
    <div className={b.wb} onClick={() => dd && setDd(null)}>
      <div className={b.wbHead}>
        <span className={b.wbTitle}>Stages</span>
        <div className={b.wbTabs}>
          <button type="button" className={`${b.wbTab} ${b.wbTabOn}`}>Workflow stages</button>
          <button type="button" className={`${b.wbTab} ${b.wbTabOff}`} disabled title="Not on quick tasks yet">Canvas template</button>
        </div>
      </div>
      <div className={b.wbGrid}>
        <div className={b.wbList}>
          <StageList
            stages={stages}
            selected={at}
            onSelect={setSel}
            onMove={(from, to) => {
              onChange(moveStage(stages, from, to))
              setSel(to)
            }}
            onAdd={stages.length < MAX_STAGES ? () => {
              onChange([...stages, newStage(stages[stages.length - 1])])
              setSel(stages.length)
            } : null}
            facts={(x, i) => (
              <>
                <Fact k="Who" missing={!x.who}>{x.who ? name(x.who) : '⚠ Pick a person'}</Fact>
                <Fact k="SLA" mono>{x.sla}d</Fact>
                {dates[i]?.dueOn ? <Fact k="Due">{longDay(dates[i].dueOn)}</Fact> : null}
                <Fact k="Approval">{apprText(x)}</Fact>
              </>
            )}
          />
        </div>

        <div className={b.wbPanel}>
          {st ? (
            <div className={b.wbSettings} key={st.key}>
              <div className={b.wbSetHead}>
                <span className={b.wbSetLabel}>Stage {at + 1} settings</span>
                {stages.length > 1 ? (
                  <button
                    type="button"
                    className={b.wbRemove}
                    onClick={() => {
                      onChange(removeStage(stages, at))
                      setSel(Math.max(0, at - 1))
                    }}
                  >
                    Remove stage
                  </button>
                ) : null}
              </div>

              <label className={b.field}>
                <span className={b.wbQ}>What&apos;s this stage called?</span>
                <input className={b.input} value={st.name} maxLength={80} onChange={e => upd({ name: e.target.value })} />
              </label>

              <div className={b.field}>
                <span className={b.wbQ}>Who does it?</span>
                <div className={b.wbDD}>
                  <button
                    type="button"
                    className={`${b.wbDDBtn}${dd === 'who' ? ` ${b.wbDDBtnOn}` : ''}${st.who ? '' : ` ${b.wbDDBtnMiss}`}`}
                    onClick={e => {
                      e.stopPropagation()
                      toggle('who')
                    }}
                    aria-expanded={dd === 'who'}
                  >
                    <span className={b.wbDDIcon}>👤</span>
                    <span className={b.wbDDText}>
                      <span className={b.wbDDLabel} style={{ display: 'block' }}>{st.who ? name(st.who) : 'Pick a person…'}</span>
                      <span className={b.wbDDHint} style={{ display: 'block' }}>{st.who ? people.find(p => p.id === st.who)?.hint ?? '' : 'Required'}</span>
                    </span>
                    <span className={b.wbCaret}>▼</span>
                  </button>
                  {dd === 'who' ? (
                    <div className={b.wbMenu} onClick={e => e.stopPropagation()}>
                      {people.map(p => (
                        <button key={p.id} type="button" className={`${b.wbOpt}${st.who === p.id ? ` ${b.wbOptOn}` : ''}`} onClick={() => pickWho(p.id)}>
                          <span className={b.wbTick}>{st.who === p.id ? '✓' : ''}</span>
                          <span className={b.wbAv} style={{ background: TEAM_BG[p.team ?? 'manager'] }}>{p.first.charAt(0).toUpperCase()}</span>
                          <span className={b.wbOptText}>
                            <span className={b.wbOptLabel} style={{ display: 'block' }}>{p.id === me ? `Me (${p.first})` : p.first}</span>
                            <span className={b.wbOptHint} style={{ display: 'block' }}>{p.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={b.field} style={{ gap: 8 }}>
                <span className={b.wbQ}>Who approves it?</span>
                {(st.appr.length ? st.appr : [null]).map((a, li) => {
                  const key = `appr${li}`
                  const cur = a ? approvers.find(x => x.id === a) : null
                  return (
                    <div key={li} className={b.wbLevel}>
                      <div className={b.wbLevelHead}>
                        <span className={b.wbLevelN}>Level {li + 1}</span>
                        <span className={b.wbLevelLock}>🔒 always locked</span>
                        {li > 0 ? (
                          <button type="button" className={b.wbLevelRemove} onClick={() => upd({ appr: st.appr.filter((_, j) => j !== li) })}>Remove</button>
                        ) : null}
                      </div>
                      <div className={b.wbDD}>
                        <button
                          type="button"
                          className={`${b.wbDDBtn}${dd === key ? ` ${b.wbDDBtnOn}` : ''}`}
                          onClick={e => {
                            e.stopPropagation()
                            toggle(key)
                          }}
                          aria-expanded={dd === key}
                        >
                          {cur ? <span className={b.wbAv} style={{ background: TEAM_BG[cur.team ?? 'manager'] }}>{cur.first.charAt(0).toUpperCase()}</span> : <span className={b.wbDDIcon}>—</span>}
                          <span className={b.wbDDText}><span className={b.wbDDLabel}>{cur ? cur.first : 'No approval'}</span></span>
                          <span className={b.wbCaret}>▼</span>
                        </button>
                        {dd === key ? (
                          <div className={b.wbMenu} onClick={e => e.stopPropagation()}>
                            {li === 0 ? (
                              <button type="button" className={`${b.wbOpt}${!a ? ` ${b.wbOptOn}` : ''}`} onClick={() => setLevel(0, null)}>
                                <span className={b.wbDDIcon}>—</span>
                                <span className={b.wbOptText}><span className={b.wbOptLabel}>No approval</span></span>
                                <span className={b.wbTick}>{!a ? '✓' : ''}</span>
                              </button>
                            ) : null}
                            {approvers.filter(x => x.id === a || !st.appr.includes(x.id)).map(x => (
                              <button key={x.id} type="button" className={`${b.wbOpt}${a === x.id ? ` ${b.wbOptOn}` : ''}`} onClick={() => setLevel(li, x.id)}>
                                <span className={b.wbAv} style={{ background: TEAM_BG[x.team ?? 'manager'] }}>{x.first.charAt(0).toUpperCase()}</span>
                                <span className={b.wbOptText}><span className={b.wbOptLabel}>{x.id === me ? `Me (${x.first})` : x.first}</span></span>
                                <span className={b.wbOptHint}>{x.hint}</span>
                                <span className={b.wbTick}>{a === x.id ? '✓' : ''}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {st.appr.length > 0 && st.appr.length < MAX_APPROVALS && nextApprover ? (
                  <button type="button" className={b.wbAddLevel} onClick={() => upd({ appr: [...st.appr, nextApprover.id] })}>+ Add another approval level</button>
                ) : null}
              </div>

              <div className={b.field}>
                <span className={b.wbQ}>How long?</span>
                <div className={b.wbSla}>
                  <div className={b.wbStepper}>
                    <button type="button" className={b.wbStepBtn} onClick={() => upd({ sla: Math.max(1, st.sla - 1) })} aria-label="One day less">−</button>
                    <span className={b.wbStepN}>{st.sla}</span>
                    <button type="button" className={b.wbStepBtn} onClick={() => upd({ sla: Math.min(MAX_SLA, st.sla + 1) })} aria-label="One day more">+</button>
                  </div>
                  <span className={b.unit}>working days</span>
                </div>
              </div>

              <div className={b.field}>
                <span className={b.wbQ}>If changes are requested, go back to which stage?</span>
                <div className={b.wbBack}>
                  {[{ k: null as number | null, label: 'Stay on this stage' }, ...stages.slice(0, at).map((x, j) => ({ k: j as number | null, label: `${j + 1}. ${x.name}` }))].map(o => (
                    <button key={o.k ?? 'stay'} type="button" className={`${b.wbBackOpt}${st.back === o.k ? ` ${b.wbBackOn}` : ''}`} onClick={() => upd({ back: o.k })}>{o.label}</button>
                  ))}
                </div>
              </div>

              <div className={b.field}>
                <span className={b.wbQ}>What does this stage fill in?</span>
                <FieldsEditor form={st.form} onChange={form => upd({ form })} presetRows={false} stageName={st.name} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className={b.wbFoot}>
        <span className={b.wbFootItem}><span className={b.wbFootK}>Total</span> <strong className={b.wbFootV}>{total} working day{total === 1 ? '' : 's'}</strong></span>
        <span className={b.wbFootRule} />
        <span className={b.wbFootItem}><span className={b.wbFootK}>PIC approves</span> <strong className={b.wbFootV}>0×</strong></span>
        <span className={b.wbFootRule} />
        <span className={b.wbFootItem}><span className={b.wbFootK}>Finishes</span> <strong className={b.wbFootV}>{dates.length ? longDay(dates[dates.length - 1].dueOn) : '—'}</strong></span>
        {problems.map(w => <span key={w} className={b.wbWarn}>⚠️ {w}</span>)}
        {problems.length ? null : <span className={b.wbNoWarn}>No warnings</span>}
      </div>
    </div>
  )
}
