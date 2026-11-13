'use client'

import Tip from '../ui/Tip'
import w from './workflows.module.css'

// A switch with its title (the prototype's 36×20 toggle, 0.2s). What it does (`sub`) shows only while the row is pointed
// at or reached by the keyboard (the user, 2026-11-13) — a tooltip; why it is off (`subWait`) is a status and stays on
// the page, in amber. `top`: the subtasks row's top-aligned layout; else centred (Repeat daily).

export default function ToggleRow({
  on,
  title,
  sub,
  subWait,
  disabled,
  top,
  onChange,
}: {
  on: boolean
  title: string
  sub: string
  /** `sub` is why it is off: shown under it in amber, not as a tooltip. */
  subWait?: boolean
  disabled?: boolean
  top?: boolean
  onChange: (on: boolean) => void
}) {
  const row = (
    <button
      type="button"
      role="switch"
      aria-checked={on && !disabled}
      aria-disabled={disabled || undefined}
      className={`${w.toggleRow}${top ? ` ${w.toggleRowTop}` : ''}`}
      onClick={() => !disabled && onChange(!on)}
    >
      <span className={`${w.toggleText}${top ? ` ${w.toggleTextTight}` : ''}`}>
        <span className={w.q}>{title}</span>
        {subWait ? <span className={`${w.toggleSub} ${w.hintWait}`}>{sub}</span> : null}
      </span>
      <span className={`${w.toggle}${on && !disabled ? ` ${w.toggleOn}` : ''}${disabled ? ` ${w.toggleOff}` : ''}`} />
    </button>
  )
  return subWait ? row : <Tip text={sub}>{row}</Tip>
}
