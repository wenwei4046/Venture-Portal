'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RevertTermsDialog } from './DealDialogs'

// The undo of the latest 从某月起 change (Principal). The RPC puts the
// previous segment back as the current terms and drops its history row.
// Asked in the kit's window since 2026-10-15 (the Finance phone app asks the
// same one); it was an inline two-step, in Chinese.
export default function RevertTermsButton({
  kind,
  recordId,
  latestFrom,
}: {
  kind: 'loan' | 'fund_source'
  recordId: string
  latestFrom: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-graphite hover:text-danger font-serif italic transition-colors">
        Revert the latest change (from {latestFrom})
      </button>
      <RevertTermsDialog open={open} onClose={() => setOpen(false)} onDone={() => router.refresh()} kind={kind} recordId={recordId} latestFrom={latestFrom} />
    </>
  )
}
