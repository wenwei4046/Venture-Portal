'use client'

import w from './workflows.module.css'

// A switch with its title and a line under it (the prototype's 36×20 toggle, 0.2s). `top`: the subtasks row's
// top-aligned layout; else centred (Repeat daily).

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
  /** The line under it in amber (why it is off). */
  subWait?: boolean
  disabled?: boolean
  top?: boolean
  onChange: (on: boolean) => void
}) {
  return (
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
        <span className={`${w.toggleSub}${subWait ? ` ${w.hintWait}` : ''}`}>{sub}</span>
      </span>
      <span className={`${w.toggle}${on && !disabled ? ` ${w.toggleOn}` : ''}${disabled ? ` ${w.toggleOff}` : ''}`} />
    </button>
  )
}
