'use client'

import { createContext, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from '@/components/hrv/overlay'
import { usePresence } from './presence'
import { useFinSurface } from './surface'
import s from './finv.module.css'

// The Finance view's dialog (2026-10-14, the Finance revamp v2 — the
// prototype's desktop sheet, D07): a 520px panel centred over the whole
// window on a walnut scrim, fading in from .98 over .2s and out the same way
// before it unmounts. Esc and the scrim close it, except while `locked` (a
// write in flight). Its bodies: a menu (DialogMenu), a confirm
// (DialogConfirm), or a form (DialogForm + Field / Input + DialogButton).
//
// Inside the Finance phone app (2026-10-15, `FinSurface`) the same window is
// the design's bottom sheet (README § Motion, M05–M08, M18): from the foot,
// translateY(105%) → 0 over .32s on a .28 walnut scrim, the grab bar over a
// 20px title, iOS's round × (Android has none — the scrim and Back close it),
// a form's sheet 92% of the screen (`tall`), a menu's rows 52px with iOS's
// Cancel under them — one window, every feature, in each place.

const EXIT_MS = 320

/** What a body inside a window may ask of it: to close, and how it is drawn. */
const DialogCtx = createContext<{ close: () => void; sheet: boolean; ios: boolean } | null>(null)

export function FinDialog({
  open,
  onClose,
  title,
  sub,
  label,
  locked = false,
  tall = false,
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
  /** A form's sheet on the phone stands 92% of the screen (the prototype's `h: '92%'`); the desktop ignores it. */
  tall?: boolean
  children: ReactNode
}) {
  const id = useId()
  const surface = useFinSurface()
  const sheet = surface !== null
  const ios = surface?.platform === 'ios'
  const { mounted, shown } = usePresence(open, EXIT_MS)
  // Drawn only once the page is the browser's: a dialog open from the first render (`/payments?new=1`)
  // has no <body> to portal to on the server, and drawing it during hydration would not match.
  const [client, setClient] = useState(false)
  useEffect(() => setClient(true), [])
  const close = () => {
    if (!locked) onClose()
  }
  useEscape(open, close)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !client) return
    const before = document.activeElement as HTMLElement | null
    panel.current?.focus({ preventScroll: true })
    return () => before?.focus?.({ preventScroll: true })
  }, [open, client])
  if (!mounted || !client || typeof document === 'undefined') return null
  return createPortal(
    <div
      className={s.dialogRoot}
      data-shown={shown ? 'true' : 'false'}
      data-fin-dialog=""
      data-fin-kit=""
      data-sheet={sheet ? '' : undefined}
      data-platform={surface?.platform}
    >
      <div className={s.dialogScrim} onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : `${id}-title`}
        className={s.dialog}
        data-tall={sheet && tall ? '' : undefined}
      >
        {sheet ? (
          <div className={s.sheetHead}>
            <span className={s.grab} aria-hidden="true" />
            <div className={s.sheetHeadRow}>
              <div className={s.dialogHeadText}>
                <div id={`${id}-title`} className={s.dialogTitle}>{title}</div>
                {sub ? <div className={s.dialogSub}>{sub}</div> : null}
              </div>
              {ios ? (
                <button type="button" className={s.sheetClose} onClick={close} disabled={locked} aria-label="Close">
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={s.dialogHead}>
            <div className={s.dialogHeadText}>
              <div id={`${id}-title`} className={s.dialogTitle}>{title}</div>
              {sub ? <div className={s.dialogSub}>{sub}</div> : null}
            </div>
            <button type="button" className={s.dialogClose} onClick={close} disabled={locked} aria-label="Close">
              ×
            </button>
          </div>
        )}
        <DialogCtx.Provider value={{ close, sheet, ios }}>{children}</DialogCtx.Provider>
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

/** A menu's rows on a white card (Dept · 2, Create invoice ▾, a row's ⋯) — on an iPhone's sheet, Cancel under it. */
export function DialogMenu({ items }: { items: DialogMenuItem[] }) {
  const ctx = useContext(DialogCtx)
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
      {ctx?.sheet && ctx.ios ? (
        <button type="button" className={s.menuCancel} onClick={ctx.close}>
          Cancel
        </button>
      ) : null}
    </div>
  )
}

/**
 * A question: the sentence, then Cancel and the answer (red when it undoes or
 * removes). What the system asks besides — a void's reason — goes between
 * (`children`), and a refusal under it in red (`error`).
 */
export function DialogConfirm({
  text,
  confirmLabel,
  danger = false,
  busy = false,
  off = false,
  error,
  children,
  onCancel,
  onConfirm,
}: {
  text: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  /** Drawn at .45 while what it needs is missing. */
  off?: boolean
  error?: string | null
  children?: ReactNode
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className={s.confirmBody}>
      <p className={s.confirmText}>{text}</p>
      {children ? <div className={s.confirmExtra}>{children}</div> : null}
      {error ? (
        <p className={`${s.hint} ${s.confirmError}`} data-tone="danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className={s.confirmButtons}>
        <button type="button" className={s.btn} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={s.btn} data-kind={danger ? 'danger' : 'primary'} data-off={off ? 'true' : undefined} onClick={onConfirm} disabled={busy}>
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

/** A few lines of words — the text box's look, grown to its lines (a fund source's notes). */
export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={[s.input, s.area, className ?? ''].filter(Boolean).join(' ')} />
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
