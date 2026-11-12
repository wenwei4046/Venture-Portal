'use client'

import type { ReactNode } from 'react'
import {
  fieldDisplay, mayFill, sectionBadges, sectionState, type FlowField, type FlowRow, type FlowSection, type FlowTask, type FlowValue,
} from '@/lib/marketing/task-flow-view'
import TaskFlowTable from './TaskFlowTable'
import s from './taskflow.module.css'

// One section the focused stage fills in (Task Flow.dc.html): its emoji and title, its badges (🎯 stage, ⭐ Required,
// 👁 PIC sees), where it stands; its fields — editable only by the current doer before submit (a field missing at submit
// gets a red border) — and its table. Every date is the one date input the marketing pages use.

const STATE = { wait: s.stateWait, ok: s.stateOk, muted: '' }

export default function TaskFlowSection({ task, sec, me, bad, onValue, onRows, onAddCol, onDropCol, renderField }: {
  task: FlowTask
  sec: FlowSection
  me: string | null
  /** The ids missing at the last submit (shown in red). */
  bad: ReadonlySet<string>
  onValue: (f: FlowField, v: FlowValue, commit: boolean) => void
  onRows: (f: FlowField, rows: FlowRow[], commit: boolean) => void
  onAddCol?: (f: FlowField, name: string, type: string) => void
  onDropCol?: (f: FlowField, col: string) => void
  /** The page's own input for a kind it draws itself (a file's uploads, a choice's options); null → the plain one. */
  renderField?: (f: FlowField, editable: boolean, bad: boolean) => ReactNode | null
}) {
  const st = sectionState(task, sec, me)
  const badges = sectionBadges(task, sec)
  return (
    <div className={`${s.sec}${st.mine ? ` ${s.secMine}` : ''}`} aria-label={sec.title}>
      <div className={s.secHead}>
        <span className={s.secEmoji} aria-hidden="true">{sec.emoji}</span>
        <span className={s.secTitle}>{sec.title}</span>
        {badges.map(b => <span key={b} className={s.badge}>{b}</span>)}
        <span className={s.grow} />
        <span className={`${s.state} ${STATE[st.tone]}`}>{st.text}</span>
      </div>
      {sec.fields.filter(f => f.type !== 'Table').map(f => {
        const edit = mayFill(task, me, f.stage)
        const isBad = bad.has(f.id)
        const v = task.values[f.id]
        const own = renderField ? renderField(f, edit, isBad) : null
        if (f.type === 'Note') {
          return <div key={f.id} className={s.reqText}>{f.label}</div>
        }
        return (
          <div key={f.id} className={s.row}>
            <span className={s.fName}>{f.label}{f.req ? <span className={s.star}> *</span> : null}</span>
            {own ?? (edit && f.type === 'Checkbox' ? (
              <button type="button" className={s.check} aria-pressed={v === true} aria-label={f.label} onClick={() => onValue(f, v !== true, true)}>
                <span className={`${s.box}${v === true ? ` ${s.boxOn}` : ''}`} aria-hidden="true">{v === true ? '✓' : ''}</span>
                <span className={s.checkLabel}>{v === true ? 'Yes' : 'Not yet'}</span>
              </button>
            ) : edit ? (
              <input
                className={`${s.input}${isBad ? ` ${s.bad}` : ''}`}
                aria-label={f.label}
                aria-invalid={isBad || undefined}
                type={f.type === 'Date' ? 'date' : f.type === 'Number' ? 'number' : 'text'}
                value={typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : ''}
                placeholder={f.type === 'File' ? 'Paste a link or drop a file' : f.type === 'Person' ? 'Name' : 'Type here'}
                onChange={e => onValue(f, e.target.value, false)}
                onBlur={e => onValue(f, e.target.value.trim(), true)}
              />
            ) : (
              (() => {
                const d = fieldDisplay(task, f)
                return <span className={`${s.ro}${d.filled ? '' : ` ${s.roEmpty}`}`}>{d.text}</span>
              })()
            ))}
          </div>
        )
      })}
      {sec.fields.filter(f => f.type === 'Table').map(f => (
        <TaskFlowTable key={f.id} task={task} field={f} me={me} showBad={[...bad].some(id => id.startsWith(`${f.id}:`))}
          onRows={onRows} onAddCol={onAddCol} onDropCol={onDropCol} />
      ))}
    </div>
  )
}
