'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'

interface Props {
  accounts: AccountOption[]
  selectedCodes: string[]
  from: string
  to: string
  showZero: boolean
}

/**
 * The Ledger's "Select accounts…" (2026-10-09, the user's Claude Design
 * handoff): a button in the head that opens the choice — accounts added one
 * at a time (none = every postable leaf account), the period, and whether to
 * list the accounts with no activity — applied together.
 */
export default function LedgerPicker({ accounts, selectedCodes, from, to, showZero }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [codes, setCodes] = useState<string[]>(selectedCodes)
  const [pickerValue, setPickerValue] = useState('')
  const [fromValue, setFromValue] = useState(from)
  const [toValue, setToValue] = useState(to)
  const [showZeroValue, setShowZeroValue] = useState(showZero)
  const box = useRef<HTMLDivElement>(null)

  // Escape or a click outside closes it, as the page's other menus do.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

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
    setOpen(false)
    router.push(`/reports/ledger?${qs.toString()}`)
  }

  const accountByCode = new Map(accounts.map((a) => [a.code, a]))
  const label =
    selectedCodes.length === 0 ? 'Select accounts…' : `${selectedCodes.length} ${selectedCodes.length === 1 ? 'account' : 'accounts'} picked`

  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn-quiet-sheet" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? (
        <div className="gl-picker" role="dialog" aria-label="Select accounts">
          <div className="fin-field">
            <span>Accounts</span>
            <AccountPicker
              accounts={accounts}
              value={pickerValue}
              onChange={addCode}
              name="picker"
              placeholder={codes.length === 0 ? 'Add an account… (none = all)' : 'Add another account…'}
            />
          </div>
          {codes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {codes.map((c) => {
                const a = accountByCode.get(c)
                return (
                  <span key={c} className="chip">
                    {a ? `${a.code} · ${a.name}` : c}
                    <button type="button" onClick={() => removeCode(c)} aria-label={`Remove ${c}`} className="ml-1 leading-none text-graphite hover:text-danger">
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="fin-hint">No account picked: every postable account.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="fin-field">
              <span>From</span>
              <input type="date" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
            </label>
            <label className="fin-field">
              <span>To</span>
              <input type="date" value={toValue} onChange={(e) => setToValue(e.target.value)} />
            </label>
          </div>
          <label className="fin-toggle">
            <input type="checkbox" checked={showZeroValue} onChange={(e) => setShowZeroValue(e.target.checked)} />
            <span>List the accounts with no activity</span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {codes.length > 0 ? (
              <button type="button" className="btn-quiet-sheet mr-auto" onClick={() => setCodes([])}>
                Clear accounts
              </button>
            ) : null}
            <button type="button" className="btn-quiet-sheet" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-pri-sheet" onClick={submit}>
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
