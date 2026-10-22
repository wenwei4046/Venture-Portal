'use client'

import { useState, type ReactNode } from 'react'
import {
  CANVAS_MAX_FIELDS, CANVAS_MAX_SECTIONS, DEFAULT_STAGE_SEC, fieldFlags, newCanvasField, newCanvasSection, SECTION_ICONS,
  type CanvasField, type CanvasSection, type WfCanvas,
} from '@/lib/marketing/canvas'
import { FIELD_GLYPH, type FormField } from '@/lib/marketing/tasks'
import type { WfStage } from '@/lib/marketing/workflows'
import { FieldPop, SectionPop } from './CanvasPop'
import CanvasPreview from './CanvasPreview'
import c from './canvas.module.css'

// The Canvas Template Editor (`Canvas Template Editor.dc.html`, the Workflow Builder's *Canvas template* tab, the
// manager's): the task page of a project started from this template, laid out — 📋 Requirements first (from the intake
// minutes), a section per stage with the fields it fills in, the manager's own sections (+ Add section), the Free space
// last — each section's and field's settings in a panel beside it, and the Preview as the staff or the PIC see it.
// A stage's own fields are the stage's (named and typed there too); the editor hands back the stages and the canvas
// changed, and the Workflow Builder saves them with the draft.

type Pop = { kind: 'sec'; sec: string } | { kind: 'field'; sec: string; at: number } | null
type Tests = Record<string, { cells: Record<string, string | boolean>; extra: number }>

const BADGE_TIP: Record<string, string> = {
  '🔒': "Locked — colleagues can't delete",
  '⭐': 'Required before submit',
  '🎯': 'Belongs to stage',
  '👁': 'Visible to PIC',
}

function Badges({ list }: { list: string[] }) {
  return (
    <>
      {list.map(b => (
        <span key={b} className={c.badge} title={BADGE_TIP[[...b][0]] ?? undefined}>{b}</span>
      ))}
    </>
  )
}

