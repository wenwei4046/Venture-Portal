'use client'

import { useState } from 'react'
import {
  CANVAS_MAX_FIELDS, CANVAS_MAX_SECTIONS, fieldFlags, newCanvasCol, newCanvasField, newCanvasSection, SECTION_ICONS, stageNameOf, TYPE_GLYPH,
  type CanvasCol, type CanvasField, type CanvasSection, type WfCanvas,
} from '@/lib/marketing/canvas'
import type { OptionLists } from '@/lib/marketing/options'
import type { WfPerson, WfStage } from '@/lib/marketing/workflows'
import CanvasPop from './CanvasPop'
import CanvasPreview from './CanvasPreview'
import CanvasSectionPop from './CanvasSectionPop'
import CanvasTable from './CanvasTable'
import c from './canvas.module.css'

// The Canvas Template Editor (`Canvas Template Editor.dc.html`, the Workflow Builder's *Canvas template* tab): the task
// page of a project started from this template, laid out — 📋 Requirements first, then the sections (a stage's own,
// 🎯 titled by it, and the manager's), the Free space last — and now the ONLY place fields are defined (2026-11-13):
// every field and every table column names the stage that fills it in, from the template's real stages (by key, so
// a stage renamed or moved keeps what it fills in), ⭐ Required before submit, 👁 Visible to PIC. The Preview beside it
// shows the page as the staff see it at a stage, or as the PIC sees it on the link.

type Pop = { kind: 'sec'; sec: string } | { kind: 'field'; sec: string; field: string } | { kind: 'col'; sec: string; field: string; col: string } | null

const BADGE_TIP: Record<string, string> = { '🔒': "Locked — colleagues can't delete", '⭐': 'Required before submit', '🎯': 'Belongs to stage', '👁': 'Visible to PIC' }

