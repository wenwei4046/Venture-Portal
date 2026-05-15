'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'

interface Props {
  accounts: AccountOption[]
  selectedCode: string
  from: string
  to: string
}

export default function LedgerPicker({ accounts, selectedCode, from, to }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(selectedCode)
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)

  function submit() {
    if (!code) return
    const qs = new URLSearchParams({ code, from: fromValue, to: toValue })
    router.push(`/reports/ledger?${qs.toString()}`)
  }

  return (
    <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
      <div className="min-w-[260px]">
        <AccountPicker
          accounts={accounts}
          value={code}
          onChange={setCode}
          name="code"
          placeholder="Select account…"
        />
      </div>
      <input
        type="date"
        value={fromValue}
        onChange={(e) => setFromValue(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <input
        type="date"
        value={toValue}
        onChange={(e) => setToValue(e.target.value)}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!code}
        className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-serif italic text-sm rounded-md transition-colors"
      >
        Apply
      </button>
    </div>
  )
}
