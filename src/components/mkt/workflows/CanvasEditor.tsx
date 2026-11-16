'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  CANVAS_MAX_FIELDS, CANVAS_MAX_SECTIONS, newCanvasCol, newCanvasField, newCanvasSection, SECTION_ICONS, stageFills, stageNameOf, stageSectionId,
  TYPE_GLYPH, type CanvasCol, type CanvasField, type CanvasSection, type WfCanvas,
} from '@/lib/marketing/canvas'
import type { OptionLists } from '@/lib/marketing/options'
import type { WfGroup, WfStage } from '@/lib/marketing/workflows'
import CanvasPop from './CanvasPop'
import CanvasPreview from './CanvasPreview'
import CanvasSectionPop from './CanvasSectionPop'
import CanvasTable from './CanvasTable'
import Tip from '../ui/Tip'
import c from './canvas.module.css'

// The Canvas Template Editor (`Canvas Template Editor.dc.html`, the Workflow Builder's *Canvas template* tab): the task
// page of a project started from this template, laid out — 📋 Requirements first, then the sections (a stage's own and
// the manager's), the Free space last — and the ONLY place fields are defined (2026-11-13): every field and every table
// column names the stage that fills it in, by key, ⭐ Required before submit, 👁 Visible to PIC. Simplified by the
// 2026-11-17 handoff (`docs/design_handoff_workflow_projects/` §1.6): the "Who fills what" strip (a pill per stage with
// its count — a click brings its section into view, flashes it amber for 1.2 s and shows the preview at that stage);
// one faint legend line of icons (their words on hover — the user, 2026-11-13); a section's owning stage as a dark
// "🎯 Stage n" pill, its other marks icons only; ⚙ a 26×26 button; a field a flat row whose 🎯 shows only when its
// stage is not its section's; the Free space a dashed divider. The Preview beside it shows the page as the staff see it
// at a stage ("Doer at"), or as the PIC sees it on the link.

type Pop = { kind: 'sec'; sec: string } | { kind: 'field'; sec: string; field: string } | { kind: 'col'; sec: string; field: string; col: string } | null

const BADGE_TIP: Record<string, string> = { '🔒': "Locked — colleagues can't delete", '⭐': 'Required before submit', '👁': 'Visible to PIC' }
/** The legend: the icons on the page, their words on hover / focus (the user, 2026-11-13). */
const LEGEND: readonly [string, string][] = [['⭐', 'Required before submit'], ['👁', 'Visible to PIC'], ['📅', 'Show on calendar'], ['🔒', "Locked — colleagues can't delete"]]
const FLASH_MS = 1200