export default function CanvasEditor({
  title,
  version,
  stages,
  canvas,
  saveState,
  nameAt,
  onStages,
  onCanvas,
  onEditStage,
}: {
  /** "Reels video · Full production" */
  title: string
  /** The draft's version (the next to publish). */
  version: number
  stages: WfStage[]
  canvas: WfCanvas
  saveState: ReactNode
  nameAt: (at: number) => string
  onStages: (next: WfStage[]) => void
  onCanvas: (next: WfCanvas) => void
  /** Open a stage on the Workflow stages tab. */
  onEditStage: (at: number) => void
}) {
  const [pop, setPop] = useState<Pop>(null)
  const [icons, setIcons] = useState<string | null>(null)
  const [tests, setTests] = useState<Tests>({})
  const names = stages.map((s, i) => s.name || `Stage ${i + 1}`)

  const setStage = (i: number, patch: Partial<WfStage>) => onStages(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const setStageField = (i: number, j: number, next: FormField) => setStage(i, { form: stages[i].form.map((f, k) => (k === j ? next : f)) })
  const setSection = (key: string, fn: (s: CanvasSection) => CanvasSection) => onCanvas({ ...canvas, sections: canvas.sections.map(s => (s.key === key ? fn(s) : s)) })
  const toggleSec = (sec: string) => {
    setIcons(null)
    setPop(p => (p?.kind === 'sec' && p.sec === sec ? null : { kind: 'sec', sec }))
  }
  const openField = (sec: string, at: number) => {
    setIcons(null)
    setPop(p => (p?.kind === 'field' && p.sec === sec && p.at === at ? null : { kind: 'field', sec, at }))
  }
  const secOpen = (sec: string) => pop?.kind === 'sec' && pop.sec === sec
  const fieldOpen = (sec: string, at: number) => pop?.kind === 'field' && pop.sec === sec && pop.at === at

  const iconPicker = (id: string, emoji: string, pick: (e: string) => void) => (
    <span className={c.iconWrap}>
      <button type="button" className={c.iconBtn} title="Change icon" aria-label="Change icon" onClick={() => { setPop(null); setIcons(o => (o === id ? null : id)) }}>{emoji}</button>
      {icons === id ? (
        <span className={c.icons} role="listbox" aria-label="Icons">
          {SECTION_ICONS.map(e => (
            <button key={e} type="button" role="option" aria-selected={e === emoji} className={c.iconOpt} onClick={() => { pick(e); setIcons(null) }}>{e}</button>
          ))}
        </span>
      ) : null}
    </span>
  )

  // A table field's grid: its preset rows (🔒 for the team to read) and blank cells to try out, kept on this page only.
  const tablePreview = (id: string, f: FormField) => {
    const cols = f.cols ?? []
    const rows = f.rows ?? []
    const t = tests[id] ?? { cells: {}, extra: 0 }
    const set = (k: string, v: string | boolean) => setTests(p => ({ ...p, [id]: { ...(p[id] ?? { cells: {}, extra: 0 }), cells: { ...(p[id]?.cells ?? {}), [k]: v } } }))
    const blank = (r: number, ci: number) => {
      const k = `${r}-${ci}`
      const type = cols[ci]?.type ?? 'Text'
      return type === 'Checkbox' ? (
        <input type="checkbox" className={c.tCheck} aria-label={`Row ${r + 1}, ${cols[ci]?.name || `Column ${ci + 1}`}`} checked={t.cells[k] === true} onChange={e => set(k, e.target.checked)} />
      ) : (
        <input
          className={c.tInput}
          type={type === 'Number' ? 'number' : type === 'Date' ? 'date' : 'text'}
          placeholder={type === 'Number' ? '0' : type === 'Person' ? 'Name' : 'Type here…'}
          aria-label={`Row ${r + 1}, ${cols[ci]?.name || `Column ${ci + 1}`}`}
          value={typeof t.cells[k] === 'string' ? (t.cells[k] as string) : ''}
          onChange={e => set(k, e.target.value)}
        />
      )
    }
    return (
      <div className={c.table}>
        <div className={c.tScroll}>
          <div className={c.tGrid} style={{ gridTemplateColumns: cols.map(() => 'minmax(110px, 1fr)').join(' ') || '1fr' }}>
            {cols.map((col, ci) => (
              <div key={`h${ci}`} className={c.tHead}><span className={c.glyph}>{FIELD_GLYPH[col.type]}</span><span className={c.tHeadName}>{col.name}</span><span className={c.muted}>{col.type}</span></div>
            ))}
            {rows.flatMap((r, ri) => cols.map((_, ci) => (r[ci] ?? '').trim()
              ? <div key={`p${ri}-${ci}`} className={`${c.tCell} ${c.tFixed}`} title="Preset — the team can't change this"><span className={c.tLock}>🔒</span>{r[ci]}</div>
              : <div key={`p${ri}-${ci}`} className={c.tCell} title="Left blank — the team fills this in">{blank(ri, ci)}</div>))}
            {Array.from({ length: 1 + t.extra }, (_, ei) => cols.map((_, ci) => (
              <div key={`e${ei}-${ci}`} className={c.tCell} title="Left blank — the team fills this in">{blank(rows.length + ei, ci)}</div>
            )))}
          </div>
        </div>
        <div className={c.tFoot}>
          <button type="button" className={c.tAdd} onClick={() => setTests(p => ({ ...p, [id]: { cells: p[id]?.cells ?? {}, extra: (p[id]?.extra ?? 0) + 1 } }))}>+ Add row</button>
          <button type="button" className={c.tClear} disabled={!tests[id]} onClick={() => setTests(p => { const n = { ...p }; delete n[id]; return n })}>Clear test entries</button>
          <span className={c.grow} />
          <span className={c.tKey}>🔒 Preset</span>
          <span className={c.tKey}><span className={c.tKeyBlank} />Blank</span>
        </div>
      </div>
    )
  }

  const fieldRow = (sec: string, at: number, f: FormField, stageName: string | null, pop: ReactNode) => (
    <div key={`${sec}-${at}`} className={c.fieldWrap}>
      <button type="button" className={`${c.field}${fieldOpen(sec, at) ? ` ${c.fieldOn}` : ''}${f.type === 'Note' ? ` ${c.fieldNote}` : ''}`} onClick={() => openField(sec, at)}>
        <span className={c.glyph}>{FIELD_GLYPH[f.type]}</span>
        <span className={f.type === 'Note' ? c.noteText : c.fieldName}>{f.label || 'Unnamed field'}</span>
        <span className={c.muted}>{f.type}</span>
        <span className={c.grow} />
        <span className={c.flags}>{stageName ? `🎯 ${stageName}  ` : ''}{fieldFlags(f)}</span>
      </button>
      {f.type === 'Table' ? tablePreview(`${sec}-${at}`, f) : null}
      {fieldOpen(sec, at) ? pop : null}
    </div>
  )

  const atMost = canvas.sections.length >= CANVAS_MAX_SECTIONS

  return (
    <div className={c.page}>
      <div className={c.main}>
        <div className={c.head}>
          <span className={c.title}>{title}</span>
          <span className={c.ver}>Canvas template · draft v{version}</span>
          <span className={c.grow} />
          {saveState}
        </div>

        <div className={c.sections}>
          {/* 📋 Requirements: from the intake minutes, read-only, always first. */}
          <section className={`${c.card}${secOpen('req') ? ` ${c.cardOn}` : ''}`} aria-label="Requirements">
            <div className={c.cardHead}>
              <span className={c.emoji}>📋</span>
              <span className={c.cardTitle}>Requirements</span>
              <Badges list={['🔒 Locked', ...(canvas.req.pic ? ['👁 PIC'] : [])]} />
              <span className={c.grow} />
              <button type="button" className={`${c.gear}${secOpen('req') ? ` ${c.gearOn}` : ''}`} onClick={() => toggleSec('req')}>⚙ Section settings</button>
            </div>
            <div className={c.req}>From the intake minutes</div>
            {secOpen('req') ? (
              <SectionPop title="Requirements" sec={{ locked: true, req: false, pic: canvas.req.pic }} showPic only="pic" stages={names} stage={null}
                onChange={s => onCanvas({ ...canvas, req: { pic: s.pic } })} onClose={() => setPop(null)} />
            ) : null}
          </section>

          {/* A section per stage: the fields it fills in. */}
          {stages.map((s, i) => {
            const id = `s${i}`
            const sec = s.sec ?? DEFAULT_STAGE_SEC
            return (
              <section key={s.key} className={`${c.card}${secOpen(id) || pop?.sec === id ? ` ${c.cardOn}` : ''}`} aria-label={names[i]}>
                <div className={c.cardHead}>
                  {iconPicker(id, sec.emoji, e => setStage(i, { sec: { ...sec, emoji: e } }))}
                  <span className={c.cardTitle}>{names[i]}</span>
                  <Badges list={[...(sec.locked ? ['🔒 Locked'] : []), ...(sec.req ? ['⭐ Required'] : []), `🎯 ${names[i]}`, ...(sec.pic ? ['👁 PIC'] : [])]} />
                  <span className={c.grow} />
                  <button type="button" className={`${c.gear}${secOpen(id) ? ` ${c.gearOn}` : ''}`} onClick={() => toggleSec(id)}>⚙ Section settings</button>
                </div>
                {s.form.length ? (
                  <div className={c.fields}>
                    {s.form.map((f, j) =>
                      fieldRow(id, j, f, names[i], (
                        <FieldPop field={f} stages={names} stage={i} own showPic onChange={next => setStageField(i, j, next)} onClose={() => setPop(null)} />
                      )),
                    )}
                  </div>
                ) : (
                  <div className={c.none}>No fields</div>
                )}
                {secOpen(id) ? (
                  <SectionPop title={names[i]} sec={sec} showPic stages={names} stage={{ at: i, fixed: true }}
                    onChange={next => setStage(i, { sec: { ...sec, ...next } })} onEditStage={() => onEditStage(i)} onClose={() => setPop(null)} />
                ) : null}
              </section>
            )
          })}

          {/* The manager's own sections. */}
          {canvas.sections.map(s => {
            const id = `c${s.key}`
            const stageName = s.stage != null ? names[s.stage] ?? null : null
            return (
              <section key={s.key} className={`${c.card}${secOpen(id) || pop?.sec === id ? ` ${c.cardOn}` : ''}`} aria-label={s.title || 'New section'}>
                <div className={c.cardHead}>
                  {iconPicker(id, s.emoji, e => setSection(s.key, x => ({ ...x, emoji: e })))}
                  <input className={c.cardTitleInput} value={s.title} maxLength={60} placeholder="Section name" aria-label="Section name"
                    onChange={e => setSection(s.key, x => ({ ...x, title: e.target.value }))} />
                  <Badges list={[...(s.locked ? ['🔒 Locked'] : []), ...(s.req ? ['⭐ Required'] : []), ...(stageName ? [`🎯 ${stageName}`] : []), ...(s.pic ? ['👁 PIC'] : [])]} />
                  <button type="button" className={`${c.gear}${secOpen(id) ? ` ${c.gearOn}` : ''}`} onClick={() => toggleSec(id)}>⚙ Section settings</button>
                </div>
                <div className={c.fields}>
                  {s.fields.map((f, j) =>
                    fieldRow(id, j, f, f.stage != null ? names[f.stage] ?? null : null, (
                      <FieldPop<CanvasField>
                        field={f}
                        stages={names}
                        stage={f.stage}
                        own={false}
                        showPic
                        onChange={next => setSection(s.key, x => ({ ...x, fields: x.fields.map((y, k) => (k === j ? next : y)) }))}
                        onStage={at => setSection(s.key, x => ({ ...x, fields: x.fields.map((y, k) => (k === j ? { ...y, stage: at } : y)) }))}
                        onRemove={() => {
                          setPop(null)
                          setSection(s.key, x => ({ ...x, fields: x.fields.filter((_, k) => k !== j) }))
                        }}
                        onClose={() => setPop(null)}
                      />
                    )),
                  )}
                  {s.fields.length < CANVAS_MAX_FIELDS ? (
                    <button type="button" className={c.addField} onClick={() => {
                      const at = s.fields.length
                      setSection(s.key, x => ({ ...x, fields: [...x.fields, newCanvasField(x.stage ?? (stages.length ? stages.length - 1 : null))] }))
                      setPop({ kind: 'field', sec: id, at })
                    }}>+ Add field</button>
                  ) : null}
                </div>
                {secOpen(id) ? (
                  <SectionPop
                    title={s.title || 'New section'}
                    sec={s}
                    showPic
                    stages={names}
                    stage={{ at: s.stage, fixed: false }}
                    onChange={next => setSection(s.key, x => ({ ...x, ...next }))}
                    onStage={at => setSection(s.key, x => ({ ...x, stage: at }))}
                    onRemove={() => {
                      setPop(null)
                      onCanvas({ ...canvas, sections: canvas.sections.filter(x => x.key !== s.key) })
                    }}
                    onClose={() => setPop(null)}
                  />
                ) : null}
              </section>
            )
          })}

          <button type="button" className={c.addSection} disabled={atMost} onClick={() => {
            const next = newCanvasSection(stages.length)
            onCanvas({ ...canvas, sections: [...canvas.sections, next] })
            setPop({ kind: 'sec', sec: `c${next.key}` })
          }}>+ Add section</button>

          <div className={c.free} title="Always at the bottom — the only place colleagues add their own blocks and tables">
            <span className={c.freeRule} />
            <span className={c.freeLabel}>🔒 Free space</span>
            <span className={c.freeRule} />
          </div>
        </div>
      </div>

      <CanvasPreview title={title.split(' · ')[0]} stages={stages} canvas={canvas} nameAt={nameAt} />
    </div>
  )
}
