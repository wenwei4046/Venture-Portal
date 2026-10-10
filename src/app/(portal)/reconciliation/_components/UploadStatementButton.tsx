'use client'

import { useId, useState } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import UploadStatementForm from './UploadStatementForm'

// Upload statement in the page head (2026-10-10, the handoff): it opens the
// form in a modal over the page — it used to unfold under the cards at
// ?upload=1, which still opens it (`defaultOpen`).
export default function UploadStatementButton({
  banks,
  defaultMonth,
  defaultOpen = false,
}: {
  banks: Array<{ id: string; label: string }>
  defaultMonth: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const titleId = useId()
  const close = () => setOpen(false)

  return (
    <>
      <button type="button" className="btn-pri-sheet" onClick={() => setOpen(true)}>
        Upload statement
      </button>
      {open ? (
        <div className="adm-modal" {...backdropDismiss(close)}>
          <div className="adm-modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="adm-modal-head">
              <h2 id={titleId}>Upload statement</h2>
              <button type="button" onClick={close} aria-label="Close" className="adm-modal-x">
                ×
              </button>
            </div>
            <p className="adm-modal-lede">
              Excel / CSV from online banking. Auto-match pairs by amount, then payee, then date — anything left waits on the
              review page.
            </p>
            <UploadStatementForm banks={banks} defaultMonth={defaultMonth} onCancel={close} />
          </div>
        </div>
      ) : null}
    </>
  )
}
