'use client'

import c from './canvas.module.css'

// The canvas panels' 30×18 switch with its words (`Canvas Template Editor.dc.html`).

export default function CanvasSwitch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={c.swRow} disabled={disabled} onClick={() => onChange(!on)}>
      <span className={`${c.sw}${on ? ` ${c.swOn}` : ''}`} />
      <span>{label}</span>
    </button>
  )
}
