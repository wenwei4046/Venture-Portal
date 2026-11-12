'use client'

import { useEffect, useRef, useState } from 'react'
import {
  addField, duplicateField, MAX_HELP, MAX_MINUTES_FIELDS, moveField, ONCE_TYPES, retype, TYPE_CARDS, TYPE_GLYPH, typeBlocked,
  type MinutesField, type MinutesProblem,
} from '@/lib/marketing/minutes'
import MinutesTableEditor from './MinutesTableEditor'
import Steady from './Steady'
import m from './minutes.module.css'

// The Fields tab (v2): one card of rows — ⋮⋮ to drag, the kind's glyph, the name (🔒 locked, a red dot when publishing
// would refuse it), the kind under it with the hint or a table's columns, and the quick Required / PIC pills. A click
// opens the row's settings in place (again closes it): the name, a hint for staff, the kind (changeable — never a
// locked field's, never a once-only kind another field holds), a table's editor, Up / Down / Duplicate / Remove.
// "+ Add field" opens the type cards; the field lands after the one picked, else before the signatures.

const LOCKED = 'Every minutes keeps this field, so it can’t be renamed, retyped, made optional or removed'

export default function MinutesFields({ fields, selKey, reveal, problems, adding, closeTick, onFields, onSelect, setAdding, flash }: {
  fields: MinutesField[]
  selKey: string | null
  /** A field picked from the preview or a Fix chip, to bring into view. */
  reveal: { key: string; n: number } | null
  problems: MinutesProblem[]
  adding: boolean
  closeTick: number
  onFields: (next: MinutesField[]) => void
  onSelect: (key: string | null) => void
  setAdding: (on: boolean) => void
  flash: (words: string) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const bad = new Map(problems.filter(p => p.key).map(p => [p.key as string, p.text]))
  const set = (i: number, f: MinutesField) => onFields(fields.map((x, k) => (k === i ? f : x)))
  const selIdx = fields.findIndex(f => f.key === selKey)
  const after = selIdx >= 0 && fields[selIdx].type !== 'Signature' ? `after “${fields[selIdx].name || 'Untitled field'}”` : 'before Signatures'

  // Picked from elsewhere (the preview, a Fix chip): brought into view — never a row clicked here, which stays put.
  useEffect(() => {
    if (reveal) rowRefs.current.get(reveal.key)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [reveal])

  useEffect(() => {
    if (!adding) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAdding(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [adding, setAdding])

  return (
    <div className={m.list}>
      {fields.map((f, i) => {
        const on = f.key === selKey
        const isTitle = f.type === 'Title'
        const req = !isTitle && (f.req || f.lock)
        const cols = f.cols ?? []
        const sub = f.type === 'Table' ? `${f.type} · ${cols.map(c => c.name || '…').join(', ')}` : f.help ? `${f.type} · ${f.help}` : f.type
        const badText = bad.get(f.key)
        return (
          <div key={f.key} className={`${m.fwrap}${on ? ` ${m.fwrapOn}` : ''}`} ref={el => { if (el) rowRefs.current.set(f.key, el); else rowRefs.current.delete(f.key) }}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={on}
              aria-label={`${f.name.trim() || 'Untitled field'} · ${f.type}`}
              className={`${m.frow}${on ? ` ${m.frowOn}` : ''}${drag === i ? ` ${m.frowDrag}` : ''}`}
              draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', f.key)
                setDrag(i)
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const from = drag
                setDrag(null)
                if (from === null || from === i) return
                const next = [...fields]
                const [x] = next.splice(from, 1)
                next.splice(i, 0, x)
                onFields(next)
              }}
              onDragEnd={() => setDrag(null)}
              onClick={() => onSelect(on ? null : f.key)}
              onKeyDown={e => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(on ? null : f.key)
                }
              }}
            >
              <span className={m.grip} title="Drag to reorder" aria-hidden="true">⋮⋮</span>
              <span className={m.glyph} aria-hidden="true">{TYPE_GLYPH[f.type]}</span>
              <div className={m.fmain}>
                <div className={m.fnameRow}>
                  <span className={`${m.fname}${f.name.trim() ? '' : ` ${m.fnameEmpty}`}`}>{f.name.trim() || 'Untitled field'}</span>
                  {f.lock ? <span className={m.lockIcon} title="Every minutes keeps this field" aria-label="Locked">🔒</span> : null}
                  {badText ? <span className={m.badDot} title={badText} aria-label={badText} /> : null}
                </div>
                <div className={m.fsub}>{sub}</div>
              </div>
              <div className={m.pills}>
                {/* A Title is a fixed sentence — nothing to fill in, so never required (the user, 2026-11-12). */}
                {isTitle ? null : <button
                  type="button"
                  className={`${m.pill} ${req ? m.reqOn : m.reqOff}${f.lock ? ` ${m.pillLocked}` : ''}`}
                  aria-pressed={req}
                  aria-label={`${f.name.trim() || 'Untitled field'} is required`}
                  title={f.lock ? 'Every minutes keeps it' : 'Click to toggle'}
                  onClick={e => {
                    e.stopPropagation()
                    if (!f.lock) set(i, { ...f, req: !f.req })
                  }}
                >
                  <Steady show={req ? 'Required' : 'Optional'} also={['Required', 'Optional']} bold />
                </button>}
                <button
                  type="button"
                  className={`${m.pill} ${f.pic ? m.picOn : m.picOff}`}
                  aria-pressed={f.pic}
                  aria-label={`The PIC sees ${f.name.trim() || 'Untitled field'}`}
                  title="Whether the PIC sees this on the approval link"
                  onClick={e => {
                    e.stopPropagation()
                    set(i, { ...f, pic: !f.pic })
                  }}
                >
                  <Steady show={f.pic ? '👁 PIC' : 'Hidden'} also={['👁 PIC', 'Hidden']} />
                </button>
              </div>
            </div>

            {on ? (
              <div className={m.fset}>
                <div className={m.fgrid}>
                  <label className={m.flabel}>
                    <span className={m.flabelText}>{isTitle ? 'Title' : 'Field name'}</span>
                    <input
                      className={`${m.input}${!f.name.trim() || badText ? ` ${m.inputBad}` : ''}`}
                      value={f.name}
                      readOnly={f.lock}
                      maxLength={60}
                      placeholder={isTitle ? 'e.g. Year-end Kickoff Meeting' : 'e.g. Decisions'}
                      title={f.lock ? LOCKED : undefined}
                      onChange={e => set(i, { ...f, name: e.target.value })}
                    />
                  </label>
                  <label className={m.flabel}>
                    <span className={m.flabelText}>{isTitle ? 'Description' : 'Hint for staff'} <span className={m.optional}>· optional</span></span>
                    <input className={m.input} value={f.help ?? ''} maxLength={MAX_HELP} placeholder={isTitle ? 'Shown under the title' : 'Shown under the field name'} onChange={e => set(i, { ...f, help: e.target.value })} />
                  </label>
                </div>
                {/* A Title asks no answer: no kinds to pick (the user, 2026-11-12 — "不需要再什么 long answer 之类的"). */}
                {isTitle ? null : <div className={m.kindBlock}>
                  <span className={m.flabelText} id={`kind-${f.key}`}>Kind of answer</span>
                  <div className={m.kinds} role="radiogroup" aria-labelledby={`kind-${f.key}`}>
                    {TYPE_CARDS.map(c => {
                      const cur = f.type === c.type
                      const dis = typeBlocked(fields, i, c.type)
                      return (
                        <button
                          key={c.type}
                          type="button"
                          role="radio"
                          aria-checked={cur}
                          className={`${m.kind}${cur ? ` ${m.kindOn}` : ''}${f.lock && cur ? ` ${m.kindLocked}` : ''}`}
                          disabled={dis}
                          title={f.lock ? LOCKED : dis ? 'Already in this template' : c.desc}
                          onClick={() => !cur && !dis && set(i, retype(f, c.type))}
                        >
                          <span className={m.kindGlyph}>{c.glyph}</span>
                          {c.type}
                        </button>
                      )
                    })}
                  </div>
                </div>}

                {f.type === 'Table' ? <MinutesTableEditor field={f} closeTick={closeTick} onChange={next => set(i, next)} /> : null}

                <div className={m.factions}>
                  <button type="button" className={m.fbtn} disabled={i === 0 || f.lock} title={f.lock ? LOCKED : undefined} onClick={() => onFields(moveField(fields, i, i - 1))}>↑ Up</button>
                  <button type="button" className={m.fbtn} disabled={i === fields.length - 1 || f.lock} title={f.lock ? LOCKED : undefined} onClick={() => onFields(moveField(fields, i, i + 1))}>↓ Down</button>
                  <button
                    type="button"
                    className={m.fbtn}
                    disabled={f.lock || ONCE_TYPES.includes(f.type) || fields.length >= MAX_MINUTES_FIELDS}
                    title={f.lock ? LOCKED : ONCE_TYPES.includes(f.type) ? 'Kept once a template' : undefined}
                    onClick={() => {
                      const d = duplicateField(fields, i)
                      if (!d) return
                      onFields(d.fields)
                      onSelect(d.key)
                    }}
                  >
                    Duplicate
                  </button>
                  <span className={m.grow} />
                  <button
                    type="button"
                    className={m.fdel}
                    disabled={f.lock}
                    title={f.lock ? LOCKED : undefined}
                    onClick={() => {
                      onFields(fields.filter((_, k) => k !== i))
                      onSelect(null)
                      flash(`Removed “${f.name.trim() || 'Untitled field'}”`)
                    }}
                  >
                    Remove field
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}

      {adding ? (
        <div className={m.addPanel}>
          <div className={m.addHead}>
            <span className={m.addTitle}>Add a field {after}</span>
            <button type="button" className={m.addX} aria-label="Close" onClick={() => setAdding(false)}>×</button>
          </div>
          <div className={m.cards}>
            {TYPE_CARDS.map(c => {
              const dis = ONCE_TYPES.includes(c.type) && fields.some(f => f.type === c.type)
              return (
                <button
                  key={c.type}
                  type="button"
                  className={m.card}
                  disabled={dis}
                  title={dis ? 'Already in this template' : undefined}
                  onClick={() => {
                    const a = addField(fields, c.type, selKey)
                    onFields(a.fields)
                    onSelect(a.key)
                    setAdding(false)
                  }}
                >
                  <span className={m.cardGlyph} aria-hidden="true">{c.glyph}</span>
                  <span>
                    <span className={m.cardLabel}>{c.type}</span>
                    <span className={m.cardDesc}>{c.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <button type="button" className={m.addBar} disabled={fields.length >= MAX_MINUTES_FIELDS} onClick={() => setAdding(true)}>+ Add field</button>
      )}
    </div>
  )
}