export default function CanvasEditor({
  title,
  version,
  stages,
  canvas,
  groups = [],
  onCanvas,
  lists = {},
  onList,
  say,
}: {
  /** "Reels video · Full production" */
  title: string
  /** The draft's version (the next to publish). */
  version: number
  stages: WfStage[]
  canvas: WfCanvas
  /** Marketing's groups (each stage's dot on the strip). */
  groups?: WfGroup[]
  onCanvas: (next: WfCanvas) => void
  lists?: OptionLists
  onList?: (name: string, opts: string[]) => void
  say?: (words: string) => void
}) {
  const [pop, setPop] = useState<Pop>(null)
  const [icons, setIcons] = useState<string | null>(null)
  // The stage the preview shows; the section a strip pill just jumped to (flashed).
  const [pvSid, setPvSid] = useState<string | null>(null)
  const [hit, setHit] = useState<string | null>(null)
  const hitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => () => { if (hitTimer.current) clearTimeout(hitTimer.current) }, [])
  const lastSid = stages.length ? stages[stages.length - 1].sid : null

  const setSection = (id: string, fn: (s: CanvasSection) => CanvasSection) => onCanvas({ ...canvas, sections: canvas.sections.map(s => (s.id === id ? fn(s) : s)) })
  const setField = (sec: string, fid: string, fn: (f: CanvasField) => CanvasField) => setSection(sec, s => ({ ...s, fields: s.fields.map(f => (f.id === fid ? fn(f) : f)) }))
  const setCol = (sec: string, fid: string, cid: string, next: CanvasCol) => setField(sec, fid, f => ({ ...f, cols: (f.cols ?? []).map(x => (x.id === cid ? next : x)) }))
  const toggleSec = (id: string) => {
    setIcons(null)
    setPop(p => (p?.kind === 'sec' && p.sec === id ? null : { kind: 'sec', sec: id }))
  }
  const secOpen = (id: string) => pop?.kind === 'sec' && pop.sec === id
  const marks = (list: string[]) => list.map(b => <span key={b} className={c.mark} title={BADGE_TIP[b]} aria-label={BADGE_TIP[b]}>{b}</span>)
  /** A stage's only section stays (a stage always has one). */
  const mayRemove = (s: CanvasSection) => !s.stage || canvas.sections.filter(x => x.stage === s.stage).length > 1
  const stageAt = (sid: string | null) => (sid ? stages.findIndex(x => x.sid === sid) : -1)

  /** "Who fills what": the stage's section into view, flashed amber, and the preview at that stage. */
  const jump = (sid: string) => {
    setPvSid(sid)
    const id = stageSectionId(canvas, sid)
    if (!id) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-cv-section="${id}"]`)
    el?.scrollIntoView?.({ block: 'start' })
    setHit(id)
    if (hitTimer.current) clearTimeout(hitTimer.current)
    hitTimer.current = setTimeout(() => setHit(null), FLASH_MS)
  }

  return (
    <div className={c.wrap} onClick={() => { setPop(null); setIcons(null) }}>
      <div className={c.strip} role="toolbar" aria-label="Who fills what">
        <Tip text="Click a stage to jump to its fields · red 0 = nothing to fill">
          <span className={c.stripLabel} tabIndex={0}>Who fills what</span>
        </Tip>
        {stages.map((s, i) => {
          const n = stageFills(canvas, s.sid).length
          const g = groups.find(x => x.key === s.dept)
          return (
            <button key={s.sid} type="button" className={c.stripPill} title="Jump to what this stage fills in"
              onClick={e => { e.stopPropagation(); jump(s.sid) }}>
              <span className={`${c.stripDot}${g ? '' : ` ${c.stripDotNone}`}`} style={g ? ({ '--g-h': g.hue } as CSSProperties) : undefined} />
              {i + 1}. {s.name || 'Untitled stage'}
              <span className={`${c.stripCount}${n ? '' : ` ${c.stripZero}`}`}>{n}</span>
            </button>
          )
        })}
      </div>
      <div className={c.page}>
        <div className={c.main} ref={scroller}>
          <div className={c.head}>
            <span className={c.title}>{title}</span>
            <span className={c.ver}>Canvas template · draft v{version}</span>
            <span className={c.grow} />
            <span className={c.legend} aria-label="Legend">
              {LEGEND.map(([icon, words], i) => (
                <span key={icon} className={c.legendItem}>
                  {i ? <span aria-hidden="true">·</span> : null}
                  <Tip text={words}><span className={c.legendKey} tabIndex={0} aria-label={words}>{icon}</span></Tip>
                </span>
              ))}
            </span>
          </div>

          <div className={c.sections}>
            <section className={`${c.card}${secOpen('req') ? ` ${c.cardOn}` : ''}`} aria-label="Requirements">
              <div className={c.cardHead}>
                <span className={c.grip} aria-hidden="true">⋮⋮</span>
                <span className={c.emoji}>📋</span>
                <Tip text="Pulled in automatically from the meeting minutes intake. Read-only for everyone."><span className={c.cardTitle} tabIndex={0}>Requirements</span></Tip>
                {marks(['🔒', ...(canvas.req.pic ? ['👁'] : [])])}
                <span className={c.grow} />
                <button type="button" className={`${c.gear}${secOpen('req') ? ` ${c.gearOn}` : ''}`} aria-label="Section settings" title="Section settings"
                  onClick={e => { e.stopPropagation(); toggleSec('req') }}>⚙</button>
              </div>

              {secOpen('req') ? (
                <CanvasSectionPop title="Requirements" sec={{ locked: true, req: false, pic: canvas.req.pic }} only="pic" stages={stages} stage={null}
                  onChange={s => onCanvas({ ...canvas, req: { pic: s.pic } })} onClose={() => setPop(null)} />
              ) : null}
            </section>

            {canvas.sections.map(s => {
              const open = secOpen(s.id) || (pop && pop.kind !== 'sec' && pop.sec === s.id)
              const n = stageAt(s.stage)
              const sName = stageNameOf(stages, s.stage)
              const secTitle = s.title.trim() || 'New section'
              return (
                <section key={s.id} data-cv-section={s.id} className={`${c.card}${open ? ` ${c.cardOn}` : ''}${hit === s.id ? ` ${c.cardHit}` : ''}`} aria-label={s.title || 'New section'}>
                  <div className={c.cardHead}>
                    <span className={c.grip} aria-hidden="true">⋮⋮</span>
                    <span className={c.iconWrap}>
                      <button type="button" className={c.iconBtn} title="Change icon" aria-label="Change icon"
                        onClick={e => { e.stopPropagation(); setPop(null); setIcons(o => (o === s.id ? null : s.id)) }}>{s.emoji}</button>
                      {icons === s.id ? (
                        <span className={c.icons} role="listbox" aria-label="Icons" onClick={e => e.stopPropagation()}>
                          {SECTION_ICONS.map(e => (
                            <button key={e} type="button" role="option" aria-selected={e === s.emoji} className={c.iconOpt}
                              onClick={() => { setSection(s.id, x => ({ ...x, emoji: e })); setIcons(null) }}>{e}</button>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <input className={c.cardTitleInput} value={s.title} maxLength={60} placeholder="Section name" aria-label="Section name"
                      onClick={e => e.stopPropagation()} onChange={e => setSection(s.id, x => ({ ...x, title: e.target.value }))} />
                    {s.stage ? (
                      <span className={`${c.stagePill}${n < 0 ? ` ${c.stagePillGone}` : ''}`} title="This stage fills it in">
                        🎯 {n < 0 ? sName : `Stage ${n + 1}${sName !== secTitle ? ` · ${sName}` : ''}`}
                      </span>
                    ) : null}
                    {marks([...(s.locked ? ['🔒'] : []), ...(s.req ? ['⭐'] : []), ...(s.pic ? ['👁'] : [])])}
                    <span className={c.grow} />
                    {/* Remove on the card itself, as a stage's Remove (2026-11-14 — the user could not find it inside Section settings). */}
                    {mayRemove(s) ? (
                      <button type="button" className={c.cardRemove} aria-label={`Remove section ${s.title || 'New section'}`}
                        onClick={e => { e.stopPropagation(); setPop(null); onCanvas({ ...canvas, sections: canvas.sections.filter(x => x.id !== s.id) }) }}>Remove</button>
                    ) : null}
                    <button type="button" className={`${c.gear}${secOpen(s.id) ? ` ${c.gearOn}` : ''}`} aria-label="Section settings" title="Section settings"
                      onClick={e => { e.stopPropagation(); toggleSec(s.id) }}>⚙</button>
                  </div>
                  <div className={c.fields}>
                    {s.fields.map(f => {
                      const fOpen = pop?.kind === 'field' && pop.sec === s.id && pop.field === f.id
                      const colOpen = pop?.kind === 'col' && pop.sec === s.id && pop.field === f.id ? pop.col : null
                      const stageOk = !!f.stage && stages.some(x => x.sid === f.stage)
                      const req = f.req && f.type !== 'Note'
                      const cal = f.type === 'Date' && !!f.cal
                      return (
                        <div key={f.id} className={c.fieldWrap}>
                          <Tip text={f.type === 'Note' ? 'Read-only note shown to whoever works on this stage.' : null}>
                            <button type="button" className={`${c.field}${fOpen ? ` ${c.fieldOn}` : ''}${f.type === 'Note' ? ` ${c.fieldNote}` : ''}`}
                              onClick={e => { e.stopPropagation(); setIcons(null); setPop(fOpen ? null : { kind: 'field', sec: s.id, field: f.id }) }}>
                              <span className={c.glyph}>{TYPE_GLYPH[f.type]}</span>
                              <span className={f.type === 'Note' ? c.noteText : c.fieldName}>{f.label || 'Unnamed field'}</span>
                              <span className={c.muted}>{f.type}</span>
                              <span className={c.grow} />
                              {!stageOk || f.stage !== s.stage ? (
                                <span className={`${c.fieldStage}${stageOk ? '' : ` ${c.fieldStageWarn}`}`} title="Filled in by a different stage than the section">🎯 {stageNameOf(stages, f.stage)}</span>
                              ) : null}
                              <span className={`${c.flag}${req ? '' : ` ${c.flagOff}`}`} title="Required before submit" aria-hidden={!req}>⭐</span>
                              <span className={`${c.flag}${f.pic ? '' : ` ${c.flagOff}`}`} title="Visible to PIC" aria-hidden={!f.pic}>👁</span>
                              <span className={`${c.flag}${cal ? '' : ` ${c.flagOff}`}`} title="On calendar" aria-hidden={!cal}>📅</span>
                            </button>
                          </Tip>
                          {f.type === 'Table' ? (
                            <CanvasTable field={f} stages={stages} openCol={colOpen}
                              onCol={cid => { setIcons(null); setPop(colOpen === cid ? null : { kind: 'col', sec: s.id, field: f.id, col: cid }) }}
                              onAddCol={() => {
                                const col = newCanvasCol(f.stage ?? lastSid, `Column ${(f.cols ?? []).length + 1}`)
                                setField(s.id, f.id, x => ({ ...x, cols: [...(x.cols ?? []), col], rows: (x.rows ?? []).map(r => [...r, '']) }))
                                setPop({ kind: 'col', sec: s.id, field: f.id, col: col.id })
                              }} />
                          ) : null}
                          {fOpen ? (
                            <CanvasPop target={{ kind: 'field', field: f }} stages={stages}
                              onField={next => setField(s.id, f.id, () => next)}
                              onRemove={() => { setPop(null); setSection(s.id, x => ({ ...x, fields: x.fields.filter(y => y.id !== f.id) })) }}
                              onClose={() => setPop(null)} lists={lists} onList={onList} say={say} />
                          ) : null}
                          {colOpen ? (() => {
                            const col = (f.cols ?? []).find(x => x.id === colOpen)
                            if (!col) return null
                            return (
                              <CanvasPop target={{ kind: 'col', col }} stages={stages}
                                onCol={next => setCol(s.id, f.id, col.id, next)}
                                onRemove={(f.cols ?? []).length > 1 ? () => {
                                  const ci = (f.cols ?? []).findIndex(x => x.id === col.id)
                                  setPop(null)
                                  setField(s.id, f.id, x => ({ ...x, cols: (x.cols ?? []).filter(y => y.id !== col.id), rows: (x.rows ?? []).map(r => r.filter((_, j) => j !== ci)) }))
                                } : undefined}
                                onClose={() => setPop(null)} />
                            )
                          })() : null}
                        </div>
                      )
                    })}
                    {s.fields.length < CANVAS_MAX_FIELDS ? (
                      <button type="button" className={c.addField} onClick={e => {
                        e.stopPropagation()
                        const f = newCanvasField(s.stage ?? lastSid)
                        setSection(s.id, x => ({ ...x, fields: [...x.fields, f] }))
                        setPop({ kind: 'field', sec: s.id, field: f.id })
                      }}>+ Add field</button>
                    ) : null}
                  </div>
                  {secOpen(s.id) ? (
                    <CanvasSectionPop title={s.title || 'New section'} sec={s} stages={stages} stage={s.stage}
                      onChange={next => setSection(s.id, x => ({ ...x, ...next }))}
                      onStage={sid => setSection(s.id, x => ({ ...x, stage: sid }))}
                      onRemove={mayRemove(s) ? () => { setPop(null); onCanvas({ ...canvas, sections: canvas.sections.filter(x => x.id !== s.id) }) } : undefined}
                      onClose={() => setPop(null)} />
                  ) : null}
                </section>
              )
            })}

            <button type="button" className={c.addSection} disabled={canvas.sections.length >= CANVAS_MAX_SECTIONS} onClick={e => {
              e.stopPropagation()
              const next = newCanvasSection(lastSid)
              onCanvas({ ...canvas, sections: [...canvas.sections, next] })
              setPop({ kind: 'sec', sec: next.id })
            }}>+ Add section</button>

            <div className={c.free}>
              <span className={c.freeRule} />
              <Tip text="Always at the bottom 🔒 — the only place colleagues can add their own blocks and tables."><span className={c.freeLabel} tabIndex={0}>🔒 Free space for colleagues</span></Tip>
              <span className={c.freeRule} />
            </div>
          </div>
        </div>

        <CanvasPreview title={title.split(' · ')[0]} stages={stages} canvas={canvas} sid={pvSid} onSid={setPvSid} />
      </div>
    </div>
  )
}
