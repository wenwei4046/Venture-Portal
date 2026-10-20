'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import s from './signature-pad.module.css'

/** The picture the pad hands back, in its own pixels — what the database keeps (mig 20261021013000). */
export const PAD_W = 600
export const PAD_H = 200
/** Ink, in the picture's pixels, before what is drawn counts as a signature: a tap or a stray dot does not. */
export const MIN_INK = 40

/**
 * The signature pad (2026-10-20 — the user: "点进去的时候，应该要有一个 signature，也就是他自己手绘签名的那种，签完之后
 * 再来点那个 Acknowledge button"): white paper with a line to sign on, drawn on with a finger or a mouse. Each stroke
 * that leaves enough ink hands the whole picture back as a PNG data URL (`onChange`); Clear hands back null. The face it
 * sits in — the Revenue app's memo, the HR app's, the portal's memo bell — opens its Acknowledge only once it has one.
 *
 * A signature handed in (`value`, drawn before this pad was put on the screen) is drawn back onto it, so what is sent is
 * what is seen; `value` going back to null (another memo, a refusal) clears it.
 */
export default function SignaturePad({ value, onChange, disabled = false, label = 'Sign here', className }: {
  value: string | null
  onChange: (png: string | null) => void
  disabled?: boolean
  /** The hint on the paper, and the drawing surface's name. */
  label?: string
  className?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const ink = useRef(0)
  const sent = useRef<string | null>(null)
  // Anything drawn yet (the hint gives way, Clear shows) — a signature or not.
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d') ?? null
    if (value === null) {
      ctx?.clearRect(0, 0, PAD_W, PAD_H)
      ink.current = 0
      sent.current = null
      setTouched(false)
      return
    }
    if (value === sent.current) return
    sent.current = value
    ink.current = Math.max(ink.current, MIN_INK)
    setTouched(true)
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, PAD_W, PAD_H)
      ctx.drawImage(img, 0, 0, PAD_W, PAD_H)
    }
    img.src = value
  }, [value])

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (r.width ? PAD_W / r.width : 1),
      y: (e.clientY - r.top) * (r.height ? PAD_H / r.height : 1),
    }
  }

  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      // A pointer the browser no longer tracks: the stroke still draws.
    }
    const p = point(e)
    last.current = p
    setTouched(true)
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = getComputedStyle(e.currentTarget).color
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    const from = last.current
    if (!from) return
    const p = point(e)
    const ctx = e.currentTarget.getContext('2d')
    ctx?.lineTo(p.x, p.y)
    ctx?.stroke()
    ink.current += Math.hypot(p.x - from.x, p.y - from.y)
    last.current = p
  }

  function up(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!last.current) return
    last.current = null
    if (ink.current < MIN_INK) return
    let png: string | null = null
    try {
      png = e.currentTarget.toDataURL('image/png')
    } catch {
      png = null
    }
    if (!png?.startsWith('data:image/png;base64,')) return
    sent.current = png
    onChange(png)
  }

  function clear() {
    canvas.current?.getContext('2d')?.clearRect(0, 0, PAD_W, PAD_H)
    ink.current = 0
    sent.current = null
    setTouched(false)
    onChange(null)
  }

  return (
    <div className={`${s.pad} ${className ?? ''}`} data-disabled={disabled ? '' : undefined} data-signed={value ? '' : undefined}>
      <span className={s.line} aria-hidden="true" />
      {!touched ? <span className={s.hint} aria-hidden="true">{label}</span> : null}
      <canvas
        ref={canvas}
        className={s.canvas}
        width={PAD_W}
        height={PAD_H}
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {touched && !disabled ? (
        <button type="button" className={s.clear} onClick={clear}>
          Clear
        </button>
      ) : null}
    </div>
  )
}

/** A kept signature drawn back — beside "Acknowledged", in HR's lists (`small`: a thumbnail). */
export function SignatureImage({ src, alt, small = false, className }: { src: string; alt: string; small?: boolean; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a data URL the database kept, not a static asset
  return <img src={src} alt={alt} className={`${s.signed} ${small ? s.signedSmall : ''} ${className ?? ''}`} />
}
