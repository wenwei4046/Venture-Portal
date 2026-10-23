'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { flash } from '@/components/hrv/toast'
import { Select } from '@/components/hrv/select'
import {
  addHiringFileType, addHiringSource, addTalentReason, removeHiringSource, renameHiringFileType, renameTalentReason, saveHiringFormFields,
  setHiringFileTypeActive, setHiringSourceActive, setTalentReasonActive, type HiringOutcome,
} from '@/lib/hiring/actions'
import type { HiringBoard, HiringField, HiringFieldType } from '@/lib/hiring/types'
import s from './hiring.module.css'

/**
 * Hiring › Requests › Form settings (README §11, portal-33): what requesters
 * fill in — each field's order (↑ ↓), name, answer type, choices and whether it
 * is required; Position and Department are Core (renamed, never removed). And
 * the hiring sources, each with its hires, On / Off, × while unused. And
 * (2026-10-11, the user: rename and turn off) the file types, each with its
 * files, ✎ to rename, On / Off — Résumé is built in. And (2026-10-24, the user:
 * "1, yes do with same") the Talent Bank's reasons, the same way, each with the
 * people kept with it. A change is kept as it is made, as the handoff's are (a
 * name or choices once typing stops).
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
        <div className={s.fsTitle} style={{ marginBottom: 12 }}>Hiring sources</div>
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

      <NamedList
        title="File types"
        items={board.fileTypes}
        used={n => (n === 1 ? '1 file' : `${n} files`)}
        placeholder="New type, e.g. Driving licence"
        newLabel="New file type"
        addLabel="+ Add type"
        taken="That type is already there."
        rename={renameHiringFileType}
        toggle={setHiringFileTypeActive}
        add={addHiringFileType}
      />
      <NamedList
        title="Talent Bank reasons"
        items={board.talentReasons}
        used={n => (n === 1 ? '1 person' : `${n} people`)}
        placeholder="New reason, e.g. Salary too high"
        newLabel="New reason"
        addLabel="+ Add reason"
        taken="That reason is already there."
        rename={renameTalentReason}
        toggle={setTalentReasonActive}
        add={addTalentReason}
      />
    </>
  )
}

/**
 * A list kept by name — File types (2026-10-11, mig 20261011210000 — the user:
 * rename and turn off) and the Talent Bank's reasons (2026-10-24, mig
 * 20261025021500 — "do with same"): the hiring sources' cards — the name and how
 * often it is used, ✎ to rename (Enter or leaving the field keeps it, Esc lets
 * it be), On / Off; Résumé says *Built in*. One turned off leaves the pickers;
 * what is already filed or kept under it keeps it. *+ Add …* names a new one
 * (one that was off comes back on).
 */
function NamedList({
  title,
  items,
  used,
  placeholder,
  newLabel,
  addLabel,
  taken,
  rename: renameIt,
  toggle,
  add,
}: {
  title: string
  items: ReadonlyArray<{ id: string; name: string; active: boolean; used: number; builtin?: string | null }>
  used: (n: number) => string
  placeholder: string
  newLabel: string
  addLabel: string
  /** What a name the list has on already is told. */
  taken: string
  rename: (id: string, name: string) => Promise<HiringOutcome>
  toggle: (id: string, active: boolean) => Promise<HiringOutcome>
  add: (name: string) => Promise<{ ok: true } | { ok: false; reason: string }>
}) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [, start] = useTransition()
  const field = useRef<HTMLInputElement>(null)
  const cancelled = useRef(false)
  const renamingId = renaming?.id ?? null
  useEffect(() => {
    if (renamingId) field.current?.focus()
  }, [renamingId])

  // Leaving the field ends a rename — Enter leaves it, Esc leaves it unkept — so a name is kept once.
  const rename = (t: (typeof items)[number]) => {
    const name = renaming?.id === t.id ? renaming.name.trim() : ''
    setRenaming(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (!name || name === t.name) return
    start(async () => {
      const out = await renameIt(t.id, name)
      if (!out.ok) flash(out.reason)
    })
  }
  const addOne = () => {
    const name = newName.trim()
    if (!name) return
    if (items.some(t => t.active && t.name.toLowerCase() === name.toLowerCase())) return flash(taken)
    start(async () => {
      const out = await add(name)
      if (!out.ok) return flash(out.reason)
      setNewName('')
    })
  }

  return (
    <section className={s.fsCard} aria-label={title}>
      <div className={s.fsTitle} style={{ marginBottom: 12 }}>{title}</div>
      <div className={s.sources}>
        {items.map(t => (
          <div key={t.id} className={s.source} data-off={t.active ? undefined : 'true'}>
            {renaming?.id === t.id ? (
              <input
                ref={field}
                className={`${s.input} ${s.typeRename}`}
                value={renaming.name}
                maxLength={60}
                aria-label={`New name for ${t.name}`}
                onChange={e => setRenaming({ id: t.id, name: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Escape') cancelled.current = true
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                }}
                onBlur={() => rename(t)}
              />
            ) : (
              <span className={s.sourceName}>
                {t.name}
                <span className={s.sourceUsed}>{used(t.used)}</span>
              </span>
            )}
            {t.builtin ? (
              <span className={s.typeBuiltIn}>Built in</span>
            ) : (
              <>
                {renaming?.id === t.id ? null : (
                  <button type="button" className={s.renameSmall} title="Rename" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                    ✎
                  </button>
                )}
                <button
                  type="button"
                  className={s.toggleRight}
                  aria-pressed={t.active}
                  aria-label={`${t.name}: ${t.active ? 'on' : 'off'}`}
                  onClick={() =>
                    start(async () => {
                      const out = await toggle(t.id, !t.active)
                      if (!out.ok) flash(out.reason)
                    })
                  }
                >
                  {t.active ? 'On' : 'Off'}
                  <span className={s.track} data-on={t.active ? 'true' : 'false'} aria-hidden="true">
                    <span className={s.knob} />
                  </span>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className={s.addRow}>
        <input
          className={`${s.input} ${s.addInput}`}
          value={newName}
          maxLength={60}
          placeholder={placeholder}
          aria-label={newLabel}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addOne()
          }}
        />
        <button type="button" className={`${s.btnGhost} ${s.addBtn}`} onClick={addOne}>
          {addLabel}
        </button>
      </div>
    </section>
  )
}
