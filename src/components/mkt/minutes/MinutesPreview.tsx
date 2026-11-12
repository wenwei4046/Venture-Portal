'use client'

import { useEffect, useRef, useState } from 'react'
import { startRows, type MinutesField, type MinutesRules } from '@/lib/marketing/minutes'
import Steady from './Steady'
import m from './minutes.module.css'

// The Minutes Builder's live preview (v2, always beside the builder; below 1180px a drawer): the minutes as the staff
// fill them in, or as the PIC reads them on the link — each field as it will ask, its hint, a table's starting rows and
// what the staff may add to it, the checks Complete makes, the buttons each side has. A field clicked here is picked in
// the builder, and the field picked there is ringed here. Typed into here and nothing is kept; Reset clears it. No
// sample data (the user, 2026-11-12): the project is the placeholders the minutes will fill in, the attendees
// Marketing's own people.

type Grid = { cols: string[]; rows: string[][] }
type Table = { xcols: string[]; rows: string[][] }
type Val = string | string[] | Grid | Table | { from: string; to: string }
interface Try {
  vals: Record<string, Val>
  signed: Record<string, boolean>
  approved: boolean
  done: boolean
}
const FRESH: Try = { vals: {}, signed: {}, approved: false, done: false }
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const empty = (f: MinutesField, v: Val | undefined) => {
  if (v === undefined) return true
  if (typeof v === 'string') return !v.trim()
  if (Array.isArray(v)) return v.length === 0
  if ('from' in v) return !v.from || !v.to
  return !v.rows.some(r => r.some(x => String(x).trim()))
}

