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
    <div className="flex items-baseline justify-between text-xs mt-2">
      <span className="font-serif italic text-alert">
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
        className="text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        {isPending ? 'Resetting…' : 'Reset to JADUAL'}
      </button>
    </div>
  )
}
