'use client'

import { useState } from 'react'
import { groupLabel, isManagerTitle, rosterGroups, sameGroup } from '@/lib/marketing/groups'
import { WF_MAX_APPROVALS, WF_MAX_SLA, type WfAppr, type WfStage } from '@/lib/marketing/workflows'
import FieldsEditor from '../builder/FieldsEditor'
import { personBg, type BuilderPerson } from '../builder/people'
import b from '../builder/builder.module.css'

// A workflow template's stage, its settings (`Workflow Builder.dc.html`, not quick): its name and group (a People title —
// the user, 2026-10-24: each title is a group), who does it (the
// manager picks at assignment, or 🔓 the stage before picks from the candidates set here), who approves it (up to
// three levels: a manager, the PIC through the link, a person picked at assignment), how long, what the PIC sees on the
// link, whether it splits into subtasks, where changes go back to, the fields it fills in.

const initial = (first: string) => first.charAt(0).toUpperCase() || '?'

export default function TemplateSettings({
  stage,
  at,
  stages,
  locked,
  people,
  approvers,
  nameOf,
  onChange,
  onRemove,
}: {
  stage: WfStage
  at: number
  stages: readonly WfStage[]
  locked: boolean
  /** Who a 🔓 stage may pick from: Marketing's people. */
  people: BuilderPerson[]
  /** Who may approve: Marketing's managers. */
  approvers: BuilderPerson[]
  nameOf: (staff: string) => string
  onChange: (patch: Partial<WfStage>) => void
  onRemove: () => void
}) {
  const [dd, setDd] = useState<string | null>(null)
  const toggle = (k: string) => setDd(cur => (cur === k ? null : k))
  const close = () => setDd(null)

  // What the stage runs as — locked: picked at assignment, no subtasks (the stage keeps what was set for unlocking).
  const prevOff = at === 0 || locked
  const mode = locked ? 'assign' : stage.who.mode
  const split = stage.split && !locked
  const cands = stage.who.cands
  // The stage's own group first (the handoff's "Assign to · Design first"); a manager only when picked already.
  const workers = people
    .filter(p => !isManagerTitle(p.group) || cands.includes(p.id))
    .sort((x, y) => Number(sameGroup(y.group, stage.dept)) - Number(sameGroup(x.group, stage.dept)))
  // The groups to pick from: the roster's titles — and the stage's own, should nobody hold it now.
  const groups = rosterGroups([...people, ...approvers].map(p => ({ title: p.group })))
  if (stage.dept && !groups.some(g => sameGroup(g, stage.dept))) groups.push(stage.dept)

  const setLevel = (li: number, a: WfAppr | null) => {
    close()
    if (a === null) return onChange({ appr: [] })
    const next = [...stage.appr]
    next[li] = a
    onChange({ appr: next })
  }
  const same = (x: WfAppr, y: WfAppr) => x.kind === y.kind && (x.kind !== 'person' || (y.kind === 'person' && x.staff === y.staff))
  const levelLabel = (a: WfAppr | null) =>
    !a ? { icon: '—', label: 'No approval', person: null }
      : a.kind === 'pic' ? { icon: '🔗', label: 'PIC via link', person: null }
      : a.kind === 'assign' ? { icon: '👤', label: 'Pick at assignment', person: null }
      : { icon: '', label: nameOf(a.staff), person: people.find(p => p.id === a.staff) ?? approvers.find(p => p.id === a.staff) ?? null }
  const addLevel = () => {
    const pic = stage.appr.some(a => a.kind === 'pic')
    onChange({ appr: [...stage.appr, pic ? { kind: 'assign' } : { kind: 'pic' }] })
  }

  return (
    <div className={b.wbSettings} onClick={() => dd && close()}>
      <div className={b.wbSetHead}>
        <span className={b.wbSetLabel}>Stage {at + 1} settings</span>
        <button type="button" className={b.wbRemove} onClick={onRemove}>Remove stage</button>
      </div>

      <label className={b.field}>
        <span className={b.wbQ}>What&apos;s this stage called?</span>
        <input className={b.input} value={stage.name} maxLength={80} onChange={e => onChange({ name: e.target.value })} />
      </label>

      <div className={b.field}>
        <span className={b.wbQ}>Which group?</span>
        <div className={b.wbTeams} role="radiogroup" aria-label="Which group?">
          {groups.map(g => {
            const on = sameGroup(stage.dept, g)
            return (
              <button key={g} type="button" role="radio" aria-checked={on} className={`${b.wbBackOpt}${on ? ` ${b.wbBackOn}` : ''}`}
                onClick={() => onChange({ dept: on ? '' : g })}>
                {groupLabel(g)}
              </button>
            )
          })}
        </div>
      </div>

      <div className={b.field}>
        <span className={b.wbQ}>Who does it?</span>
        <div className={b.wbDD}>
          <button
            type="button"
            className={`${b.wbDDBtn}${dd === 'who' ? ` ${b.wbDDBtnOn}` : ''}`}
            onClick={e => {
              e.stopPropagation()
              toggle('who')
            }}
            aria-expanded={dd === 'who'}
          >
            <span className={b.wbDDIcon}>{mode === 'prev' ? '🔓' : '👤'}</span>
            <span className={b.wbDDText}><span className={b.wbDDLabel}>{mode === 'prev' ? 'Previous stage picks' : 'Pick at assignment'}</span></span>
            <span className={b.wbCaret}>▼</span>
          </button>
          {dd === 'who' ? (
            <div className={b.wbMenu} onClick={e => e.stopPropagation()}>
              <button type="button" className={`${b.wbOpt}${mode === 'assign' ? ` ${b.wbOptOn}` : ''}`} onClick={() => { onChange({ who: { mode: 'assign', cands } }); close() }}>
                <span className={b.wbTick}>{mode === 'assign' ? '✓' : ''}</span>
                <span className={b.wbOptText}><span className={b.wbOptLabel}>Pick at assignment</span></span>
              </button>
              <button
                type="button"
                className={`${b.wbOpt}${mode === 'prev' ? ` ${b.wbOptOn}` : ''}${prevOff ? ` ${b.wbOptOff}` : ''}`}
                aria-disabled={prevOff}
                title={at === 0 ? 'Not on the first stage' : locked ? 'Off — whole workflow is locked' : undefined}
                onClick={() => {
                  if (prevOff) return
                  onChange({ who: { mode: 'prev', cands } })
                  close()
                }}
              >
                <span className={b.wbTick}>{mode === 'prev' ? '✓' : ''}</span>
                <span className={b.wbOptText}><span className={b.wbOptLabel}>🔓 Previous stage picks</span></span>
              </button>
            </div>
          ) : null}
        </div>
        {mode === 'prev' ? (
          <div className={b.field} style={{ marginTop: 4, gap: 5 }}>
            <span className={b.wbCandHead}>
              Who can they pick from?{' '}
              <span className={cands.length ? b.wbCandCount : b.wbCandNone}>{cands.length ? `${cands.length} candidate${cands.length === 1 ? '' : 's'}` : 'Pick at least one'}</span>
            </span>
            <div className={b.wbDD}>
              <button
                type="button"
                className={`${b.wbDDBtn}${dd === 'cands' ? ` ${b.wbDDBtnOn}` : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  toggle('cands')
                }}
                aria-expanded={dd === 'cands'}
              >
                {cands.length ? (
                  <span className={b.wbAvs}>
                    {cands.slice(0, 5).map(c => {
                      const p = people.find(x => x.id === c)
                      return <span key={c} className={b.wbAv} style={{ background: personBg(p) }}>{initial(nameOf(c))}</span>
                    })}
                  </span>
                ) : null}
                <span className={b.wbDDText} style={{ paddingLeft: cands.length ? 8 : 0 }}>
                  <span className={b.wbDDLabel}>{cands.length ? cands.map(nameOf).join(' / ') : 'Choose candidates…'}</span>
                </span>
                <span className={b.wbCaret}>▼</span>
              </button>
              {dd === 'cands' ? (
                <div className={b.wbMenu} onClick={e => e.stopPropagation()}>
                  {workers.map(p => {
                    const on = cands.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={b.wbOpt}
                        aria-pressed={on}
                        onClick={() => onChange({ who: { mode: 'prev', cands: on ? cands.filter(x => x !== p.id) : [...cands, p.id] } })}
                      >
                        <span className={`${b.wbCheck}${on ? ` ${b.wbCheckOn}` : ''}`}>{on ? '✓' : ''}</span>
                        <span className={b.wbAv} style={{ background: personBg(p) }}>{initial(p.first)}</span>
                        <span className={b.wbOptText}><span className={b.wbOptLabel}>{p.first}</span></span>
                        <span className={b.wbOptHint}>{p.hint}</span>
                      </button>
                    )
                  })}
                  {cands.filter(c => !people.some(p => p.id === c)).map(c => (
                    <button key={c} type="button" className={b.wbOpt} aria-pressed onClick={() => onChange({ who: { mode: 'prev', cands: cands.filter(x => x !== c) } })}>
                      <span className={`${b.wbCheck} ${b.wbCheckOn}`}>✓</span>
                      <span className={b.wbOptText}><span className={b.wbOptLabel}>{nameOf(c)}</span></span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className={b.field} style={{ gap: 8 }}>
        <span className={b.wbQ}>Who approves it?</span>
        {(stage.appr.length ? stage.appr : [null]).map((a, li) => {
          const key = `appr${li}`
          const cur = levelLabel(a)
          const opts: { a: WfAppr | null; icon: string; label: string; person: BuilderPerson | null }[] = [
            ...(li === 0 ? [{ a: null, icon: '—', label: 'No approval', person: null }] : []),
            ...approvers.map(p => ({ a: { kind: 'person', staff: p.id } as WfAppr, icon: '', label: p.first, person: p })),
            { a: { kind: 'pic' }, icon: '🔗', label: 'PIC via link', person: null },
            { a: { kind: 'assign' }, icon: '👤', label: 'Pick at assignment', person: null },
          ]
          // A person or the PIC once a stage; another level may be picked at assignment again.
          const taken = (o: WfAppr | null) => !!o && o.kind !== 'assign' && stage.appr.some((x, j) => j !== li && same(x, o))
          return (
            <div key={li} className={b.wbLevel}>
              <div className={b.wbLevelHead}>
                <span className={b.wbLevelN}>Level {li + 1}</span>
                <span className={b.wbLevelLock}>🔒 always locked</span>
                {li > 0 ? (
                  <button type="button" className={b.wbLevelRemove} onClick={() => onChange({ appr: stage.appr.filter((_, j) => j !== li) })}>Remove</button>
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
                  {cur.person || (a?.kind === 'person') ? (
                    <span className={b.wbAv} style={{ background: personBg(cur.person ?? undefined) }}>{initial(cur.label)}</span>
                  ) : (
                    <span className={b.wbDDIcon}>{cur.icon}</span>
                  )}
                  <span className={b.wbDDText}><span className={b.wbDDLabel}>{cur.label}</span></span>
                  <span className={b.wbCaret}>▼</span>
                </button>
                {dd === key ? (
                  <div className={b.wbMenu} onClick={e => e.stopPropagation()}>
                    {opts.filter(o => !taken(o.a)).map(o => {
                      const on = o.a === null ? !a : !!a && same(a, o.a)
                      return (
                        <button key={o.a ? `${o.a.kind}${o.a.kind === 'person' ? o.a.staff : ''}` : 'none'} type="button" className={`${b.wbOpt}${on ? ` ${b.wbOptOn}` : ''}`} onClick={() => setLevel(li, o.a)}>
                          {o.person ? (
                            <span className={b.wbAv} style={{ background: personBg(o.person) }}>{initial(o.person.first)}</span>
                          ) : (
                            <span className={b.wbDDIcon}>{o.icon}</span>
                          )}
                          <span className={b.wbOptText}><span className={b.wbOptLabel}>{o.label}</span></span>
                          {o.person ? <span className={b.wbOptHint}>{o.person.hint}</span> : null}
                          <span className={b.wbTick}>{on ? '✓' : ''}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
        {stage.appr.length > 0 && stage.appr.length < WF_MAX_APPROVALS ? (
          <button type="button" className={b.wbAddLevel} onClick={addLevel}>+ Add another approval level</button>
        ) : null}
      </div>

      <div className={b.field}>
        <span className={b.wbQ}>How long?</span>
        <div className={b.wbSla}>
          <div className={b.wbStepper}>
            <button type="button" className={b.wbStepBtn} onClick={() => onChange({ sla: Math.max(1, stage.sla - 1) })} aria-label="One day less">−</button>
            <span className={b.wbStepN}>{stage.sla}</span>
            <button type="button" className={b.wbStepBtn} onClick={() => onChange({ sla: Math.min(WF_MAX_SLA, stage.sla + 1) })} aria-label="One day more">+</button>
          </div>
          <span className={b.unit}>working days</span>
        </div>
      </div>

      <label className={b.field}>
        <span className={b.wbQ}>What does PIC see on the link?</span>
        <input
          className={b.input}
          value={stage.picText}
          maxLength={120}
          placeholder="Department words only — no names, no prices"
          onChange={e => onChange({ picText: e.target.value })}
        />
      </label>

      <div className={b.wbSwitchRow}>
        <span className={b.wbQ}>Can this stage be split into subtasks?</span>
        <button
          type="button"
          role="switch"
          aria-checked={split}
          aria-label="Can this stage be split into subtasks?"
          className={`${b.wbSwitch}${split ? ` ${b.wbSwitchOn}` : ''}`}
          disabled={locked}
          title={locked ? 'Off — whole workflow is locked' : undefined}
          onClick={() => onChange({ split: !stage.split })}
        />
      </div>

      <div className={b.field}>
        <span className={b.wbQ}>If changes are requested, go back to which stage?</span>
        <div className={b.wbBack}>
          {[{ k: null as number | null, label: 'Stay on this stage' }, ...stages.slice(0, at).map((x, j) => ({ k: j as number | null, label: `${j + 1}. ${x.name || 'Untitled stage'}` }))].map(o => (
            <button key={o.k ?? 'stay'} type="button" className={`${b.wbBackOpt}${stage.back === o.k ? ` ${b.wbBackOn}` : ''}`} onClick={() => onChange({ back: o.k })}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className={b.field}>
        <span className={b.wbQ}>What does this stage fill in?</span>
        <FieldsEditor form={stage.form} onChange={form => onChange({ form })} presetRows stageName={stage.name} />
      </div>
    </div>
  )
}
