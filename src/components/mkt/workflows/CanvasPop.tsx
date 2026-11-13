'use client'

import { useState, useTransition } from 'react'
import { addMktOption, removeMktOption } from '@/lib/marketing/actions'
import {
  COL_TYPES, FIELD_TYPES, isChoice, MAX_OPTIONS, newCanvasCol, TABLE_MAX_COLS, TYPE_GLYPH, withType,
  type CanvasCol, type CanvasField, type StageRef,
} from '@/lib/marketing/canvas'
import { LIST_MAX, optionWords, type OptionLists } from '@/lib/marketing/options'
import { CAL_KINDS } from '@/lib/marketing/tasks'
import CanvasPresetRows from './CanvasPresetRows'
import CanvasStageChips from './CanvasStageChips'
import CanvasSwitch from './CanvasSwitch'
import c from './canvas.module.css'

// A field's or a table column's settings (`Canvas Template Editor.dc.html` › Field settings): its name, its kind of
// answer, a choice's options (its own, or a shared list's — ③d-2), ⭐ Required before submit, 👁 Visible to PIC,
// 🎯 which stage fills it in (the template's real stages), a date on the calendar (which kind, the PIC's calendar),
// and a table's columns and preset rows. The canvas is the only place fields are defined (2026-11-13).

type Target = { kind: 'field'; field: CanvasField } | { kind: 'col'; col: CanvasCol }

