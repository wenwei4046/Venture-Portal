'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { revertTermsChange } from '@/app/(portal)/fund-in/actions'

// Two-click undo of the latest 从某月起 change (Principal). The RPC puts the
// previous segment back as the current terms and drops its history row.
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
  const [armed, setArmed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="text-xs text-graphite hover:text-danger font-serif italic transition-colors"
        >
          撤销最近一次变更（{latestFrom} 起的那次）
        </button>
      ) : (
        <>
          <span className="font-serif italic text-xs text-graphite">确定撤销 {latestFrom} 起的变更？之前的条件会变回现行。</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const r = await revertTermsChange(kind, recordId)
                if (r?.error) setError(r.error)
                else {
                  setArmed(false)
                  router.refresh()
                }
              })
            }
            className="bg-danger hover:opacity-90 text-white font-serif italic text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? '撤销中…' : '确定撤销'}
          </button>
          <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted hover:text-ink font-sans">
            取消
          </button>
        </>
      )}
      {error ? <span className="text-xs text-danger font-sans">{error}</span> : null}
    </div>
  )
}
