'use client'

import { useState, useTransition } from 'react'
import { addMktOption, removeMktOption } from '@/lib/marketing/actions'
import { CANVAS_TYPES, fieldPic, fieldReq, isChoice, MAX_OPTIONS, withType } from '@/lib/marketing/canvas'
import { LIST_MAX, optionWords, type OptionLists } from '@/lib/marketing/options'
import { CAL_KINDS, FIELD_GLYPH, type FormField } from '@/lib/marketing/tasks'
import c from './canvas.module.css'

// The canvas's two settings panels (`Canvas Template Editor.dc.html`): a section's (🔒 / ⭐ / 👁, which stage fills it in)
// and a field's (its name and kind of answer, a choice's options — its own, or a shared list's (③d-2 — the user's
// answer 9), ⭐ / 👁, which stage fills it in, a date on the calendar — which kind of date, one of six since 2026-10-24
// (the user's answer 16: "要，固定种类"), the PIC's calendar). Each answers the whole thing changed; the editor keeps it —
// but a shared list is the group's, so an option added to it or taken off is written at once.

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={c.swRow} disabled={disabled} onClick={() => onChange(!on)}>
      <span className={`${c.sw}${on ? ` ${c.swOn}` : ''}`} />
      <span>{label}</span>
    </button>
  )
}

function StageChips({ stages, at, any, fixed, onPick }: { stages: string[]; at: number | null; any?: boolean; fixed?: boolean; onPick: (at: number | null) => void }) {
  return (
    <div className={c.chips} role="radiogroup" aria-label="Which stage fills this in?">
      {any ? (
        <button type="button" role="radio" aria-checked={at === null} className={`${c.chip}${at === null ? ` ${c.chipOn}` : ''}`} onClick={() => onPick(null)}>Any stage</button>
      ) : null}
      {stages.map((name, i) =>
        fixed && i !== at ? null : (
          <button key={i} type="button" role="radio" aria-checked={at === i} disabled={fixed} className={`${c.chip}${at === i ? ` ${c.chipOn}` : ''}`} onClick={() => onPick(i)}>
            {name || `Stage ${i + 1}`}
          </button>
        ),
      )}
    </div>
  )
}

export interface SecSettings {
  locked: boolean
  req: boolean
  pic: boolean
}

/** A section's settings. `stage`: its stage fixed (a stage's own section), any of them (the manager's), or none (📋). */
export function SectionPop({
  title,
  sec,
  showPic,
  only,
  stages,
  stage,
  onChange,
  onStage,
  onRemove,
  onEditStage,
  onClose,
}: {
  title: string
  sec: SecSettings
  showPic: boolean
  /** Only whether the PIC sees it is set (📋 Requirements). */
  only?: 'pic'
  stages: string[]
  stage: { at: number | null; fixed: boolean } | null
  onChange: (next: SecSettings) => void
  onStage?: (at: number | null) => void
  onRemove?: () => void
  onEditStage?: () => void
  onClose: () => void
}) {
  return (
    <div className={c.pop} role="dialog" aria-label={`Section ${title}`}>
      <div className={c.popHead}>
        <span className={c.popLabel}>Section · {title}</span>
        <button type="button" className={c.popX} aria-label="Close" onClick={onClose}>×</button>
      </div>
      {only === 'pic' ? (
        <>
          <Switch on label="🔒 Locked — colleagues can't delete" disabled onChange={() => undefined} />
          {showPic ? <Switch on={sec.pic} label="👁 Visible to PIC" onChange={pic => onChange({ ...sec, pic })} /> : null}
        </>
      ) : (
        <>
          <Switch on={sec.locked} label="🔒 Locked — colleagues can't delete" onChange={locked => onChange({ ...sec, locked })} />
          <Switch on={sec.req} label="⭐ Required before submit" onChange={req => onChange({ ...sec, req })} />
          {showPic ? <Switch on={sec.pic} label="👁 Visible to PIC" onChange={pic => onChange({ ...sec, pic })} /> : null}
        </>
      )}
      {stage ? (
        <div className={c.popPart}>
          <span>🎯 Which stage fills this in?</span>
          <StageChips stages={stages} at={stage.at} any={!stage.fixed} fixed={stage.fixed} onPick={at => onStage?.(at)} />
        </div>
      ) : null}
      {onEditStage || onRemove ? (
        <div className={c.popFoot}>
          {onEditStage ? <button type="button" className={c.popLink} onClick={onEditStage}>Edit in Workflow stages</button> : null}
          {onRemove ? <button type="button" className={c.popRemove} onClick={onRemove}>Remove section</button> : null}
        </div>
      ) : null}
    </div>
  )
}