export default function MinutesPreview({ name, version, fields, rules, attendees, selKey, onSelect, open, onClose }: {
  name: string
  /** "Draft v2" · "v1 · live" */
  version: string
  fields: MinutesField[]
  rules: MinutesRules
  /** Who the minutes list as attending (Marketing's people). */
  attendees: string[]
  selKey: string | null
  onSelect: (key: string) => void
  /** Below 1180px: the drawer is open. */
  open: boolean
  onClose: () => void
}) {
  const [viewer, setViewer] = useState<'staff' | 'pic'>('staff')
  const [t, setT] = useState<Try>(FRESH)
  const refs = useRef(new Map<string, HTMLDivElement>())
  const pic = viewer === 'pic'
  const locked = t.done && rules.lock
  const ro = pic || locked
  const shown = pic ? fields.filter(f => f.pic) : fields
  const att = attendees.length ? attendees : ['Attendee 1', 'Attendee 2']

  // The field picked in the builder is brought into view here.
  useEffect(() => {
    if (selKey) refs.current.get(selKey)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [selKey])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])

  const set = (key: string, v: Val) => setT(x => ({ ...x, vals: { ...x.vals, [key]: v } }))
  const valOf = (f: MinutesField): Val | undefined => {
    const v = t.vals[f.key]
    if (v !== undefined) return v
    if (f.type === 'People') return att
    if (f.type === 'Free space') return { cols: ['Item', 'Details', 'Owner'], rows: [['', '', ''], ['', '', '']] }
    if (f.type === 'Table') return { xcols: [], rows: startRows(f) }
    return undefined
  }
  const missing = fields.filter(f => (f.req || f.lock) && f.type !== 'Signature' && f.type !== 'Project link' && empty(f, valOf(f)))
  const signedN = att.filter(n => t.signed[n]).length
  const checks: { ok: boolean; text: string }[] = pic
    ? [{ ok: true, text: 'Shared by the HOUZS marketing team. Read only.' }, ...(rules.pic ? [] : [{ ok: false, text: 'PIC sign-off is off for this template, so the PIC can only read.' }])]
    : [
        missing.length
          ? { ok: false, text: `${missing.length} required field${missing.length === 1 ? '' : 's'} empty: ${missing.map(f => f.name.trim() || 'Untitled').join(', ')}` }
          : { ok: true, text: 'All required fields filled' },
        ...(rules.sign ? [{ ok: signedN === att.length, text: `Every attendee signs · ${signedN} of ${att.length} signed` }] : []),
        ...(rules.pic ? [{ ok: t.approved, text: t.approved ? 'PIC approved on the link' : 'Waiting for PIC sign-off on the link' }] : []),
        ...(rules.file ? [{ ok: true, text: 'Files to the Library → Minutes on complete' }] : []),
        ...(rules.lock ? [{ ok: true, text: 'Locks after complete' }] : []),
      ]
  const blocked = !pic && checks.some(c => !c.ok)
  const [status, tone] = t.done ? ['Completed', m.stDone]
    : pic ? (rules.pic ? (t.approved ? ['Approved', m.stDone] : ['Needs your approval', m.stSoft]) : ['Shared with you', m.stSoft])
    : blocked ? ['Can’t complete yet', m.stWait] : ['Ready to complete', m.stDone]
  const reqN = fields.filter(f => f.req || f.lock).length

  const grid = (f: MinutesField, v: Grid | Table) => {
    const isTable = f.type === 'Table'
    const own = isTable ? (f.cols ?? []) : []
    const xcols = isTable ? (v as Table).xcols : []
    const cols = isTable ? [...own.map(c => c.name), ...xcols] : (v as Grid).cols
    const rows = v.rows.map(r => cols.map((_, k) => r[k] ?? ''))
    const canRow = !ro && (!isTable || f.staffRows !== false)
    const canCol = !ro && (!isTable || f.staffCols === true)
    const kind = (ci: number) => (isTable ? ({ Date: 'date', Number: 'number' } as Record<string, string>)[own[ci]?.type ?? ''] ?? 'text' : 'text')
    const put = (next: { rows: string[][]; cols?: string[]; xcols?: string[] }) =>
      set(f.key, isTable ? { xcols: next.xcols ?? xcols, rows: next.rows } : { cols: next.cols ?? cols, rows: next.rows })
    return (
      <div className={m.gridBox}>
        <div className={m.gridWrap}>
          <table className={m.grid}>
            <thead>
              <tr>
                {cols.map((c, ci) => {
                  const own = isTable && ci < (f.cols ?? []).length
                  return (
                    <th key={ci}>
                      {own || ro ? (c || 'Untitled') : (
                        <input
                          className={`${m.gInput} ${m.gHead}`}
                          value={c}
                          maxLength={40}
                          aria-label={`Column ${ci + 1} name`}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const v2 = e.target.value
                            if (isTable) put({ rows, xcols: xcols.map((x, k) => (k === ci - (f.cols ?? []).length ? v2 : x)) })
                            else put({ rows, cols: cols.map((x, k) => (k === ci ? v2 : x)) })
                          }}
                        />
                      )}
                    </th>
                  )
                })}
                {canCol && cols.length < 8 ? (
                  <th className={m.gAddCol}>
                    <button
                      type="button"
                      className={m.gAddColBtn}
                      onClick={e => {
                        e.stopPropagation()
                        const label = `Column ${cols.length + 1}`
                        if (isTable) put({ xcols: [...xcols, label], rows: rows.map(r => [...r, '']) })
                        else put({ cols: [...cols, label], rows: rows.map(r => [...r, '']) })
                      }}
                    >
                      + Column
                    </button>
                  </th>
                ) : null}
                {canRow ? <th className={m.gX} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((x, ci) => (
                    <td key={ci}>
                      <input
                        className={m.gInput}
                        type={kind(ci)}
                        value={x}
                        readOnly={ro}
                        aria-label={`${f.name || 'Table'} row ${ri + 1}, ${cols[ci] || `column ${ci + 1}`}`}
                        onClick={e => e.stopPropagation()}
                        onChange={e => put({ rows: rows.map((y, j) => (j === ri ? y.map((z, k) => (k === ci ? e.target.value : z)) : y)) })}
                      />
                    </td>
                  ))}
                  {canCol && cols.length < 8 ? <td /> : null}
                  {canRow ? (
                    <td className={m.gX}>
                      <button type="button" className={m.gXBtn} title="Remove row" aria-label={`Remove row ${ri + 1}`} onClick={e => { e.stopPropagation(); put({ rows: rows.filter((_, j) => j !== ri) }) }}>×</button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canRow ? (
          <button type="button" className={m.gAddRow} disabled={rows.length >= 50} onClick={e => { e.stopPropagation(); put({ rows: [...rows, cols.map(() => '')] }) }}>+ Add row</button>
        ) : null}
      </div>
    )
  }

  return (
    <aside className={`${m.pv}${open ? ` ${m.pvOpen}` : ''}`} aria-label="Live preview">
      <div className={m.pvHead}>
        <span className={m.pvTitle}>Live preview</span>
        <div className={m.seg} role="group" aria-label="Preview as">
          {([['staff', 'Staff filling in'], ['pic', 'PIC on the link']] as const).map(([k, label]) => (
            <button key={k} type="button" className={`${m.segBtn}${viewer === k ? ` ${m.segOn}` : ''}`} aria-pressed={viewer === k} onClick={() => setViewer(k)}>
              <Steady show={label} bold />
            </button>
          ))}
        </div>
        <span className={m.grow} />
        <button type="button" className={m.reset} onClick={() => setT(FRESH)}>Reset</button>
        <button type="button" className={m.pvClose} title="Close preview" aria-label="Close preview" onClick={onClose}>×</button>
      </div>
      <div className={m.pvBody}>
        <div className={m.pvHint}>{pic ? `${shown.length} of ${fields.length} fields visible to the PIC` : `${fields.length} fields · ${reqN} required`}</div>
        <div className={m.sheet}>
          <div className={m.sheetHead}>
            <div className={m.sheetWords}>
              <div className={m.sheetEyebrow}>Meeting minutes · {name || 'Untitled'}</div>
              <div className={m.sheetTitle}>Subsidiary · Project</div>
              <div className={m.sheetMono}>Track ID · {version}</div>
            </div>
            <span className={`${m.status} ${tone}`}>{status}</span>
          </div>

          <div className={m.sheetFields}>
            {shown.map(f => {
              const v = valOf(f)
              const on = f.key === selKey
              const auto = f.type === 'Project link' || (rules.project && f.type === 'People' && f.lock)
              const label = f.name.trim() || 'Untitled field'
              return (
                <div
                  key={f.key}
                  ref={el => { if (el) refs.current.set(f.key, el); else refs.current.delete(f.key) }}
                  className={`${m.pf}${on ? ` ${m.pfOn}` : ''}`}
                  data-field={f.key}
                  onClick={() => !on && onSelect(f.key)}
                >
                  <div className={m.pfLabel}>
                    <span className={m.pfName}>{label}</span>
                    {f.req || f.lock ? <span className={m.pfReq}>*</span> : null}
                    {auto ? <span className={m.pfAuto}>· filled from project</span> : null}
                    <span className={m.grow} />
                    {!pic && f.pic ? <span className={m.pfPic}>👁 PIC sees</span> : null}
                  </div>
                  {f.help ? <div className={m.pfHelp}>{f.help}</div> : null}
                  {f.type === 'Short text' || f.type === 'Date' || f.type === 'Number' ? (
                    <input
                      className={m.pfInput}
                      type={f.type === 'Date' ? 'date' : f.type === 'Number' ? 'number' : 'text'}
                      value={typeof v === 'string' ? v : ''}
                      readOnly={ro}
                      placeholder="Type here…"
                      aria-label={label}
                      onChange={e => set(f.key, e.target.value)}
                    />
                  ) : f.type === 'Long text' ? (
                    <textarea className={m.pfInput} rows={3} value={typeof v === 'string' ? v : ''} readOnly={ro} placeholder="Type here…" aria-label={label} onChange={e => set(f.key, e.target.value)} />
                  ) : f.type === 'Campaign period' ? (() => {
                    const p = isObj(v) && 'from' in v ? (v as { from: string; to: string }) : { from: '', to: '' }
                    return (
                      <div className={m.period}>
                        <input className={m.pfInput} type="date" value={p.from} readOnly={ro} aria-label={`${label} from`} onChange={e => set(f.key, { ...p, from: e.target.value })} />
                        <span className={m.to}>to</span>
                        <input className={m.pfInput} type="date" value={p.to} min={p.from || undefined} readOnly={ro} aria-label={`${label} to`} onChange={e => set(f.key, { ...p, to: e.target.value })} />
                      </div>
                    )
                  })() : f.type === 'Project link' ? (
                    <div className={m.projectBox}>Track ID · Project · Subsidiary</div>
                  ) : f.type === 'People' ? (
                    <div className={m.chips}>
                      {att.map(n => {
                        const sel = Array.isArray(v) && v.includes(n)
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`${m.chip}${sel ? ` ${m.chipOn}` : ''}`}
                            aria-pressed={sel}
                            disabled={ro || auto}
                            onClick={e => {
                              e.stopPropagation()
                              set(f.key, sel ? (v as string[]).filter(x => x !== n) : [...(Array.isArray(v) ? v : []), n])
                            }}
                          >
                            <Steady show={n} bold />
                          </button>
                        )
                      })}
                    </div>
                  ) : f.type === 'Signature' ? (
                    <div className={m.sigs}>
                      {att.map(n => {
                        const s = !!t.signed[n]
                        return (
                          <button
                            key={n}
                            type="button"
                            className={`${m.sig}${s ? ` ${m.sigOn}` : ''}`}
                            disabled={ro}
                            onClick={e => {
                              e.stopPropagation()
                              setT(x => ({ ...x, signed: { ...x.signed, [n]: !s } }))
                            }}
                          >
                            <span className={m.sigMark}>{s ? n.split(' ')[0] : ''}</span>
                            <span className={m.sigName}>{n}</span>
                            <span className={m.sigState}>{s ? 'Signed' : ro ? 'Waiting' : 'Click to sign'}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : v && isObj(v) && 'rows' in v ? grid(f, v as Grid | Table) : null}
                </div>
              )
            })}
          </div>

          <div className={m.sheetFoot}>
            {checks.map(c => (
              <div key={c.text} className={`${m.check}${c.ok ? ` ${m.checkOk}` : ''}`}>
                <span className={m.checkIcon}>{c.ok ? '✓' : '○'}</span>
                <span>{c.text}</span>
              </div>
            ))}
            <div className={m.pvActions}>
              {pic ? (
                rules.pic ? (
                  <>
                    <button type="button" className={m.pvBtn} disabled={t.approved}>Request changes</button>
                    <button type="button" className={`${m.pvBtn} ${m.pvBtnPrimary}`} disabled={t.approved} onClick={() => setT(x => ({ ...x, approved: true }))}>
                      {t.approved ? 'Approved ✓' : 'Approve minutes'}
                    </button>
                  </>
                ) : (
                  <button type="button" className={m.pvBtn} disabled>Download PDF</button>
                )
              ) : t.done ? (
                <button type="button" className={m.pvBtn} disabled={locked} onClick={() => setT(x => ({ ...x, done: false }))}>
                  {locked ? 'Locked · new version needed to edit' : 'Reopen'}
                </button>
              ) : (
                <button type="button" className={`${m.pvBtn} ${m.pvBtnPrimary}`} disabled={blocked} onClick={() => setT(x => ({ ...x, done: true }))}>Complete</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
