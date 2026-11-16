'use client'

import { useState } from 'react'
import { picView, staffView, type WfCanvas } from '@/lib/marketing/canvas'
import { calKind } from '@/lib/marketing/tasks'
import type { WfStage } from '@/lib/marketing/workflows'
import c from './canvas.module.css'

// The canvas's Preview (`Canvas Template Editor.dc.html`, the right column): the task page as the doer sees it at a
// stage — "Doer at [stage]" (the 2026-11-17 handoff §1.6; the strip's pills set it too), every section, those the stage
// fills nothing in at 0.55, a table's columns of that stage dark, no badges — or as the PIC sees it on the link: only the
// 👁 sections and columns, the dates on their calendar, Approve and Request changes, and what the link leaves out.

export default function CanvasPreview({ title, stages, canvas, sid, onSid }: {
  title: string
  stages: WfStage[]
  canvas: WfCanvas
  /** The stage shown (null: the last). */
  sid: string | null
  onSid: (sid: string) => void
}) {
  const [view, setView] = useState<'staff' | 'pic'>('staff')
  const at = stages.find(s => s.sid === sid) ?? stages[stages.length - 1] ?? null
  const staff = staffView(stages, canvas, at?.sid ?? null)
  const pic = picView(canvas)

  return (
    <aside className={c.preview} aria-label="Preview" onClick={e => e.stopPropagation()}>
      <div className={c.pvHead}>
        <span className={c.pvLabel}>Preview</span>
        <div className={c.seg} role="tablist" aria-label="Preview as">
          {([['staff', 'Staff view'], ['pic', 'PIC link view']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`${c.segBtn}${view === k ? ` ${c.segOn}` : ''}`} onClick={() => setView(k)}>
              <span className={c.stable} data-label={label}><span>{label}</span></span>
            </button>
          ))}
        </div>
      </div>

      {view === 'staff' ? (
        <div className={c.pvCard}>
          {at ? (
            <label className={c.pvWho}>
              Doer at
              <select className={c.pvSelect} value={at.sid} aria-label="Doer at" onChange={e => onSid(e.target.value)}>
                {stages.map((s, i) => <option key={s.sid} value={s.sid}>{i + 1}. {s.name || 'Untitled stage'}</option>)}
              </select>
            </label>
          ) : null}
          {staff.map(s => (
            <div key={s.id} className={`${c.pvSec}${s.mine || s.kind === 'req' ? '' : ` ${c.pvFaded}`}`}>
              <div className={c.pvSecHead}>
                <span>{s.emoji}</span>
                <span className={c.pvSecTitle}>{s.title}</span>
              </div>
              {s.cols ? (
                <div className={c.pvCols}>{s.cols.map((col, i) => <span key={`${col.name}-${i}`} className={`${c.pvCol}${col.mine ? ` ${c.pvColMine}` : ''}`}>{col.name}</span>)}</div>
              ) : (
                <div className={`${c.pvLine}${s.kind === 'req' ? ` ${c.pvLineReq}` : s.mine ? ` ${c.pvLineMine}` : ''}`} />
              )}
            </div>
          ))}
          <div className={c.pvFree}>FREE SPACE</div>
        </div>
      ) : (
        <>
          <div className={c.pvLink}>
            <div className={c.pvLinkHead}>
              <span className={c.mono}>houzs.link/t/····</span>
              <span className={c.grow} />
              <span className={c.pvMuted}>Tracking link</span>
            </div>
            <div className={c.pvLinkBody}>
              <div>
                <div className={c.pvMuted}>Subsidiary · Track ID</div>
                <div className={c.pvLinkTitle}>{title}</div>
                <div className={c.pvState}><span className={c.pvDot} />{at?.picText || 'The team is working on it'}</div>
              </div>
              {pic.sections.map(s => (
                <div key={s.id} className={c.pvPicSec}>
                  <div className={c.pvPicTitle}>{s.title}</div>
                  {s.cols ? (
                    <div className={c.pvPicTable}>
                      <div className={c.pvPicRow} style={{ gridTemplateColumns: `repeat(${Math.max(1, s.cols.length)}, minmax(0, 1fr))` }}>
                        {s.cols.map((col, i) => <span key={`${col}-${i}`} className={c.pvPicTh}>{col}</span>)}
                      </div>
                      <div className={`${c.pvPicRow} ${c.pvPicRowBody}`} style={{ gridTemplateColumns: `repeat(${Math.max(1, s.cols.length)}, minmax(0, 1fr))` }}>
                        {s.cols.map((col, i) => <span key={`b-${col}-${i}`} className={c.pvPicTd}><span className={c.pvBarCell} /></span>)}
                      </div>
                    </div>
                  ) : (
                    <><span className={c.pvBar} /><span className={`${c.pvBar} ${c.pvBarShort}`} /></>
                  )}
                </div>
              ))}
              {pic.calendar.length ? (
                <div className={c.pvPicSec}>
                  <div className={c.pvPicTitle}>On your calendar</div>
                  {pic.calendar.map((d, i) => (
                    <div key={`${d.label}-${i}`} className={c.pvCal}>
                      <span className={`${c.pvCalDot} ${c[`cal_${calKind(d.kind).tone}`]}`} />
                      <span className={c.pvCalName}>{calKind(d.kind).glyph} {d.label}</span>
                      <span className={c.pvMuted}>· from {d.from}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={c.pvActs}>
                <span className={c.pvApprove}>Approve</span>
                <span className={c.pvChanges}>Request changes</span>
              </div>
            </div>
          </div>
          <div className={c.pvHidden}>Only 👁 sections and columns appear. {pic.hidden}</div>
        </>
      )}
    </aside>
  )
}
