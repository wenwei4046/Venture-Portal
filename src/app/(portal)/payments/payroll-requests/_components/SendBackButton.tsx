'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendBackPayrollRun } from '../actions'

// 打回 HR 重做 (2026-09-15): Finance-side reopen of a submitted staff payroll
// run. Two-click confirm; the RPC does the real guarding (no funding PV yet,
// period open) and the accrual reversal.
export default function SendBackButton({ period, periodLabel }: { period: string; periodLabel: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(t)
  }, [armed])

  function handle() {
    if (!armed) {
      setArmed(true)
      setError(null)
      return
    }
    setArmed(false)
    startTransition(async () => {
      try {
        await sendBackPayrollRun(period)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : '打回失败')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        title="把这期 payroll 打回给 HR 改：request 作废、已开的薪水账自动冲掉，HR 改好重新 submit"
        className={`text-xs font-serif italic rounded px-2 py-1 transition-colors disabled:opacity-50 ${
          armed ? 'bg-danger text-white' : 'text-muted hover:text-danger'
        }`}
      >
        {isPending ? '打回中…' : armed ? `确定打回 ${periodLabel}？` : '打回 HR 重做'}
      </button>
      {error ? <span className="text-xs font-serif italic text-danger max-w-xs text-right">{error}</span> : null}
    </div>
  )
}
