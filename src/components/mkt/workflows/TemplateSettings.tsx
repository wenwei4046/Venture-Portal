'use client'

import { useRef, useState, type CSSProperties } from 'react'
import type { ApprLevel } from '@/lib/marketing/flow'
import {
  apprSummary, groupNameOf, mayApprove, onApprove, whoSummary, WF_MAX_APPROVALS, WF_MAX_SLA,
  type WfGroup, type WfPerson, type WfStage,
} from '@/lib/marketing/workflows'
import { personBg } from '../builder/people'
import ApprovalLevel from './ApprovalLevel'
import RadioCard from './RadioCard'
import Stepper from './Stepper'
import ToggleRow from './ToggleRow'
import w from './workflows.module.css'

// The Stage Settings panel (`Stage Settings.dc.html`, layout="accordion"): the number, the name, ◀ ▶ to move it and
// Remove; then four sections, one open at a time, each with a one-line summary — Basics (name, group chips with
// "+ New group", how long as "day a–b", subtasks), Who does it (👤 MM assigns or 🔓 a handoff from the stage before,
// with its shortlist and each person's load), Approval (Doer submits → up to three levels → what follows; where
// changes go back to) and PIC & form (what the PIC reads; the fields are the Canvas template's — a link card).

export type Section = 'basics' | 'who' | 'appr' | 'pic' | ''

