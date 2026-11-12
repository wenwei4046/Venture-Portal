'use client'

import w from './workflows.module.css'

// The builder's toast: a few words, and Undo while a delete can still be taken back (6 s).

export default function BuilderToast({ text, onUndo }: { text: string; onUndo: (() => void) | null }) {
  return (
    <div className={w.toastWrap}>
      <div className={w.toast} role="status">
        {text}
        {onUndo ? <button type="button" className={w.undo} onClick={onUndo}>Undo</button> : null}
      </div>
    </div>
  )
}
