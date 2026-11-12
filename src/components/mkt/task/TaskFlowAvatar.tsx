import type { CSSProperties } from 'react'
import s from './taskflow.module.css'

// A person's soft circle on the task page's top (Task Flow.dc.html): their initial on a hue of their own; dashed and
// white while nobody is on a stage yet; green once the task is done.

export default function TaskFlowAvatar({ init, hue, size, open = false, done = false }: {
  init: string
  hue: number
  size: 18 | 22 | 26 | 28
  open?: boolean
  done?: boolean
}) {
  const cls = { 18: s.av18, 22: s.av22, 26: s.av26, 28: s.av28 }[size]
  return (
    <span className={`${s.av} ${cls}${open ? ` ${s.avOpen}` : ''}${done ? ` ${s.avDone}` : ''}`} style={{ '--h': hue } as CSSProperties} aria-hidden="true">
      {init}
    </span>
  )
}
