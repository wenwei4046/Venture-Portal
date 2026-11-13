'use client'

import w from './workflows.module.css'

// The foot (2a): what publishing refuses (red pills — only the basics since 2026-11-13; Publish waits for them), what
// publishing will tidy in the version (amber), "{n} active tasks stay on v{n-1}",
// ▶ Preview task page, Save draft (faded while nothing is unsaved) and Publish v{n}. It wraps; it never overlaps.

export default function BuilderFoot({
  problems,
  fixups = [],
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
  /** What publishing will tidy in the version (publishFixups). */
  fixups?: string[]
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
      {fixups.map(p => <span key={p} className={w.warn}>⚠️ {p}</span>)}
      <span className={w.grow} />
      <span className={w.activeNote}>{activeNote}</span>
      <button type="button" className={`${w.btn} ${w.btnPv}`} title="See the task page staff and PIC will get" onClick={onPreview}>▶ Preview task page</button>
      <button type="button" className={`${w.btn}${dirty ? '' : ` ${w.btnClean}`}`} onClick={onSave}>Save draft</button>
      <button type="button" className={w.publish} disabled={publishOff} title={publishWhy} onClick={onPublish}>Publish v{next}</button>
    </div>
  )
}
