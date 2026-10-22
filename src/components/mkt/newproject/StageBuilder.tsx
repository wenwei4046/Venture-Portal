'use client'

import { useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import { longDay, type MktDept } from '@/lib/marketing/board'
import {
  COL_TYPES, DEPT_LABEL, DEPTS, FIELD_GLYPH, FIELD_TYPES, MAX_APPROVALS, MAX_SLA, moveStage, newStage, removeStage, stageDates,
  stageProblems, type ColType, type DraftStage, type FieldType, type FormField,
} from '@/lib/marketing/tasks'
import s from './newproject.module.css'

// New Project's stages — the handoff's Workflow Builder in its quick mode (`Workflow Builder.dc.html`, quick): the
// stages in order (drag to move them), each with its person, its approval levels (Marketing's managers, at most three),
// its working days and the day it is due, where changes go back to, and the fields it fills in; the selected stage's
// settings beside them; the total, when it finishes and what is missing at the foot.

export interface BuilderPerson {
  id: string
  first: string
  /** "Social Media · 2 active" */
  hint: string
  team: string | null
}

const TEAM_BG: Record<string, string> = {
  manager: 'var(--mk-team-manager-bg)', content: 'var(--mk-team-content-bg)', social: 'var(--mk-team-social-bg)',
  design: 'var(--mk-team-design-bg)', ads: 'var(--mk-team-ads-bg)', brand: 'var(--mk-team-brand-bg)',
}
const deptStyle = (d: MktDept): CSSProperties => ({ background: `var(--mk-team-${d}-bg)`, color: `var(--mk-team-${d})` })

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
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | 'end' | null>(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('Text')

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

  const drop = (to: number) => {
    if (drag === null) return
    const target = to > drag ? to - 1 : to
    onChange(moveStage(stages, drag, target))
    setSel(target)
    setDrag(null)
    setOver(null)
  }

  const addField = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !fieldDraft.trim() || !st) return
    e.preventDefault()
    const f: FormField = fieldType === 'Table'
      ? { label: fieldDraft.trim(), type: 'Table', cols: [{ name: 'Item', type: 'Text' }, { name: 'Qty', type: 'Number' }, { name: 'Done', type: 'Checkbox' }] }
      : { label: fieldDraft.trim(), type: fieldType }
    upd({ form: [...st.form, f] })
    setFieldDraft('')
  }
  const setField = (j: number, patch: Partial<FormField>) => upd({ form: st.form.map((f, k) => (k === j ? { ...f, ...patch } : f)) })

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
    <div className={s.wb} onClick={() => dd && setDd(null)}>
      <div className={s.wbHead}>
        <span className={s.wbTitle}>Stages</span>
        <div className={s.wbTabs}>
          <button type="button" className={`${s.wbTab} ${s.wbTabOn}`}>Workflow stages</button>
          <button type="button" className={`${s.wbTab} ${s.wbTabOff}`} disabled title="Comes with the builders">Canvas template</button>
        </div>
      </div>
      <div className={s.wbGrid}>
        <div className={s.wbList}>
          <div className={s.wbStages}>
            {stages.map((x, i) => {
              const due = dates[i]?.dueOn
              return (
                <div
                  key={x.key}
                  onDragOver={e => {
                    e.preventDefault()
                    if (over !== i) setOver(i)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    drop(i)
                  }}
                >
                  <div className={`${s.wbDrop}${drag !== null && over === i && drag !== i && drag !== i - 1 ? ` ${s.wbDropOn}` : ''}`} />
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.effectAllowed = 'move'
                      try {
                        e.dataTransfer.setData('text/plain', String(i))
                      } catch {
                        // Some browsers refuse data on a drag; the index in state is enough.
                      }
                      setDrag(i)
                    }}
                    onDragEnd={() => {
                      setDrag(null)
                      setOver(null)
                    }}
                    onClick={() => setSel(i)}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSel(i)}
                    className={`${s.wbStage}${i === at ? ` ${s.wbStageOn}` : ''}${drag === i ? ` ${s.wbStageDrag}` : ''}`}
                  >
                    <div className={s.wbRail}>
                      <span className={s.wbGrip} title="Drag to reorder">⋮⋮</span>
                      <span className={s.wbNum}>{i + 1}</span>
                    </div>
                    <div className={s.wbBody}>
                      <div className={s.wbNameRow}>
                        <span className={s.wbName}>{x.name || 'Untitled stage'}</span>
                        <span className={s.wbTag} style={deptStyle(x.dept)}>{DEPT_LABEL[x.dept]}</span>
                        {x.form.length ? <span className={`${s.wbTag} ${s.wbForm}`}>📝 {x.form.length} form field{x.form.length === 1 ? '' : 's'}</span> : null}
                      </div>
                      <div className={s.wbFacts}>
                        <span className={s.wbFact}><span className={s.wbFactK}>Who</span><span className={`${s.wbFactV}${x.who ? '' : ` ${s.wbMissing}`}`}>{x.who ? name(x.who) : '⚠ Pick a person'}</span></span>
                        <span className={s.wbFact}><span className={s.wbFactK}>SLA</span><span className={s.wbFactMono}>{x.sla}d</span></span>
                        {due ? <span className={s.wbFact}><span className={s.wbFactK}>Due</span><span className={s.wbFactV}>{longDay(due)}</span></span> : null}
                        <span className={s.wbFact}><span className={s.wbFactK}>Approval</span><span className={s.wbFactV}>{apprText(x)}</span></span>
                      </div>
                    </div>
                  </div>
                  {i < stages.length - 1 ? <div className={s.wbLink} /> : null}
                </div>
              )
            })}
            <div
              className={`${s.wbDrop}${drag !== null && over === 'end' ? ` ${s.wbDropOn}` : ''}`}
              style={{ marginTop: 6, minHeight: drag !== null ? 10 : 0 }}
              onDragOver={e => {
                e.preventDefault()
                if (over !== 'end') setOver('end')
              }}
              onDrop={e => {
                e.preventDefault()
                drop(stages.length)
              }}
            />
            {stages.length < 20 ? (
              <button
                type="button"
                className={s.wbAdd}
                onClick={() => {
                  onChange([...stages, newStage(stages[stages.length - 1])])
                  setSel(stages.length)
                }}
              >
                + Add stage
              </button>
            ) : null}
          </div>
        </div>

        <div className={s.wbPanel}>
          {st ? (
            <div className={s.wbSettings} key={st.key}>
              <div className={s.wbSetHead}>
                <span className={s.wbSetLabel}>Stage {at + 1} settings</span>
                {stages.length > 1 ? (
                  <button
                    type="button"
                    className={s.wbRemove}
                    onClick={() => {
                      onChange(removeStage(stages, at))
                      setSel(Math.max(0, at - 1))
                    }}
                  >
                    Remove stage
                  </button>
                ) : null}
              </div>

              <label className={s.field}>
                <span className={s.wbQ}>What&apos;s this stage called?</span>
                <input className={s.input} value={st.name} maxLength={80} onChange={e => upd({ name: e.target.value })} />
              </label>

              <div className={s.field}>
                <span className={s.wbQ}>Who does it?</span>
                <div className={s.wbDD}>
                  <button
                    type="button"
                    className={`${s.wbDDBtn}${dd === 'who' ? ` ${s.wbDDBtnOn}` : ''}${st.who ? '' : ` ${s.wbDDBtnMiss}`}`}
                    onClick={e => {
                      e.stopPropagation()
                      toggle('who')
                    }}
                    aria-expanded={dd === 'who'}
                  >
                    <span className={s.wbDDIcon}>👤</span>
                    <span className={s.wbDDText}>
                      <span className={s.wbDDLabel} style={{ display: 'block' }}>{st.who ? name(st.who) : 'Pick a person…'}</span>
                      <span className={s.wbDDHint} style={{ display: 'block' }}>{st.who ? people.find(p => p.id === st.who)?.hint ?? '' : 'Required'}</span>
                    </span>
                    <span className={s.wbCaret}>▼</span>
                  </button>
                  {dd === 'who' ? (
                    <div className={s.wbMenu} onClick={e => e.stopPropagation()}>
                      {people.map(p => (
                        <button key={p.id} type="button" className={`${s.wbOpt}${st.who === p.id ? ` ${s.wbOptOn}` : ''}`} onClick={() => pickWho(p.id)}>
                          <span className={s.wbTick}>{st.who === p.id ? '✓' : ''}</span>
                          <span className={s.wbAv} style={{ background: TEAM_BG[p.team ?? 'manager'] }}>{p.first.charAt(0).toUpperCase()}</span>
                          <span className={s.wbOptText}>
                            <span className={s.wbOptLabel} style={{ display: 'block' }}>{p.id === me ? `Me (${p.first})` : p.first}</span>
                            <span className={s.wbOptHint} style={{ display: 'block' }}>{p.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={s.field} style={{ gap: 8 }}>
                <span className={s.wbQ}>Who approves it?</span>
                {(st.appr.length ? st.appr : [null]).map((a, li) => {
                  const key = `appr${li}`
                  const cur = a ? approvers.find(x => x.id === a) : null
                  return (
                    <div key={li} className={s.wbLevel}>
                      <div className={s.wbLevelHead}>
                        <span className={s.wbLevelN}>Level {li + 1}</span>
                        <span className={s.wbLevelLock}>🔒 always locked</span>
                        {li > 0 ? (
                          <button type="button" className={s.wbLevelRemove} onClick={() => upd({ appr: st.appr.filter((_, j) => j !== li) })}>Remove</button>
                        ) : null}
                      </div>
                      <div className={s.wbDD}>
                        <button
                          type="button"
                          className={`${s.wbDDBtn}${dd === key ? ` ${s.wbDDBtnOn}` : ''}`}
                          onClick={e => {
                            e.stopPropagation()
                            toggle(key)
                          }}
                          aria-expanded={dd === key}
                        >
                          {cur ? <span className={s.wbAv} style={{ background: TEAM_BG[cur.team ?? 'manager'] }}>{cur.first.charAt(0).toUpperCase()}</span> : <span className={s.wbDDIcon}>—</span>}
                          <span className={s.wbDDText}><span className={s.wbDDLabel}>{cur ? cur.first : 'No approval'}</span></span>
                          <span className={s.wbCaret}>▼</span>
                        </button>
                        {dd === key ? (
                          <div className={s.wbMenu} onClick={e => e.stopPropagation()}>
                            {li === 0 ? (
                              <button type="button" className={`${s.wbOpt}${!a ? ` ${s.wbOptOn}` : ''}`} onClick={() => setLevel(0, null)}>
                                <span className={s.wbDDIcon}>—</span>
                                <span className={s.wbOptText}><span className={s.wbOptLabel}>No approval</span></span>
                                <span className={s.wbTick}>{!a ? '✓' : ''}</span>
                              </button>
                            ) : null}
                            {approvers.filter(x => x.id === a || !st.appr.includes(x.id)).map(x => (
                              <button key={x.id} type="button" className={`${s.wbOpt}${a === x.id ? ` ${s.wbOptOn}` : ''}`} onClick={() => setLevel(li, x.id)}>
                                <span className={s.wbAv} style={{ background: TEAM_BG[x.team ?? 'manager'] }}>{x.first.charAt(0).toUpperCase()}</span>
                                <span className={s.wbOptText}><span className={s.wbOptLabel}>{x.id === me ? `Me (${x.first})` : x.first}</span></span>
                                <span className={s.wbOptHint}>{x.hint}</span>
                                <span className={s.wbTick}>{a === x.id ? '✓' : ''}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {st.appr.length > 0 && st.appr.length < MAX_APPROVALS && nextApprover ? (
                  <button type="button" className={s.wbAddLevel} onClick={() => upd({ appr: [...st.appr, nextApprover.id] })}>+ Add another approval level</button>
                ) : null}
              </div>

              <div className={s.field}>
                <span className={s.wbQ}>How long?</span>
                <div className={s.wbSla}>
                  <div className={s.wbStepper}>
                    <button type="button" className={s.wbStepBtn} onClick={() => upd({ sla: Math.max(1, st.sla - 1) })} aria-label="One day less">−</button>
                    <span className={s.wbStepN}>{st.sla}</span>
                    <button type="button" className={s.wbStepBtn} onClick={() => upd({ sla: Math.min(MAX_SLA, st.sla + 1) })} aria-label="One day more">+</button>
                  </div>
                  <span className={s.unit}>working days</span>
                </div>
              </div>

              <div className={s.field}>
                <span className={s.wbQ}>If changes are requested, go back to which stage?</span>
                <div className={s.wbBack}>
                  {[{ k: null as number | null, label: 'Stay on this stage' }, ...stages.slice(0, at).map((x, j) => ({ k: j as number | null, label: `${j + 1}. ${x.name}` }))].map(o => (
                    <button key={o.k ?? 'stay'} type="button" className={`${s.wbBackOpt}${st.back === o.k ? ` ${s.wbBackOn}` : ''}`} onClick={() => upd({ back: o.k })}>{o.label}</button>
                  ))}
                </div>
              </div>

              <div className={s.field}>
                <span className={s.wbQ}>What does this stage fill in?</span>
                <div className={s.wbFields}>
                  {st.form.map((f, j) => (
                    <div key={j} className={`${s.wbFieldRow}${f.type === 'Note' ? ` ${s.wbFieldNote}` : ''}`}>
                      <div className={s.wbFieldLine}>
                        <span className={s.wbGlyph}>{FIELD_GLYPH[f.type]}</span>
                        <input
                          className={`${s.wbFieldName}${f.type === 'Note' ? ` ${s.wbFieldNameNote}` : ''}`}
                          value={f.label}
                          maxLength={f.type === 'Note' ? 300 : 60}
                          onChange={e => setField(j, { label: e.target.value })}
                          aria-label="Field name"
                        />
                        <span className={s.wbFieldType}>{f.type === 'Note' ? 'Note · read-only' : f.type === 'Table' ? `Table · ${(f.cols ?? []).length} columns` : f.type}</span>
                        <button type="button" className={s.wbFieldX} onClick={() => upd({ form: st.form.filter((_, k) => k !== j) })} aria-label="Remove field">×</button>
                      </div>
                      {f.type === 'Table' ? (
                        <div className={s.wbCols}>
                          {(f.cols ?? []).map((c, ci) => (
                            <div key={ci} className={s.wbCol}>
                              <input
                                className={s.wbColName}
                                value={c.name}
                                maxLength={40}
                                aria-label="Column name"
                                onChange={e => setField(j, { cols: (f.cols ?? []).map((x, k) => (k === ci ? { ...x, name: e.target.value } : x)) })}
                              />
                              <select
                                className={s.wbSelect}
                                value={c.type}
                                aria-label="Column type"
                                onChange={e => setField(j, { cols: (f.cols ?? []).map((x, k) => (k === ci ? { ...x, type: e.target.value as ColType } : x)) })}
                              >
                                {COL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              {(f.cols ?? []).length > 1 ? (
                                <button type="button" className={s.wbFieldX} aria-label="Remove column" onClick={() => setField(j, { cols: (f.cols ?? []).filter((_, k) => k !== ci) })}>×</button>
                              ) : null}
                            </div>
                          ))}
                          {(f.cols ?? []).length < 8 ? (
                            <button type="button" className={s.wbAddCol} onClick={() => setField(j, { cols: [...(f.cols ?? []), { name: `Column ${(f.cols ?? []).length + 1}`, type: 'Text' }] })}>+ Column</button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {st.form.length < 20 ? (
                    <div className={s.wbFieldAdd}>
                      <input
                        className={s.wbFieldInput}
                        value={fieldDraft}
                        onChange={e => setFieldDraft(e.target.value)}
                        onKeyDown={addField}
                        placeholder={fieldType === 'Note' ? '+ Note for this stage, Enter' : fieldType === 'Table' ? '+ Table name, Enter' : '+ Field name, Enter'}
                        aria-label="New field"
                      />
                      <select className={s.wbSelect} value={fieldType} onChange={e => setFieldType(e.target.value as FieldType)} aria-label="Field type">
                        {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className={s.wbFoot}>
        <span className={s.wbFootItem}><span className={s.wbFootK}>Total</span> <strong className={s.wbFootV}>{total} working day{total === 1 ? '' : 's'}</strong></span>
        <span className={s.wbFootRule} />
        <span className={s.wbFootItem}><span className={s.wbFootK}>PIC approves</span> <strong className={s.wbFootV}>0×</strong></span>
        <span className={s.wbFootRule} />
        <span className={s.wbFootItem}><span className={s.wbFootK}>Finishes</span> <strong className={s.wbFootV}>{dates.length ? longDay(dates[dates.length - 1].dueOn) : '—'}</strong></span>
        {problems.map(w => <span key={w} className={s.wbWarn}>⚠️ {w}</span>)}
        {problems.length ? null : <span className={s.wbNoWarn}>No warnings</span>}
      </div>
    </div>
  )
}
