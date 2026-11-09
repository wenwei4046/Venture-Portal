'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DialogButton, DialogForm, FinDialog, Hint } from './Dialog'
import fm from './form.module.css'

// Export PDF with a choice (2026-11-09, the user: "export 可以选要不要include attachment"): one tick, Include
// attachments, never ticked for you; ticked, each invoice or voucher is followed by its own files (PDF, JPG, PNG) in the
// order they were added. Print is this PDF printed, so the two are the same.

/** The PDF link with Include attachments asked for, or as it was. */
export function pdfHref(href: string, include: boolean): string {
  if (!include) return href
  return `${href}${href.includes('?') ? '&' : '?'}attachments=1`
}

export function PdfExportDialog({
  open,
  onClose,
  href,
  what,
  sub,
}: {
  open: boolean
  onClose: () => void
  href: string
  /** "invoice" or "voucher" — what each file follows. */
  what: 'invoice' | 'voucher'
  sub?: ReactNode
}) {
  const [include, setInclude] = useState(false)
  useEffect(() => {
    if (open) setInclude(false)
  }, [open])
  const go = () => {
    window.open(pdfHref(href, include), '_blank', 'noopener,noreferrer')
    onClose()
  }
  return (
    <FinDialog open={open} onClose={onClose} title="Export PDF" sub={sub}>
      <DialogForm
        buttons={
          <>
            <DialogButton onClick={onClose}>Cancel</DialogButton>
            <DialogButton kind="primary" onClick={go}>
              Export PDF
            </DialogButton>
          </>
        }
      >
        <div className={fm.checks}>
          <label className={fm.check}>
            <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
            <span className={fm.checkName}>Include attachments</span>
          </label>
        </div>
        <Hint>
          {include
            ? `Each ${what} is followed by its own attachments — PDF, JPG and PNG files, in the order they were added. Excel and Word files are not printed.`
            : `Only the ${what === 'invoice' ? 'invoices' : 'vouchers'} themselves.`}
        </Hint>
      </DialogForm>
    </FinDialog>
  )
}

/** A PDF button that asks first: the head of a record's page or drawer. */
export function PdfExportButton({
  href,
  what,
  sub,
  className,
  children = 'PDF',
}: {
  href: string
  what: 'invoice' | 'voucher'
  sub?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <PdfExportDialog open={open} onClose={() => setOpen(false)} href={href} what={what} sub={sub} />
    </>
  )
}