export default function TemplateSettings({
  stage,
  at,
  stages,
  locked,
  section,
  startDay,
  groups,
  people,
  fills,
  nameOf,
  onSection,
  onPatch,
  onRemove,
  onMove,
  onOpenCanvas,
  onAddGroup,
}: {
  stage: WfStage
  at: number
  /** Every stage as drafted (names, approval of the others). */
  stages: WfStage[]
  locked: boolean
  section: Section
  /** Working days before this stage (its "day a–b"). */
  startDay: number
  groups: WfGroup[]
  /** Marketing's roster with each one's load. */
  people: WfPerson[]
  /** How many fields and columns the canvas has this stage fill in. */
  fills: number
  nameOf: (id: string) => string
  onSection: (s: Section) => void
  onPatch: (patch: Partial<WfStage>) => void
  onRemove: (() => void) | null
  onMove: (to: number) => void
  onOpenCanvas: () => void
  /** "+ New group": answers the new group's key, or null when it was refused. */
  onAddGroup: (name: string) => Promise<string | null>
}) {
  const [openLvl, setOpenLvl] = useState<number | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupDraft, setGroupDraft] = useState('')
  const addingRef = useRef(false)

  const mode = locked ? 'assign' : stage.who.mode
  const cands = stage.who.cands
  const isPrev = mode === 'prev'
  const prevOff = at === 0 || locked
  const approvers = people.filter(p => mayApprove(p.title))
  const workers = people.filter(p => !mayApprove(p.title) || cands.includes(p.id))
  const levels: (ApprLevel | null)[] = stage.appr.length ? stage.appr : [null]

  const commitGroup = async () => {
    if (!addingRef.current) return
    addingRef.current = false
    const name = groupDraft.trim()
    setAddingGroup(false)
    setGroupDraft('')
    if (!name) return
    const key = await onAddGroup(name)
    if (key) onPatch({ dept: key })
  }
  const setLevel = (li: number, next: ApprLevel) => {
    const arr = [...stage.appr]
    if (li >= arr.length) arr.push(next)
    else if (!next.ids.length && arr.length > 1) arr.splice(li, 1)
    else if (!next.ids.length) arr.splice(li, 1)
    else arr[li] = next
    onPatch({ appr: arr })
  }
  const acc = (k: Exclude<Section, ''>, label: string, summary: string, red = false, last = false) => (
    <button type="button" aria-expanded={section === k} className={`${w.acc}${last ? ` ${w.accLast}` : ''}`} onClick={() => onSection(section === k ? '' : k)}>
      <span className={w.accLabel}>{label}</span>
      <span className={`${w.accSum}${red ? ` ${w.accSumRed}` : ''}`}>{summary}</span>
      <span className={w.caret}>{section === k ? '▲' : '▼'}</span>
    </button>
  )

  return (
    <div className={w.ss} onClick={() => openLvl !== null && setOpenLvl(null)}>
      <div className={w.ssHead}>
        <span className={w.ssNum}>{at + 1}</span>
        <span className={w.ssName}>{stage.name || 'Untitled stage'}</span>
        <button type="button" className={w.ssMove} title="Move earlier" aria-label="Move earlier" disabled={at === 0} onClick={() => onMove(at - 1)}>◀</button>
        <button type="button" className={w.ssMove} title="Move later" aria-label="Move later" disabled={at >= stages.length - 1} onClick={() => onMove(at + 1)}>▶</button>
        <button type="button" className={w.ssRemove} disabled={!onRemove} title={onRemove ? undefined : 'Keep at least one stage'} onClick={() => onRemove?.()}>Remove</button>
      </div>

      <div className={w.ssBody}>
        {acc('basics', 'Basics', `${groupNameOf(groups, stage.dept)} · ${stage.sla}d${stage.split && !locked ? ' · subtasks' : ''}`)}
        {section === 'basics' ? (
          <div className={w.accBody}>
            <label className={w.part}>
              <span className={w.q}>Stage name</span>
              <input className={w.input} value={stage.name} maxLength={80} onChange={e => onPatch({ name: e.target.value })} />
            </label>
            <div className={w.part}>
              <span className={w.q}>Group</span>
              <div className={w.chips} role="radiogroup" aria-label="Group">
                {groups.map(g => {
                  const on = stage.dept === g.key
                  return (
                    <button key={g.key} type="button" role="radio" aria-checked={on} className={`${w.chip}${on ? ` ${w.chipOn}` : ''}`}
                      style={{ '--g-h': g.hue } as CSSProperties} onClick={() => onPatch({ dept: g.key })}>
                      <span className={w.gDot} />{g.name}
                    </button>
                  )
                })}
                {addingGroup ? (
                  <input
                    className={w.groupInput}
                    autoFocus
                    value={groupDraft}
                    maxLength={40}
                    placeholder="Group name, Enter"
                    aria-label="New group"
                    onChange={e => setGroupDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void commitGroup()
                      else if (e.key === 'Escape') {
                        addingRef.current = false
                        setAddingGroup(false)
                      }
                    }}
                    onBlur={() => void commitGroup()}
                  />
                ) : (
                  <button type="button" className={w.newGroup} onClick={() => { addingRef.current = true; setAddingGroup(true); setGroupDraft('') }}>+ New group</button>
                )}
              </div>
            </div>
            <div className={w.part}>
              <span className={w.q}>How long?</span>
              <div className={w.stepRow}>
                <Stepper wide label="Working days" value={stage.sla} min={1} max={WF_MAX_SLA} onChange={sla => onPatch({ sla })} />
                <span className={w.small}>working days · day {startDay + 1}–{startDay + stage.sla}</span>
              </div>
            </div>
            <ToggleRow
              top
              on={stage.split}
              disabled={locked}
              title="Can be split into subtasks"
              sub={locked ? 'Off while “MM assigns every stage” is on' : 'The doer can open subtasks for other people; checked internally only'}
              subWait={locked}
              onChange={split => onPatch({ split })}
            />
          </div>
        ) : null}

        {acc('who', 'Who does it', whoSummary(stage, at, locked, nameOf), isPrev && !cands.length)}
        {section === 'who' ? (
          <div className={`${w.accBody} ${w.accBodyWho}`} role="radiogroup" aria-label="Who does it">
            <RadioCard big on={mode === 'assign'} title="👤 MM assigns" text="MM picks the person when planning each project."
              onPick={() => onPatch({ who: { mode: 'assign', cands } })} />
            <RadioCard
              big
              on={isPrev}
              off={prevOff}
              title="🔓 Handoff from the previous stage"
              text={at === 0 ? 'The person on the stage before picks who does this one.' : `When Stage ${at} · ${stages[at - 1]?.name || ''} is done, that person picks who does this one from a shortlist.`}
              why={at === 0 ? 'Not available on the first stage' : locked ? 'Off while “MM assigns every stage” is on' : undefined}
              onPick={() => onPatch({ who: { mode: 'prev', cands } })}
            />
            {isPrev ? (
              <div className={w.shortlist}>
                <div className={w.shortHead}>
                  Shortlist <span className={`${w.shortHint}${cands.length ? '' : ` ${w.shortHintRed}`}`}>· {cands.length ? `${cands.length} picked` : 'pick at least one'}</span>
                </div>
                <div className={w.chips}>
                  {workers.map(p => {
                    const on = cands.includes(p.id)
                    return (
                      <button key={p.id} type="button" aria-pressed={on} className={`${w.person}${on ? ` ${w.personOn}` : ''}`}
                        onClick={() => onPatch({ who: { mode: 'prev', cands: on ? cands.filter(x => x !== p.id) : [...cands, p.id] } })}>
                        <span className={w.personAv} style={{ background: personBg({ group: p.title }) }}>{p.first.charAt(0).toUpperCase()}</span>
                        {p.first}
                        <span className={w.personLoad}>{p.load} active</span>
                      </button>
                    )
                  })}
                  {cands.filter(c => !people.some(p => p.id === c)).map(c => (
                    <button key={c} type="button" aria-pressed className={`${w.person} ${w.personOn}`} title="No longer on Marketing's team"
                      onClick={() => onPatch({ who: { mode: 'prev', cands: cands.filter(x => x !== c) } })}>
                      <span className={w.personAv}>?</span>{nameOf(c)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {acc('appr', 'Approval', apprSummary(stage.appr, nameOf))}
        {section === 'appr' ? (
          <div className={w.chain}>
            <div className={w.chainRow}>
              <span className={w.rail}><span className={w.ring} /></span>
              <span className={w.chainText}>Doer submits <strong>{stage.name || 'Untitled stage'}</strong></span>
            </div>
            {levels.map((l, li) => (
              <ApprovalLevel
                key={li}
                n={li + 1}
                level={l}
                open={openLvl === li}
                approvers={approvers}
                usedElsewhere={new Set(stage.appr.flatMap((x, j) => (j === li ? [] : x.ids)))}
                nameOf={nameOf}
                onToggle={() => setOpenLvl(o => (o === li ? null : li))}
                onChange={next => setLevel(li, next)}
                onRemove={l ? () => { onPatch({ appr: stage.appr.filter((_, j) => j !== li) }); setOpenLvl(null) } : null}
              />
            ))}
            {stage.appr.length > 0 && stage.appr.length < WF_MAX_APPROVALS ? (
              <div className={w.chainRow}>
                <span className={w.rail}><span className={w.railTall} /></span>
                <button type="button" className={w.addLevel} onClick={e => {
                  e.stopPropagation()
                  onPatch({ appr: [...stage.appr, { ids: [], rule: 'any' }] })
                  setOpenLvl(stage.appr.length)
                }}>+ Add level {stage.appr.length + 1}</button>
              </div>
            ) : null}
            <div className={w.chainRow}>
              <span className={w.okDot}>✓</span>
              <span className={w.okText}>{onApprove(stages, at)}</span>
            </div>
            {stage.appr.length ? (
              <div className={w.back}>
                <span className={w.backTitle}>↩ If changes are requested, go back to</span>
                <div className={w.chips} role="radiogroup" aria-label="If changes are requested, go back to">
                  {[{ k: null as number | null, label: 'Stay on this stage' }, ...stages.slice(0, at).map((x, j) => ({ k: j as number | null, label: `${j + 1}. ${x.name || 'Untitled stage'}` }))].map(o => (
                    <button key={o.k ?? 'stay'} type="button" role="radio" aria-checked={stage.back === o.k}
                      className={`${w.chip} ${w.chipSm}${stage.back === o.k ? ` ${w.chipOn}` : ''}`} onClick={() => onPatch({ back: o.k })}>{o.label}</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {acc('pic', 'PIC & form', stage.picText ? `“${stage.picText}”` : 'Fields are set in Canvas', false, true)}
        {section === 'pic' ? (
          <div className={w.accBody}>
            <label className={w.part}>
              <span className={w.q}>What does PIC see on the link?</span>
              <input className={w.input} value={stage.picText} maxLength={120} placeholder="Department words only — no names, no prices"
                onChange={e => onPatch({ picText: e.target.value })} />
            </label>
            <button type="button" className={w.canvasLink} onClick={onOpenCanvas}>
              <span className={w.canvasLinkIcon}>🎯</span>
              <span className={w.canvasLinkText}>
                <span className={w.q}>What this stage fills in</span>
                <span className={w.canvasLinkSub}>Set in the Canvas template: pick “{stage.name || 'Untitled stage'}” under 🎯 Which stage fills this in? · {fills} now</span>
              </span>
              <span className={w.canvasLinkGo}>Open Canvas →</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
