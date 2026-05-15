'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'

interface Props {
  accounts: AccountOption[]
  selectedCodes: string[]
  from: string
  to: string
  showZero: boolean
}

/**
 * Multi-account ledger picker. Empty list = "all accounts" (server-side fans
 * out to every postable leaf). Uses the existing single-pick AccountPicker as
 * an "add one" widget; selected codes render below as removable chips.
 */
export default function LedgerPicker({ accounts, selectedCodes, from, to, showZero }: Props) {
  const router = useRouter()
  const [codes, setCodes] = useState<string[]>(selectedCodes)
  const [pickerValue, setPickerValue] = useState('')
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)
  const [showZeroValue, setShowZeroValue] = useState(showZero)

  function addCode(code: string) {
    if (!code) return
    setCodes((prev) => (prev.includes(code) ? prev : [...prev, code]))
    setPickerValue('') // Clear the picker input so the user can keep adding.
  }

  function removeCode(code: string) {
    setCodes((prev) => prev.filter((c) => c !== code))
  }

  function submit() {
    const qs = new URLSearchParams()
    if (codes.length > 0) qs.set('codes', codes.join(','))
    qs.set('from', fromValue)
    qs.set('to', toValue)
    if (showZeroValue) qs.set('showZero', '1')
    router.push(`/reports/ledger?${qs.toString()}`)
  }

  const accountByCode = new Map(accounts.map((a) => [a.code, a]))

  return (
    <div className="shrink-0 flex flex-col items-stretch gap-2">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="min-w-[260px]">
          <AccountPicker
            accounts={accounts}
            value={pickerValue}
            onChange={addCode}
            name="picker"
            placeholder={codes.length === 0 ? 'Select accounts… (leave empty for all)' : 'Add another account…'}
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
        <label className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-graphite">
          <input
            type="checkbox"
            checked={showZeroValue}
            onChange={(e) => setShowZeroValue(e.target.checked)}
            className="accent-accent"
          />
          Show zero
        </label>
        <button
          type="button"
          onClick={submit}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-serif italic text-sm rounded-md transition-colors"
        >
          Apply
        </button>
      </div>

      {codes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {codes.map((c) => {
            const a = accountByCode.get(c)
            const label = a ? `${a.code} · ${a.name}` : c
            return (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-surface border border-hairline rounded-md text-xs font-mono text-ink"
              >
                {label}
                <button
                  type="button"
                  onClick={() => removeCode(c)}
                  aria-label={`Remove ${c}`}
                  className="text-muted hover:text-danger leading-none"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
