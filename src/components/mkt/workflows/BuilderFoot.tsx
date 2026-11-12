'use client'

import w from './workflows.module.css'

// The foot (2a): what publishing refuses (red pills — Publish waits for them), "{n} active tasks stay on v{n-1}",
// ▶ Preview task page, Save draft (faded while nothing is unsaved) and Publish v{n}. It wraps; it never overlaps.

export default function BuilderFoot({
  problems,
  activeNote,
  next,
  dirty,
  publishOff,
  publishWhy,
  onPreview,
  onSave,
  onPublish,
}: {
  problems: string[]
  activeNote: string
  next: number
  dirty: boolean
  publishOff: boolean
  publishWhy: string | undefined
  onPreview: () => void
  onSave: () => void
  onPublish: () => void
}) {
  return (
    <div className={w.foot}>
      {problems.map(p => <span key={p} className={w.problem}>⚠️ {p}</span>)}
      <span className={w.grow} />
      <span className={w.activeNote}>{activeNote}</span>
      <button type="button" className={`${w.btn} ${w.btnPv}`} title="See the task page staff and PIC will get" onClick={onPreview}>▶ Preview task page</button>
      <button type="button" className={`${w.btn}${dirty ? '' : ` ${w.btnClean}`}`} onClick={onSave}>Save draft</button>
      <button type="button" className={w.publish} disabled={publishOff} title={publishWhy} onClick={onPublish}>Publish v{next}</button>
    </div>
  )
}
