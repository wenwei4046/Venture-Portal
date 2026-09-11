'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  label: string
  title: string
  description: string
  step: 'selection' | 'review' | 'result'
  closeDisabled: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Native modality keeps the portal inert while this payment task is open. */
export default function GenerationWindow({ label, title, description, step, closeDisabled, onClose, children, footer }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // PortalFrame scrolls main, rather than the document body.
    const main = dialog.closest('main')
    const mainOverflow = main?.style.overflow ?? ''
    const scrollTop = main?.scrollTop ?? 0
    const scrollLeft = main?.scrollLeft ?? 0
    const bodyOverflow = document.body.style.overflow
    if (main) main.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      if (main) {
        main.style.overflow = mainOverflow
        main.scrollTop = scrollTop
        main.scrollLeft = scrollLeft
      }
      document.body.style.overflow = bodyOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0
      bodyRef.current.focus({ preventScroll: true })
    }
  }, [step])

  return <dialog
    ref={dialogRef}
    className="pay-win pay-generation-window"
    data-step={step}
    aria-label={label}
    aria-describedby={descriptionId}
    aria-modal="true"
    aria-busy={closeDisabled}
    onCancel={event => {
      event.preventDefault()
      if (!closeDisabled) onClose()
    }}
    onClick={event => {
      if (closeDisabled || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }}
  >
    <div className="wh">
      <div><h3>{title}</h3><p id={descriptionId} className="pay-muted">{description}</p></div>
      <button ref={closeRef} type="button" className="x" aria-label="Close" disabled={closeDisabled} onClick={onClose}>×</button>
    </div>
    <div ref={bodyRef} className="wb" tabIndex={-1}>{children}</div>
    {footer ? <div className="wf">{footer}</div> : null}
  </dialog>
}