export default function CanvasEditor({
  title,
  version,
  stages,
  canvas,
  people,
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
  people: WfPerson[]
  onCanvas: (next: WfCanvas) => void
  lists?: OptionLists
  onList?: (name: string, opts: string[]) => void
  say?: (words: string) => void
}) {
  const [pop, setPop] = useState<Pop>(null)
  const [icons, setIcons] = useState<string | null>(null)
  const lastSid = stages.length ? stages[stages.length - 1].sid : null

  const setSection = (id: string, fn: (s: CanvasSection) => CanvasSection) => onCanvas({ ...canvas, sections: canvas.sections.map(s => (s.id === id ? fn(s) : s)) })
  const setField = (sec: string, fid: string, fn: (f: CanvasField) => CanvasField) => setSection(sec, s => ({ ...s, fields: s.fields.map(f => (f.id === fid ? fn(f) : f)) }))
  const setCol = (sec: string, fid: string, cid: string, next: CanvasCol) => setField(sec, fid, f => ({ ...f, cols: (f.cols ?? []).map(x => (x.id === cid ? next : x)) }))
  const toggleSec = (id: string) => {
    setIcons(null)
    setPop(p => (p?.kind === 'sec' && p.sec === id ? null : { kind: 'sec', sec: id }))
  }
  const secOpen = (id: string) => pop?.kind === 'sec' && pop.sec === id
  const badges = (list: string[]) => list.map(b => <span key={b} className={c.badge} title={BADGE_TIP[[...b][0]] ?? undefined}>{b}</span>)
  /** A stage's only section stays (a stage always has one). */
  const mayRemove = (s: CanvasSection) => !s.stage || canvas.sections.filter(x => x.stage === s.stage).length > 1

  return (
    <div className={c.page} onClick={() => { setPop(null); setIcons(null) }}>
      <div className={c.main}>
        <div className={c.head}>
          <span className={c.title}>{title}</span>
          <span className={c.ver}>Canvas template · draft v{version}</span>
          <span className={c.grow} />
          <span className={c.headHint}>Click any section, table or column to set it up</span>
        </div>
        <div className={c.legend}>
          <span>🔒 Locked — colleagues can&apos;t delete</span><span>⭐ Required before submit</span><span>🎯 Belongs to stage</span><span>👁 Visible to PIC</span><span>📅 Show on calendar</span>
        </div>

        <div className={c.sections}>
          <section className={`${c.card}${secOpen('req') ? ` ${c.cardOn}` : ''}`} aria-label="Requirements">
            <div className={c.cardHead}>
              <span className={c.grip} aria-hidden="true">⋮⋮</span>
              <span className={c.emoji}>📋</span>
              <span className={c.cardTitle}>Requirements</span>
              {badges(['🔒 Locked', ...(canvas.req.pic ? ['👁 PIC'] : [])])}
              <span className={c.grow} />
              <button type="button" className={`${c.gear}${secOpen('req') ? ` ${c.gearOn}` : ''}`} onClick={e => { e.stopPropagation(); toggleSec('req') }}>⚙ Section settings</button>
            </div>
            <div className={c.req}>Pulled in automatically from the meeting minutes intake. Read-only for everyone.</div>
            {secOpen('req') ? (
              <CanvasSectionPop title="Requirements" sec={{ locked: true, req: false, pic: canvas.req.pic }} only="pic" stages={stages} stage={null}
                onChange={s => onCanvas({ ...canvas, req: { pic: s.pic } })} onClose={() => setPop(null)} />
            ) : null}
          </section>

          {canvas.sections.map(s => {
            const open = secOpen(s.id) || (pop && pop.kind !== 'sec' && pop.sec === s.id)
            return (
              <section key={s.id} className={`${c.card}${open ? ` ${c.cardOn}` : ''}`} aria-label={s.title || 'New section'}>
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
                  {badges([...(s.locked ? ['🔒 Locked'] : []), ...(s.req ? ['⭐ Required'] : []), ...(s.stage ? [`🎯 ${stageNameOf(stages, s.stage)}`] : []), ...(s.pic ? ['👁 PIC'] : [])])}
                  <span className={c.grow} />
                  <button type="button" className={`${c.gear}${secOpen(s.id) ? ` ${c.gearOn}` : ''}`} onClick={e => { e.stopPropagation(); toggleSec(s.id) }}>⚙ Section settings</button>
                </div>
                <div className={c.fields}>
                  {s.fields.map(f => {
                    const fOpen = pop?.kind === 'field' && pop.sec === s.id && pop.field === f.id
                    const colOpen = pop?.kind === 'col' && pop.sec === s.id && pop.field === f.id ? pop.col : null
                    const stageOk = !!f.stage && stages.some(x => x.sid === f.stage)
                    return (
                      <div key={f.id} className={c.fieldWrap}>
                        <button type="button" className={`${c.field}${fOpen ? ` ${c.fieldOn}` : ''}${f.type === 'Note' ? ` ${c.fieldNote}` : ''}`}
                          onClick={e => { e.stopPropagation(); setIcons(null); setPop(fOpen ? null : { kind: 'field', sec: s.id, field: f.id }) }}>
                          <span className={c.glyph}>{TYPE_GLYPH[f.type]}</span>
                          <span className={f.type === 'Note' ? c.noteText : c.fieldName}>{f.label || 'Unnamed field'}</span>
                          <span className={c.muted}>{f.type}</span>
                          <span className={c.grow} />
                          <span className={`${c.flags}${stageOk ? '' : ` ${c.flagsWarn}`}`}>🎯 {stageNameOf(stages, f.stage)}  {fieldFlags(f)}</span>
                        </button>
                        {f.type === 'Note' ? <div className={c.noteHint}>Read-only note shown to whoever works on this stage.</div> : null}
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
            <div className={c.freeTop}><span className={c.freeRule} /><span className={c.freeLabel}>Free space</span><span className={c.freeRule} /></div>
            <span className={c.freeText}>Always at the bottom 🔒 — the only place colleagues can add their own blocks and tables.</span>
          </div>
        </div>
      </div>

      <CanvasPreview title={title.split(' · ')[0]} stages={stages} canvas={canvas} people={people} />
    </div>
  )
}
