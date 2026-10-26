'use client'

import { useState } from 'react'
import type { MinutesField, MinutesRules } from '@/lib/marketing/minutes'
import m from './minutes.module.css'

// The Minutes Builder's Preview (`Minutes Builder.dc.html`, Preview): the minutes as the staff fill them in, or as the
// PIC reads them on the link — each field as it will ask, the checks Complete makes, the buttons each side has. Typed
// into here and nothing is kept: it is the template being tried, not minutes being written.

type Val = string | string[] | { cols: string[]; rows: string[][] } | { from: string; to: string }
interface Try {
  vals: Record<string, Val>
  signed: Record<string, boolean>
  approved: boolean
  done: boolean
}
const FRESH: Try = { vals: {}, signed: {}, approved: false, done: false }

const blank = (v: Val | undefined) =>
  v === undefined ? true : Array.isArray(v) ? v.length === 0 : typeof v === 'string' ? !v.trim() : 'from' in v ? !v.from || !v.to : !v.rows.some(r => r.some(x => x.trim()))

export default function MinutesPreview({ name, version, fields, rules, attendees }: {
  name: string
  /** "Draft v2" · "v1 · live" */
  version: string
  fields: MinutesField[]
  rules: MinutesRules
  /** Who the sample minutes list as attending (Marketing's people). */
  attendees: string[]
}) {
  const [viewer, setViewer] = useState<'staff' | 'pic'>('staff')
  const [t, setT] = useState<Try>(FRESH)
  const pic = viewer === 'pic'
  const locked = t.done && rules.lock
  const ro = pic || locked
  const shown = pic ? fields.filter(f => f.pic) : fields
  const attending = attendees.length ? attendees : ['Attendee 1', 'Attendee 2']

  const set = (name: string, v: Val) => setT(x => ({ ...x, vals: { ...x.vals, [name]: v } }))
  const valOf = (f: MinutesField): Val | undefined => {
    if (t.vals[f.name] !== undefined) return t.vals[f.name]
    if (f.type === 'People') return attending
    if (f.type === 'Free space') return { cols: ['Item', 'Details', 'Owner'], rows: [['', '', ''], ['', '', '']] }
    if (f.type === 'Table') return { cols: (f.cols ?? []).map(c => c.name), rows: [0, 1].map(() => (f.cols ?? []).map(() => '')) }
    return undefined
  }
  const missing = fields.filter(f => (f.req || f.lock) && f.type !== 'Signature' && f.type !== 'Project link' && blank(valOf(f)))
  const signedN = attending.filter(n => t.signed[n]).length
  const checks: { ok: boolean; text: string }[] = pic
    ? [{ ok: true, text: 'Shared by the HOUZS marketing team. Read only.' }, ...(rules.pic ? [] : [{ ok: false, text: 'PIC sign-off is off for this template, so the PIC can only read.' }])]
    : [
        missing.length ? { ok: false, text: `${missing.length} required field${missing.length === 1 ? '' : 's'} empty: ${missing.map(f => f.name).join(', ')}` } : { ok: true, text: 'All required fields filled' },
        ...(rules.sign ? [{ ok: signedN === attending.length, text: `Every attendee signs · ${signedN} of ${attending.length} signed` }] : []),
        ...(rules.pic ? [{ ok: t.approved, text: t.approved ? 'PIC approved on the link' : 'PIC sign-off on the link' }] : []),
        ...(rules.file ? [{ ok: true, text: 'Files to the Library → Minutes on complete' }] : []),
        ...(rules.lock ? [{ ok: true, text: 'Locks after complete' }] : []),
      ]
  const blocked = !pic && checks.some(c => !c.ok)
  const status = t.done ? 'Completed'
    : pic ? (rules.pic ? (t.approved ? 'Approved' : 'Needs your approval') : 'Shared with you')
    : blocked ? 'Draft · can’t complete yet' : 'Ready to complete'
  const tone = t.done || status === 'Approved' || status === 'Ready to complete' ? m.pvDone : status.startsWith('Draft') ? m.pvWait : m.pvSoft

  const grid = (f: MinutesField, v: { cols: string[]; rows: string[][] }) => {
    const typed = f.type === 'Table'
    const kind = (ci: number) => (typed ? (f.cols?.[ci]?.type === 'Date' ? 'date' : f.cols?.[ci]?.type === 'Number' ? 'number' : 'text') : 'text')
    const put = (fn: (g: { cols: string[]; rows: string[][] }) => void) => {
      const g = { cols: [...v.cols], rows: v.rows.map(r => [...r]) }
      fn(g)
      set(f.name, g)
    }
    return (
      <div className={m.pvGridWrap}>
        <table className={m.pvGrid}>
          <thead>
            <tr>
              {v.cols.map((c, ci) => (
                <th key={ci}>
                  <input className={m.pvCell} value={c} readOnly={ro || typed} placeholder="Column name" aria-label="Column name" onChange={e => put(g => { g.cols[ci] = e.target.value })} />
                </th>
              ))}
              {!ro && !typed ? <th><button type="button" className={m.pvAdd} onClick={() => put(g => { g.cols.push(`Column ${g.cols.length + 1}`); g.rows.forEach(r => r.push('')) })}>+ Add column</button></th> : null}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((x, ci) => (
                  <td key={ci}>
                    <input className={m.pvCell} type={kind(ci)} value={x} readOnly={ro} aria-label={`${v.cols[ci] || 'Column'}, row ${ri + 1}`} onChange={e => put(g => { g.rows[ri][ci] = e.target.value })} />
                  </td>
                ))}
                {!ro ? <td><button type="button" className={m.pvX} aria-label="Remove row" onClick={() => put(g => { g.rows.splice(ri, 1) })}>×</button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!ro ? <button type="button" className={m.pvAdd} onClick={() => put(g => { g.rows.push(g.cols.map(() => '')) })}>+ Add row</button> : null}
      </div>
    )
  }

  return (
    <div className={m.pv}>
      <div className={m.pvBar}>
        <span className={m.pvBarLabel}>Preview as</span>
        <div className={m.pills}>
          {([['staff', 'Staff filling in'], ['pic', 'PIC on the link']] as const).map(([k, label]) => (
            <button key={k} type="button" className={`${m.pill}${viewer === k ? ` ${m.pillOn}` : ''}`} aria-pressed={viewer === k} onClick={() => setViewer(k)}>{label}</button>
          ))}
        </div>
        <span className={m.pvHint}>{pic ? `${shown.length} of ${fields.length} fields visible` : `${fields.length} fields · ${fields.filter(f => f.req || f.lock).length} required`}</span>
        <span className={m.grow} />
        <span className={m.pvHint}>Not saved</span>
        <button type="button" className={m.pvReset} onClick={() => setT(FRESH)}>Reset</button>
      </div>

      <div className={m.pvCard}>
        <div className={m.pvHead}>
          <div>
            <div className={m.pvTitle}>Meeting minutes · {name || 'Untitled'}</div>
            <div className={m.pvSub}>Subsidiary · Project</div>
            <div className={m.pvMono}>Track ID · {version}</div>
          </div>
          <span className={`${m.pvStatus} ${tone}`}>{status}</span>
        </div>

        <div className={m.pvFields}>
          {shown.map(f => {
            const v = valOf(f)
            const auto = f.type === 'Project link' || (rules.project && f.type === 'People' && f.lock)
            return (
              <div key={f.key} className={m.pvField}>
                <div className={m.pvLabel}>
                  <span className={m.pvName}>{f.name || 'Untitled field'}</span>
                  {f.req || f.lock ? <span className={m.pvReq}>*</span> : null}
                  {auto ? <span className={m.pvAuto}>· filled from project</span> : null}
                  <span className={m.grow} />
                  {!pic && f.pic ? <span className={m.pvPic}>👁 PIC sees</span> : null}
                </div>
                {f.type === 'Short text' || f.type === 'Date' || f.type === 'Number' ? (
                  <input
                    className={m.pvInput}
                    type={f.type === 'Date' ? 'date' : f.type === 'Number' ? 'number' : 'text'}
                    value={typeof v === 'string' ? v : ''}
                    readOnly={ro}
                    placeholder="Type here…"
                    aria-label={f.name}
                    onChange={e => set(f.name, e.target.value)}
                  />
                ) : f.type === 'Campaign period' ? (
                  <div className={m.pvPeriod}>
                    <input className={m.pvInput} type="date" readOnly={ro} aria-label={`${f.name} from`}
                      value={v && typeof v === 'object' && 'from' in v ? v.from : ''}
                      onChange={e => set(f.name, { from: e.target.value, to: v && typeof v === 'object' && 'from' in v ? v.to : '' })} />
                    <span className={m.pvTo}>to</span>
                    <input className={m.pvInput} type="date" readOnly={ro} aria-label={`${f.name} to`}
                      value={v && typeof v === 'object' && 'from' in v ? v.to : ''}
                      onChange={e => set(f.name, { from: v && typeof v === 'object' && 'from' in v ? v.from : '', to: e.target.value })} />
                  </div>
                ) : f.type === 'Long text' ? (
                  <textarea className={m.pvInput} rows={3} value={typeof v === 'string' ? v : ''} readOnly={ro} placeholder="Type here…" aria-label={f.name} onChange={e => set(f.name, e.target.value)} />
                ) : f.type === 'Project link' ? (
                  <div className={`${m.pvInput} ${m.pvRo}`}>Track ID · Project · Subsidiary</div>
                ) : f.type === 'People' ? (
                  <div className={m.chips}>
                    {attending.map(n => {
                      const on = Array.isArray(v) && v.includes(n)
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`${m.chip}${on ? ` ${m.chipOn}` : ''}`}
                          disabled={ro || auto}
                          onClick={() => set(f.name, on ? (v as string[]).filter(x => x !== n) : [...(Array.isArray(v) ? v : []), n])}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                ) : f.type === 'Signature' ? (
                  <div className={m.sigs}>
                    {attending.map(n => {
                      const on = !!t.signed[n]
                      return (
                        <button key={n} type="button" className={`${m.sig}${on ? ` ${m.sigOn}` : ''}`} disabled={ro} onClick={() => setT(x => ({ ...x, signed: { ...x.signed, [n]: !on } }))}>
                          <span className={m.sigMark}>{on ? n.split(' ')[0] : ''}</span>
                          <span className={m.sigName}>{n}</span>
                          <span className={m.sigState}>{on ? 'Signed' : ro ? 'Waiting' : 'Click to sign'}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : v && !Array.isArray(v) && typeof v !== 'string' && 'rows' in v ? (
                  grid(f, v)
                ) : null}
              </div>
            )
          })}
        </div>

        <div className={m.pvFoot}>
          {checks.map(c => (
            <div key={c.text} className={`${m.check}${c.ok ? ` ${m.checkOk}` : ''}`}>
              <span>{c.ok ? '✓' : '○'}</span>
              <span>{c.text}</span>
            </div>
          ))}
          <div className={m.pvActions}>
            {pic ? (
              rules.pic ? (
                <>
                  <button type="button" className={m.btn} disabled={t.approved}>Request changes</button>
                  <button type="button" className={`${m.btn} ${m.btnPrimary}`} disabled={t.approved} onClick={() => setT(x => ({ ...x, approved: true }))}>
                    {t.approved ? 'Approved ✓' : 'Approve minutes'}
                  </button>
                </>
              ) : (
                <button type="button" className={m.btn} disabled>Download PDF</button>
              )
            ) : t.done ? (
              <button type="button" className={m.btn} disabled={locked} onClick={() => setT(x => ({ ...x, done: false }))}>
                {locked ? 'Locked · new version needed to edit' : 'Reopen'}
              </button>
            ) : (
              <button type="button" className={`${m.btn} ${m.btnPrimary}`} disabled={blocked} onClick={() => setT(x => ({ ...x, done: true }))}>Complete</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