/** A field's settings. `own`: a stage's own field (its stage fixed — named here or on the stage), else the manager's. */
export function FieldPop<T extends FormField>({
  field,
  stages,
  stage,
  own,
  showPic,
  top,
  onChange,
  onStage,
  onRemove,
  onClose,
  lists = {},
  onList,
  say,
}: {
  field: T
  stages: string[]
  stage: number | null
  own: boolean
  showPic: boolean
  /** Where the panel opens (px from its row's top); under the row unless given. */
  top?: number
  onChange: (next: T) => void
  onStage?: (at: number) => void
  onRemove?: () => void
  onClose: () => void
  /** The shared option lists (③d-2): a choice may take one's options. */
  lists?: OptionLists
  /** A shared list as it now stands, once an option was added to it or taken off. */
  onList?: (name: string, opts: string[]) => void
  say?: (words: string) => void
}) {
  const [opt, setOpt] = useState('')
  const [pending, start] = useTransition()
  const opts = field.opts ?? []
  // A stage's field of a kind the canvas does not offer (a number, a table, a note) keeps its kind.
  const typed = (CANVAS_TYPES as readonly string[]).includes(field.type)
  const names = Object.keys(lists)
  // The shared list it names — one not there any more offers nothing until another is picked.
  const shared = field.list ? lists[field.list] ?? [] : null
  const addOpt = () => {
    const o = opt.trim().slice(0, 40)
    if (!o || opts.length >= MAX_OPTIONS || opts.some(x => x.trim().toLowerCase() === o.toLowerCase())) return
    onChange({ ...field, opts: [...opts, o] })
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
  return (
    <div className={c.pop} style={top != null ? { top } : undefined} role="dialog" aria-label={`Field ${field.label || 'settings'}`}>
      <div className={c.popHead}>
        <span className={c.popLabel}>Field settings</span>
        <button type="button" className={c.popX} aria-label="Close" onClick={onClose}>×</button>
      </div>
      <label className={c.popPart}>
        <span className={c.popQ}>What&apos;s this field called?</span>
        <input className={c.popInput} value={field.label} maxLength={field.type === 'Note' ? 300 : 60} onChange={e => onChange({ ...field, label: e.target.value })} />
      </label>
      <div className={c.popPart}>
        <span className={c.popQ}>What kind of answer?</span>
        <div className={c.chips}>
          {typed
            ? CANVAS_TYPES.map(t => (
                <button key={t} type="button" aria-pressed={field.type === t} className={`${c.chip}${field.type === t ? ` ${c.chipOn}` : ''}`} onClick={() => onChange(withType(field, t))}>
                  <span className={c.glyph}>{FIELD_GLYPH[t]}</span>
                  {t}
                </button>
              ))
            : <span className={`${c.chip} ${c.chipOn}`}><span className={c.glyph}>{FIELD_GLYPH[field.type]}</span>{field.type}</span>}
        </div>
      </div>
      {isChoice(field.type) ? (
        <div className={c.popBox}>
          {names.length ? (
            <>
              <span className={c.popQ}>Where do the options come from?</span>
              <div role="radiogroup" aria-label="Where do the options come from?">
                {names.map(name => (
                  <button key={name} type="button" role="radio" aria-checked={field.list === name} className={`${c.src}${field.list === name ? ` ${c.srcOn}` : ''}`}
                    onClick={() => onChange({ ...field, list: name })}>
                    <span className={c.srcDot} />
                    <span>
                      <span className={c.srcName}>Shared option list · {name}</span>
                      <span className={c.srcHint}>{lists[name].length} option{lists[name].length === 1 ? '' : 's'} · used across the group</span>
                    </span>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={!field.list} className={`${c.src}${field.list ? '' : ` ${c.srcOn}`}`}
                  onClick={() => onChange({ ...field, list: undefined })}>
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
                  onClick={() => (shared ? removeShared(o) : onChange({ ...field, opts: opts.filter((_, j) => j !== i) }))}>×</button>
              </span>
            ))}
            {(shared ?? opts).length ? null : <span className={c.optNone}>No options yet</span>}
          </div>
          <div className={c.optAdd}>
            <input
              className={c.popInput}
              value={opt}
              maxLength={40}
              placeholder={shared ? `New option for ${field.list}` : 'New option'}
              aria-label="New option"
              onChange={e => setOpt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (shared) addShared()
                  else addOpt()
                }
              }}
            />
            <button type="button" className={c.optBtn}
              disabled={!opt.trim() || pending || (shared ? shared.length >= LIST_MAX : opts.length >= MAX_OPTIONS)}
              onClick={shared ? addShared : addOpt}>Add</button>
          </div>
        </div>
      ) : null}
      <Switch on={fieldReq(field)} label="⭐ Required before submit" disabled={field.type === 'Note'} onChange={req => onChange({ ...field, req })} />
      {showPic ? <Switch on={fieldPic(field)} label="👁 Visible to PIC" onChange={pic => onChange({ ...field, pic })} /> : null}
      <div className={c.popPart}>
        <span>🎯 Which stage fills this in?</span>
        <StageChips stages={stages} at={stage} fixed={own} onPick={at => at !== null && onStage?.(at)} />
      </div>
      {field.type === 'Date' ? (
        <div className={c.popBox}>
          <Switch
            on={!!cal}
            label="📅 Show on calendar"
            onChange={on => onChange({ ...field, cal: on ? { kind: 'post', pic: false } : null })}
          />
          {cal ? (
            <>
              <div className={c.popPart}>
                <span className={c.popSmall}>Which date is it?</span>
                <div className={c.calKinds} role="radiogroup" aria-label="Which date is it?">
                  {CAL_KINDS.map(k => (
                    <button
                      key={k.key}
                      type="button"
                      role="radio"
                      aria-checked={cal.kind === k.key}
                      className={`${c.calChip} ${c[`cal_${k.tone}`]}${cal.kind === k.key ? ` ${c.calChipOn}` : ''}`}
                      onClick={() => onChange({ ...field, cal: { ...cal, kind: k.key } })}
                    >
                      {k.glyph} {k.label}
                    </button>
                  ))}
                </div>
              </div>
              {showPic ? <Switch on={cal.pic} label="Visible on PIC calendar" onChange={pic => onChange({ ...field, cal: { ...cal, pic } })} /> : null}
            </>
          ) : null}
        </div>
      ) : null}
      {onRemove ? (
        <div className={c.popFoot}>
          <button type="button" className={c.popRemove} onClick={onRemove}>Remove field</button>
        </div>
      ) : null}
    </div>
  )
}
