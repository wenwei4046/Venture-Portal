'use client'

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { usePresence } from './presence'
import s from './finv.module.css'

// The Finance view's dialog (2026-10-14, the Finance revamp v2 — the
// prototype's desktop sheet, D07): a 520px panel centred over the whole
// window on a walnut scrim, fading in from .98 over .2s and out the same way
// before it unmounts. Esc and the scrim close it, except while `locked` (a
// write in flight). Its bodies: a menu (DialogMenu), a confirm
// (DialogConfirm), or a form (DialogForm + Field / Input + DialogButton).

const EXIT_MS = 320

export function FinDialog({
  open,
  onClose,
  title,
  sub,
  label,
  locked = false,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** The line under the title ("New payment voucher · HV-PV-202610"). */
  sub?: ReactNode
  /** The dialog's name for a screen reader, when the title is not words. */
  label?: string
  locked?: boolean
  children: ReactNode
}) {
  const id = useId()
  const { mounted, shown } = usePresence(open, EXIT_MS)
  const close = () => {
    if (!locked) onClose()
  }
  useEscape(open, close)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [open])
  if (!mounted || typeof document === 'undefined') return null
  return createPortal(
    <div className={s.dialogRoot} data-shown={shown ? 'true' : 'false'} data-fin-dialog="" data-fin-kit="">
      <div className={s.dialogScrim} onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : `${id}-title`}
        className={s.dialog}
      >
        <div className={s.dialogHead}>
          <div className={s.dialogHeadText}>
            <div id={`${id}-title`} className={s.dialogTitle}>{title}</div>
            {sub ? <div className={s.dialogSub}>{sub}</div> : null}
          </div>
          <button type="button" className={s.dialogClose} onClick={close} disabled={locked} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export interface DialogMenuItem {
  key: string
  label: string
  sub?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

/** A menu's rows on a white card (Dept · 2, Create invoice ▾, a row's ⋯). */
export function DialogMenu({ items }: { items: DialogMenuItem[] }) {
  return (
    <div className={s.menuBody}>
      <div className={s.menuCard} role="menu">
        {items.map((m) => (
          <button key={m.key} type="button" role="menuitem" className={s.menuRow} onClick={m.onClick} disabled={m.disabled}>
            <span className={s.menuLabel} data-danger={m.danger ? 'true' : undefined}>{m.label}</span>
            {m.sub ? <span className={s.menuSub}>{m.sub}</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A question: the sentence, then Cancel and the answer (red when it undoes or removes). */
export function DialogConfirm({
  text,
  confirmLabel,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  text: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className={s.confirmBody}>
      <p className={s.confirmText}>{text}</p>
      <div className={s.confirmButtons}>
        <button type="button" className={s.btn} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={s.btn} data-kind={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

/** A form's two parts: the fields that scroll, then the buttons at the foot. */
export function DialogForm({
  children,
  buttons,
  onSubmit,
}: {
  children: ReactNode
  buttons: ReactNode
  onSubmit?: () => void
}) {
  return (
    <form
      style={{ display: 'contents' }}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
    >
      <div className={s.formBody} data-cal-scope="">
        {children}
      </div>
      <div className={s.formFoot}>{buttons}</div>
    </form>
  )
}

/** A field: its label over its control. */
export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className={s.field}>
      <label className={s.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

/** The text box (40px, radius 10, the orange ring on focus); `mono` for amounts, `align="right"` for figures. */
export function Input({ mono = false, align, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; align?: 'left' | 'right' }) {
  return (
    <input
      {...props}
      className={[s.input, className ?? ''].filter(Boolean).join(' ')}
      data-mono={mono ? 'true' : undefined}
      data-align={align === 'right' ? 'right' : undefined}
    />
  )
}

/** The note under a form's fields ("Pay to and an amount are needed before you can save."). */
export function Hint({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <p className={s.hint} data-tone={danger ? 'danger' : undefined} role={danger ? 'alert' : undefined}>
      {children}
    </p>
  )
}

/**
 * A dialog's button. `kind`: the orange primary, the red danger, or the white
 * one; `off`: drawn at .45 while what it needs is missing (it still says why
 * when pressed, as the prototype's does nothing).
 */
export function DialogButton({
  kind = 'secondary',
  off = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'danger'; off?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[s.btn, className ?? ''].filter(Boolean).join(' ')}
      data-kind={kind === 'secondary' ? undefined : kind}
      data-off={off ? 'true' : undefined}
    />
  )
}