export default function CanvasPop({
  target,
  stages,
  onField,
  onCol,
  onRemove,
  onClose,
  lists = {},
  onList,
  say,
}: {
  target: Target
  stages: readonly StageRef[]
  onField?: (next: CanvasField) => void
  onCol?: (next: CanvasCol) => void
  onRemove?: () => void
  onClose: () => void
  lists?: OptionLists
  onList?: (name: string, opts: string[]) => void
  say?: (words: string) => void
}) {
  const [opt, setOpt] = useState('')
  const [pending, start] = useTransition()

  if (target.kind === 'col') {
    const col = target.col
    const set = (p: Partial<CanvasCol>) => onCol?.({ ...col, ...p })
    return (
      <div className={c.pop} role="dialog" aria-label={`Column ${col.name || 'settings'}`} onClick={e => e.stopPropagation()}>
        <div className={c.popHead}>
          <span className={c.popLabel}>Column settings</span>
          <button type="button" className={c.popX} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <label className={c.popPart}>
          <span className={c.popQ}>What&apos;s this column called?</span>
          <input className={c.popInput} value={col.name} maxLength={40} onChange={e => set({ name: e.target.value })} />
        </label>
        <div className={c.popPart}>
          <span className={c.popQ}>What kind of answer?</span>
          <div className={c.chips}>
            {COL_TYPES.map(t => (
              <button key={t} type="button" aria-pressed={col.type === t} className={`${c.chip}${col.type === t ? ` ${c.chipOn}` : ''}`} onClick={() => set({ type: t })}>
                <span className={c.glyph}>{TYPE_GLYPH[t]}</span>{t}
              </button>
            ))}
          </div>
        </div>
        <CanvasSwitch on={col.req} label="⭐ Required before submit" onChange={req => set({ req })} />
        <CanvasSwitch on={col.pic} label="👁 Visible to PIC" onChange={pic => set({ pic })} />
        <CanvasStageChips stages={stages} value={col.stage} onPick={sid => set({ stage: sid })} />
        {onRemove ? <div className={c.popFoot}><button type="button" className={c.popRemove} onClick={onRemove}>Remove column</button></div> : null}
      </div>
    )
  }

  const field = target.field
  const set = (next: CanvasField) => onField?.(next)
  const opts = field.opts ?? []
  const names = Object.keys(lists)
  const shared = field.list ? lists[field.list] ?? [] : null
  const addOpt = () => {
    const o = opt.trim().slice(0, 40)
    if (!o || opts.length >= MAX_OPTIONS || opts.some(x => x.trim().toLowerCase() === o.toLowerCase())) return
    set({ ...field, opts: [...opts, o] })
    setOpt('')
  }
  const addShared = () =>
    start(async () => {
      const o = optionWords(opt)
      if (!o || !field.list) return
      const r = await addMktOption(field.list, o)
      if (!r.ok) return say?.(r.reason)
      onList?.(r.list, r.opts)
      setOpt('')
      say?.(`${r.option} · on ${r.list}`)
    })
  const removeShared = (o: string) =>
    start(async () => {
      if (!field.list) return
      const r = await removeMktOption(field.list, o)
      if (!r.ok) return say?.(r.reason)
      onList?.(r.list, r.opts)
      say?.(`${o} taken off ${r.list} · answers that picked it keep it`)
    })
  const cal = field.cal ?? null
  const cols = field.cols ?? []
  return (
    <div className={c.pop} role="dialog" aria-label={`Field ${field.label || 'settings'}`} onClick={e => e.stopPropagation()}>
      <div className={c.popHead}>
        <span className={c.popLabel}>Field settings</span>
        <button type="button" className={c.popX} aria-label="Close" onClick={onClose}>×</button>
      </div>
      <label className={c.popPart}>
        <span className={c.popQ}>What&apos;s this field called?</span>
        <input className={c.popInput} value={field.label} maxLength={field.type === 'Note' ? 300 : 60} onChange={e => set({ ...field, label: e.target.value })} />
      </label>
      <div className={c.popPart}>
        <span className={c.popQ}>What kind of answer?</span>
        <div className={c.chips}>
          {FIELD_TYPES.map(t => (
            <button key={t} type="button" aria-pressed={field.type === t} className={`${c.chip}${field.type === t ? ` ${c.chipOn}` : ''}`} onClick={() => set(withType(field, t))}>
              <span className={c.glyph}>{TYPE_GLYPH[t]}</span>{t}
            </button>
          ))}
        </div>
      </div>
      {isChoice(field.type) ? (
        <div className={c.popBox}>
          {names.length ? (
            <>
              <span className={c.popQ}>Where do the options come from?</span>
              <div className={c.srcList} role="radiogroup" aria-label="Where do the options come from?">
                {names.map(name => (
                  <button key={name} type="button" role="radio" aria-checked={field.list === name} className={`${c.src}${field.list === name ? ` ${c.srcOn}` : ''}`}
                    onClick={() => set({ ...field, list: name })}>
                    <span className={c.srcDot} />
                    <span>
                      <span className={c.srcName}>Shared option list · {name}</span>
                      <span className={c.srcHint}>{lists[name].length} option{lists[name].length === 1 ? '' : 's'} · used across the group</span>
                    </span>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={!field.list} className={`${c.src}${field.list ? '' : ` ${c.srcOn}`}`}
                  onClick={() => { const next = { ...field }; delete next.list; set(next) }}>
                  <span className={c.srcDot} />
                  <span>
                    <span className={c.srcName}>Own options for this field</span>
                    <span className={c.srcHint}>{opts.length} option{opts.length === 1 ? '' : 's'} · this template only</span>
                  </span>
                </button>
              </div>
            </>
          ) : null}
          <span className={c.popQ}>Options</span>
          <div className={c.opts}>
            {(shared ?? opts).map((o, i) => (
              <span key={`${o}-${i}`} className={c.opt}>
                {o}
                <button type="button" className={c.optX} aria-label={`Remove ${o}`} disabled={pending}
                  onClick={() => (shared ? removeShared(o) : set({ ...field, opts: opts.filter((_, j) => j !== i) }))}>×</button>
              </span>
            ))}
            {(shared ?? opts).length ? null : <span className={c.optNone}>No options yet</span>}
          </div>
          <div className={c.optAdd}>
            <input className={c.popInput} value={opt} maxLength={40} placeholder={shared ? `New option for ${field.list}` : 'New option'} aria-label="New option"
              onChange={e => setOpt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (shared) addShared()
                  else addOpt()
                }
              }} />
            <button type="button" className={c.optBtn} disabled={!opt.trim() || pending || (shared ? shared.length >= LIST_MAX : opts.length >= MAX_OPTIONS)}
              onClick={shared ? addShared : addOpt}>Add</button>
          </div>
        </div>
      ) : null}
      {field.type === 'Table' ? (
        <>
          <div className={c.popBox}>
            <span className={c.popQ}>Columns · {cols.length}</span>
            <button type="button" className={c.addField} disabled={cols.length >= TABLE_MAX_COLS}
              onClick={() => set({ ...field, cols: [...cols, newCanvasCol(field.stage, `Column ${cols.length + 1}`)], rows: (field.rows ?? []).map(r => [...r, '']) })}>+ Add column</button>
          </div>
          <CanvasPresetRows cols={cols} rows={field.rows ?? []} onChange={rows => set({ ...field, rows })} />
        </>
      ) : null}
      <CanvasSwitch on={field.req && field.type !== 'Note'} label="⭐ Required before submit" disabled={field.type === 'Note'} onChange={req => set({ ...field, req })} />
      <CanvasSwitch on={field.pic} label="👁 Visible to PIC" onChange={pic => set({ ...field, pic })} />
      <CanvasStageChips stages={stages} value={field.stage} onPick={sid => set({ ...field, stage: sid })} />
      {field.type === 'Date' ? (
        <div className={c.popBox}>
          <CanvasSwitch on={!!cal} label="📅 Show on calendar" onChange={on => set({ ...field, cal: on ? { kind: 'post', pic: false } : null })} />
          {cal ? (
            <>
              <div className={c.popPart}>
                <span className={c.popSmall}>Which date is it?</span>
                <div className={c.calKinds} role="radiogroup" aria-label="Which date is it?">
                  {CAL_KINDS.map(k => (
                    <button key={k.key} type="button" role="radio" aria-checked={cal.kind === k.key}
                      className={`${c.calChip} ${c[`cal_${k.tone}`]}${cal.kind === k.key ? ` ${c.calChipOn}` : ''}`}
                      onClick={() => set({ ...field, cal: { ...cal, kind: k.key } })}>
                      {k.glyph} {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <CanvasSwitch on={cal.pic} label="Visible on PIC calendar" onChange={pic => set({ ...field, cal: { ...cal, pic } })} />
            </>
          ) : null}
        </div>
      ) : null}
      {onRemove ? <div className={c.popFoot}><button type="button" className={c.popRemove} onClick={onRemove}>Remove field</button></div> : null}
    </div>
  )
}
