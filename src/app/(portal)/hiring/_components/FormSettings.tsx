'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { flash } from '@/components/hrv/toast'
import { Select } from '@/components/hrv/select'
import { addHiringSource, removeHiringSource, saveHiringFormFields, setHiringSourceActive } from '@/lib/hiring/actions'
import type { HiringBoard, HiringField, HiringFieldType } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * Hiring › Requests › Form settings (README §11, portal-33): what requesters
 * fill in — each field's order (↑ ↓), name, answer type, choices and whether it
 * is required; Position and Department are Core (renamed, never removed). And
 * the hiring sources, each with its hires, On / Off, × while unused. A change
 * is kept as it is made, as the handoff's are (a name or choices once typing
 * stops).
 */
const TYPES: ReadonlyArray<{ v: HiringFieldType; label: string }> = [
  { v: 'text', label: 'Short text' },
  { v: 'number', label: 'Number' },
  { v: 'longtext', label: 'Long text' },
  { v: 'select', label: 'Choice' },
  { v: 'range', label: 'Range (from–to)' },
]

export function newFieldId(): string {
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

export default function FormSettings({ board, onPreview }: { board: HiringBoard; onPreview: () => void }) {
  const [fields, setFields] = useState<HiringField[]>(board.fields)
  const [newField, setNewField] = useState('')
  const [newSource, setNewSource] = useState('')
  const [, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(fields)
  latest.current = fields

  // The page's newest read wins while nothing is waiting to be kept.
  const seen = JSON.stringify(board.fields)
  useEffect(() => {
    if (!timer.current) setFields(JSON.parse(seen) as HiringField[])
  }, [seen])

  const save = (next: HiringField[]) =>
    start(async () => {
      const out = await saveHiringFormFields(next)
      if (!out.ok) flash(out.reason)
    })
  const keepNow = (next: HiringField[]) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setFields(next)
    save(next)
  }
  const keepSoon = (next: HiringField[]) => {
    setFields(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      save(latest.current)
    }, 600)
  }
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      save(latest.current)
    }
    // Flush once, on leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (id: string, patch: Partial<HiringField>) => fields.map(f => (f.id === id ? { ...f, ...patch } : f))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= fields.length) return
    const next = fields.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    keepNow(next)
  }
  const addField = () => {
    const label = newField.trim()
    if (!label) return
    setNewField('')
    keepNow([...fields, { id: newFieldId(), label, type: 'text', options: '', required: false, core: false }])
  }
  const addSource = () => {
    const name = newSource.trim()
    if (!name || board.sources.some(x => x.name.toLowerCase() === name.toLowerCase())) return
    start(async () => {
      const out = await addHiringSource(name)
      if (!out.ok) return flash(out.reason)
      setNewSource('')
    })
  }

  return (
    <>
      <section className={s.fsCard} aria-label="What requesters fill in">
        <div className={s.fsHead}>
          <span className={s.fsTitle}>What requesters fill in</span>
          <span className={s.grow} />
          <button type="button" className={s.btnGhost} onClick={onPreview} style={{ padding: '6px 12px' }}>
            Preview form
          </button>
        </div>
        <div className={s.fsLede}>Changes apply to new requests. Position and Department are needed for the request list, so they can be renamed but not removed.</div>
        <div className={`${s.fsCols} ${s.fsHeadRow}`}>
          <span />
          <span>Field</span>
          <span>Answer type</span>
          <span>Choices</span>
          <span>Required</span>
          <span />
        </div>
        {fields.map((f, i) => (
          <div key={f.id} className={`${s.fsCols} ${s.fsRow}`}>
            <span className={s.arrows}>
              <button type="button" className={s.arrow} title="Move up" aria-label={`Move ${f.label} up`} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" className={s.arrow} title="Move down" aria-label={`Move ${f.label} down`} onClick={() => move(i, 1)}>
                ↓
              </button>
            </span>
            <input className={`${s.input} ${s.fsInput}`} value={f.label} aria-label="Field name" onChange={e => keepSoon(update(f.id, { label: e.target.value }))} />
            <Select
              bare
              className={`${s.select} ${s.fsSelect}`}
              aria-label="Answer type"
              value={f.type}
              onChange={e => {
                if (f.core) return flash(`${f.label} is a core field`)
                keepNow(update(f.id, { type: e.target.value as HiringFieldType }))
              }}
            >
              {TYPES.map(t => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </Select>
            {f.type === 'select' ? (
              <input className={`${s.input} ${s.fsInput}`} value={f.options} placeholder="Comma-separated" aria-label="Choices" onChange={e => keepSoon(update(f.id, { options: e.target.value }))} />
            ) : (
              <span className={s.dash}>—</span>
            )}
            <button
              type="button"
              className={s.toggleBtn}
              aria-pressed={f.required}
              onClick={() => (f.core ? flash(`${f.label} is always required`) : keepNow(update(f.id, { required: !f.required })))}
            >
              <span className={s.track} data-on={f.required ? 'true' : 'false'} aria-hidden="true">
                <span className={s.knob} />
              </span>
              {f.required ? 'Required' : 'Optional'}
            </button>
            {f.core ? (
              <span className={s.core} title="Core field">
                Core
              </span>
            ) : (
              <button type="button" className={s.remove} title="Remove field" aria-label={`Remove ${f.label}`} onClick={() => keepNow(fields.filter(x => x.id !== f.id))}>
                ×
              </button>
            )}
          </div>
        ))}
        <div className={s.addRow}>
          <input
            className={`${s.input} ${s.addInput}`}
            value={newField}
            placeholder="New field, e.g. Languages"
            aria-label="New field"
            onChange={e => setNewField(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addField()
            }}
          />
          <button type="button" className={`${s.btnPlain} ${s.addBtn}`} onClick={addField}>
            + Add field
          </button>
        </div>
      </section>

      <section className={s.fsCard} aria-label="Hiring sources">
        <div className={s.fsTitle} style={{ marginBottom: 4 }}>Hiring sources</div>
        <div className={s.fsLede4}>Where a hire came from. Picked when a request is marked filled, and counted in Insights. Turn off the ones you don&apos;t use.</div>
        <div className={s.sources}>
          {board.sources.map(src => (
            <div key={src.id} className={s.source}>
              <span className={s.sourceName}>
                {src.name}
                <span className={s.sourceUsed}>{src.used} hires</span>
              </span>
              <button
                type="button"
                className={s.toggleRight}
                aria-pressed={src.active}
                onClick={() =>
                  start(async () => {
                    const out = await setHiringSourceActive(src.id, !src.active)
                    if (!out.ok) flash(out.reason)
                  })
                }
              >
                {src.active ? 'On' : 'Off'}
                <span className={s.track} data-on={src.active ? 'true' : 'false'} aria-hidden="true">
                  <span className={s.knob} />
                </span>
              </button>
              {src.used === 0 ? (
                <button
                  type="button"
                  className={s.removeSmall}
                  title="Delete"
                  aria-label={`Delete ${src.name}`}
                  onClick={() =>
                    start(async () => {
                      const out = await removeHiringSource(src.id)
                      if (!out.ok) flash(out.reason)
                    })
                  }
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className={s.addRow}>
          <input
            className={`${s.input} ${s.addInput}`}
            value={newSource}
            placeholder="New source, e.g. Indeed"
            aria-label="New source"
            onChange={e => setNewSource(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') addSource()
            }}
          />
          <button type="button" className={`${s.btnGhost} ${s.addBtn}`} onClick={addSource}>
            + Add source
          </button>
        </div>
      </section>
    </>
  )
}
