'use client'

import { useState } from 'react'
import { picView, staffView, type WfCanvas } from '@/lib/marketing/canvas'
import { calKind } from '@/lib/marketing/tasks'
import { personForGroup, type WfPerson, type WfStage } from '@/lib/marketing/workflows'
import c from './canvas.module.css'

// The canvas's Preview (`Canvas Template Editor.dc.html`, the right column): the task page as one of the staff sees it
// at a stage — every section, those the stage fills nothing in faded, a table's columns of that stage dark — or as the
// PIC sees it on the link: only the 👁 sections and columns, the dates on their calendar, Approve and Request changes,
// and what the link leaves out.

export default function CanvasPreview({ title, stages, canvas, people }: { title: string; stages: WfStage[]; canvas: WfCanvas; people: WfPerson[] }) {
  const [view, setView] = useState<'staff' | 'pic'>('staff')
  const [sid, setSid] = useState<string | null>(null)
  const at = stages.find(s => s.sid === sid) ?? stages[stages.length - 1] ?? null
  const staff = staffView(stages, canvas, at?.sid ?? null)
  const pic = picView(canvas)
  const who = at ? personForGroup(people, at.dept) ?? 'the team' : 'the team'

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
            <div className={c.pvWho}>
              As {who} sees it at the{' '}
              <select className={c.pvSelect} value={at.sid} aria-label="At the stage" onChange={e => setSid(e.target.value)}>
                {stages.map((s, i) => <option key={s.sid} value={s.sid}>{s.name || `Stage ${i + 1}`}</option>)}
              </select>{' '}
              stage
            </div>
          ) : null}
          {staff.map(s => (
            <div key={s.id} className={`${c.pvSec}${s.mine || s.kind === 'req' ? '' : ` ${c.pvFaded}`}`}>
              <div className={c.pvSecHead}>
                <span>{s.emoji}</span>
                <span className={c.pvSecTitle}>{s.title}</span>
                {s.badges.map(b => <span key={b} className={c.pvBadge}>{b}</span>)}
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
