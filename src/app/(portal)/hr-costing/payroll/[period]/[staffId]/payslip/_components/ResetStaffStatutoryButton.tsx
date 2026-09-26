'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetStaffStatutoryToLookup } from '../../../../actions'

interface Props {
  payrollId: string
  overridden: boolean
  overriddenLabel?: string
}

export default function ResetStaffStatutoryButton({ payrollId, overridden, overriddenLabel }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!overridden) return null

  return (
    <div className="flex items-center justify-between gap-2 text-xs mt-2">
      <span className="chip alert">
        <span className="dot" />
        Manually overridden{overriddenLabel ? ` · ${overriddenLabel}` : ''}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            try {
              await resetStaffStatutoryToLookup(payrollId)
              router.refresh()
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Reset failed')
            }
          })
        }
        className="font-medium underline underline-offset-2 hover:no-underline disabled:opacity-50"
      >
        {isPending ? 'Resetting…' : 'Reset to JADUAL'}
      </button>
    </div>
  )
}
