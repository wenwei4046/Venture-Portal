'use client'

import { useState } from 'react'
import { picView, staffView, type WfCanvas } from '@/lib/marketing/canvas'
import { calKind } from '@/lib/marketing/tasks'
import type { WfStage } from '@/lib/marketing/workflows'
import c from './canvas.module.css'

// The canvas's Preview (`Canvas Template Editor.dc.html`, the right column): the task page as one of the staff sees it
// at a stage — every section, those not theirs to fill in faded — or as the PIC sees it on the link: only the 👁
// sections and fields, the dates on their calendar, Approve and Request changes, and what the link leaves out.

export default function CanvasPreview({
  title,
  stages,
  canvas,
  nameAt,
}: {
  /** The template's action — the sample project's name on the link. */
  title: string
  stages: WfStage[]
  canvas: WfCanvas
  /** Who on a stage's team the staff view is drawn for. */
  nameAt: (at: number) => string
}) {
  const [view, setView] = useState<'staff' | 'pic'>('staff')
  const [at, setAt] = useState(Math.max(0, stages.length - 1))
  const stageAt = Math.min(at, Math.max(0, stages.length - 1))
  const staff = staffView(stages, canvas, stageAt)
  const pic = picView(stages, canvas)

  return (
    <aside className={c.preview} aria-label="Preview">
      <div className={c.pvHead}>
        <span className={c.pvLabel}>Preview</span>
        <div className={c.seg} role="tablist" aria-label="Preview as">
          {([['staff', 'Staff view'], ['pic', 'PIC link view']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={`${c.segBtn}${view === k ? ` ${c.segOn}` : ''}`} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'staff' ? (
        <div className={c.pvCard}>
          {stages.length ? (
            <div className={c.pvWho}>
              As {nameAt(stageAt)} sees it at the{' '}
              <select className={c.pvSelect} value={stageAt} aria-label="At the stage" onChange={e => setAt(Number(e.target.value))}>
                {stages.map((s, i) => <option key={s.key} value={i}>{s.name || `Stage ${i + 1}`}</option>)}
              </select>{' '}
              stage
            </div>
          ) : null}
          {staff.map(s => (
            <div key={s.key} className={`${c.pvSec}${s.mine ? '' : ` ${c.pvFaded}`}`}>
              <div className={c.pvSecHead}>
                <span>{s.emoji}</span>
                <span className={c.pvSecTitle}>{s.title}</span>
                {s.badges.map(b => <span key={b} className={c.pvBadge}>{b}</span>)}
              </div>
              {s.cols ? (
                <div className={c.pvCols}>{s.cols.map((col, i) => <span key={`${col}-${i}`} className={c.pvCol}>{col}</span>)}</div>
              ) : null}
              {s.key === 'req' || s.fields.length ? <div className={c.pvLine} /> : null}
            </div>
          ))}
          <div className={c.pvFree}>FREE SPACE</div>
        </div>
      ) : (
        <>
          <div className={c.pvLink}>
            <div className={c.pvLinkHead}>
              <span className={c.mono}>MKT-····-····-···</span>
              <span className={c.grow} />
              <span className={c.pvMuted}>Tracking link</span>
            </div>
            <div className={c.pvLinkBody}>
              <div>
                <div className={c.pvMuted}>Subsidiary · Track ID</div>
                <div className={c.pvLinkTitle}>{title}</div>
                <div className={c.pvState}><span className={c.pvDot} />The team is working on it</div>
              </div>
              {pic.sections.map(s => (
                <div key={s.key} className={c.pvPicSec}>
                  <div className={c.pvPicTitle}>{s.title}</div>
                  {s.cols ? (
                    <div className={c.pvPicTable} style={{ gridTemplateColumns: `repeat(${Math.max(1, s.cols.length)}, minmax(0, 1fr))` }}>
                      {s.cols.map((col, i) => <span key={`${col}-${i}`} className={c.pvPicTh}>{col}</span>)}
                      {s.cols.map((col, i) => <span key={`b-${col}-${i}`} className={c.pvPicTd}><span className={c.pvBar} /></span>)}
                    </div>
                  ) : null}
                  {s.fields.map((f, i) => (
                    <div key={`${f}-${i}`} className={c.pvPicField}>
                      <span className={c.pvMuted}>{f}</span>
                      <span className={c.pvBar} />
                    </div>
                  ))}
                  {s.key === 'req' ? <><span className={c.pvBar} /><span className={`${c.pvBar} ${c.pvBarShort}`} /></> : null}
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
          {pic.hidden ? <div className={c.pvHidden}>{pic.hidden}</div> : null}
        </>
      )}
    </aside>
  )
}
