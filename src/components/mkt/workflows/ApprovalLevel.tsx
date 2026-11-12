'use client'

import { ASSIGN_ID, PIC_ID, type ApprLevel } from '@/lib/marketing/flow'
import { idLong, roleOf, type WfPerson } from '@/lib/marketing/workflows'
import { personBg } from '../builder/people'
import w from './workflows.module.css'

// One approval level (`Stage Settings.dc.html` › Approval): "Level n approves", a multi-select dropdown (the managers
// and a Director, 🔗 PIC via link, 👤 Picked at assignment — somebody already on another level greyed, "Already approves
// at another level"), the picked as removable chips, and with two or more "Needs: Any one of them | Everyone".

export default function ApprovalLevel({
  n,
  level,
  open,
  approvers,
  usedElsewhere,
  nameOf,
  onToggle,
  onChange,
  onRemove,
}: {
  n: number
  /** null: the empty first level ("No approval · choose approvers"). */
  level: ApprLevel | null
  open: boolean
  approvers: WfPerson[]
  /** Ids on the stage's other levels. */
  usedElsewhere: ReadonlySet<string>
  nameOf: (id: string) => string
  onToggle: () => void
  onChange: (next: ApprLevel) => void
  onRemove: (() => void) | null
}) {
  const ids = level?.ids ?? []
  const rule = level?.rule ?? 'any'
  const flip = (id: string) => onChange({ ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id], rule })
  const icon = (id: string) => (id === PIC_ID ? '🔗' : id === ASSIGN_ID ? '👤' : nameOf(id).charAt(0).toUpperCase())
  const bg = (id: string) => {
    const p = approvers.find(x => x.id === id)
    return p ? personBg({ group: p.title }) : undefined
  }
  const opts = [...approvers.map(p => p.id), PIC_ID, ASSIGN_ID]
  const hint = (id: string) =>
    id === PIC_ID ? 'Client approves through the tracking link' : id === ASSIGN_ID ? 'MM picks the approver per project' : roleOf(approvers.find(p => p.id === id)?.title ?? '')
  return (
    <div className={w.level}>
      <div className={w.railCol}><span className={w.railLine} /><span className={w.lv}>L{n}</span><span className={w.railFill} /></div>
      <div className={w.levelBody}>
        <div className={w.levelHead}>
          <span className={w.levelTitle}>Level {n} approves</span>
          <span className={w.grow} />
          {onRemove ? <button type="button" className={w.levelRemove} onClick={onRemove}>Remove</button> : null}
        </div>
        <div className={w.dd}>
          <div
            role="button"
            tabIndex={0}
            aria-expanded={open}
            aria-label={`Level ${n} approvers`}
            className={`${w.ddBtn}${open ? ` ${w.ddBtnOn}` : ''}`}
            onClick={e => { e.stopPropagation(); onToggle() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
          >
            <div className={w.ddChips}>
              {ids.length ? ids.map(id => (
                <span key={id} className={w.selChip}>
                  <span className={w.selAv} style={{ background: bg(id) }}>{icon(id)}</span>
                  {idLong(id, nameOf)}
                  <button type="button" className={w.selX} aria-label={`Remove ${idLong(id, nameOf)}`} onClick={e => { e.stopPropagation(); flip(id) }}>×</button>
                </span>
              )) : <span className={w.ddEmpty}>{level ? 'Choose approvers' : 'No approval · choose approvers'}</span>}
            </div>
            <span className={w.caret}>{open ? '▲' : '▼'}</span>
          </div>
          {open ? (
            <div className={w.ddMenu} role="listbox" aria-multiselectable aria-label={`Level ${n} approvers`} onClick={e => e.stopPropagation()}>
              <span className={w.ddLabel}>Select one or more</span>
              {opts.map(id => {
                const on = ids.includes(id)
                const off = !on && id !== ASSIGN_ID && usedElsewhere.has(id)
                return (
                  <button key={id} type="button" role="option" aria-selected={on} aria-disabled={off || undefined}
                    className={`${w.opt}${off ? ` ${w.optOff}` : ''}`} onClick={() => !off && flip(id)}>
                    <span className={`${w.check}${on ? ` ${w.checkOn}` : ''}`}>{on ? '✓' : ''}</span>
                    <span className={w.optAv} style={{ background: bg(id) }}>{icon(id)}</span>
                    <span className={w.optText}>
                      <span className={w.optLabel}>{idLong(id, nameOf)}</span>
                      <span className={w.optHint}>{off ? 'Already approves at another level' : hint(id)}</span>
                    </span>
                  </button>
                )
              })}
              <div className={w.ddFoot}><button type="button" className={w.ddDone} onClick={onToggle}>Done</button></div>
            </div>
          ) : null}
        </div>
        {ids.length > 1 ? (
          <div className={w.needs}>
            <span className={w.needsLabel}>Needs</span>
            <div className={w.needsSeg} role="radiogroup" aria-label="Needs">
              {([['any', 'Any one of them'], ['all', 'Everyone']] as const).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={rule === k} className={`${w.needsBtn}${rule === k ? ` ${w.segOn}` : ''}`}
                  onClick={() => onChange({ ids, rule: k })}>
                  <span className={w.stable} data-label={label}><span>{label}</span></span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
