'use client'

import { useState, useTransition } from 'react'
import { updateDirectorConfig } from '../actions'
import { setDirectorPin } from '../../director-salary/pin-actions'

interface Director {
  id: string
  code: string
  name: string
  weightage: number
  min_payout: number
}

export default function DirectorSalarySection({ directors }: { directors: Director[] }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [values, setValues] = useState<Record<string, { weightage: number; minPayout: number }>>(
    () => Object.fromEntries(directors.map(d => [d.id, { weightage: d.weightage, minPayout: d.min_payout }]))
  )

  const totalWeightage = Object.values(values).reduce((s, v) => s + v.weightage, 0)
  const weightageValid = Math.abs(totalWeightage - 4.0) < 0.001

  function handleSubmit() {
    setMessage(null)
    if (!weightageValid) {
      setMessage({ type: 'error', text: `Total weightage must be 4.0 (currently ${totalWeightage.toFixed(3)})` })
      return
    }
    startTransition(async () => {
      try {
        const updates = directors.map(d => ({
          id: d.id,
          weightage: values[d.id].weightage,
          min_payout: values[d.id].minPayout,
        }))
        await updateDirectorConfig(updates)
        setMessage({ type: 'success', text: 'Saved.' })
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unknown error' })
      }
    })
  }

  return (
    <section className="bg-surface border border-hairline rounded-md p-6">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Director Salary</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          Weightage per director (must sum to 4.0) and minimum monthly payout.
        </p>
      </header>

      <div className="space-y-4">
        {directors.map(d => (
          <div key={d.id} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                {d.code} <span className="text-xs text-muted font-normal">({d.name})</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                Weightage <span className="text-xs text-muted ml-1 font-normal">(%)</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={values[d.id]?.weightage ?? 0}
                onChange={e => setValues(prev => ({
                  ...prev,
                  [d.id]: { ...prev[d.id], weightage: parseFloat(e.target.value) || 0 },
                }))}
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              />
            </div>
            <div>
              <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                Min Payout <span className="text-xs text-muted ml-1 font-normal">(RM)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={values[d.id]?.minPayout ?? 0}
                onChange={e => setValues(prev => ({
                  ...prev,
                  [d.id]: { ...prev[d.id], minPayout: parseFloat(e.target.value) || 0 },
                }))}
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <p className={`font-mono text-xs ${weightageValid ? 'text-ledger' : 'text-danger'}`}>
          Total: {totalWeightage.toFixed(3)} {weightageValid ? '✓' : '(must be 4.000)'}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={isPending || !weightageValid}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save Directors'}
        </button>
        {message && (
          <span className={`text-sm font-serif italic ${message.type === 'success' ? 'text-ledger' : 'text-danger'}`}>
            {message.text}
          </span>
        )}
      </div>

      {/* Director PIN Management */}
      <DirectorPinManager />
    </section>
  )
}

function DirectorPinManager() {
  const [isPending, startTransition] = useTransition()
  const [pin, setPin] = useState('')
  const [pinMsg, setPinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleSetPin() {
    setPinMsg(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('pin', pin)
      const result = await setDirectorPin(formData)
      if (result.ok) {
        setPinMsg({ type: 'success', text: 'PIN updated.' })
        setPin('')
      } else {
        setPinMsg({ type: 'error', text: result.error ?? 'Failed' })
      }
    })
  }

  return (
    <div className="mt-6 pt-6 border-t border-hairline">
      <h3 className="font-serif text-lg text-ink mb-1">Director Access PIN</h3>
      <p className="font-serif italic text-graphite text-sm mb-4">
        6-digit PIN required for Finance Manager to access Director Salary and Director Pool.
        Only you (Principal) can set or change this PIN.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs font-sans text-muted mb-1">New PIN (6 digits)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="w-32 px-3 py-2 bg-paper border border-hairline rounded-md text-center font-mono text-lg tracking-widest text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <button
          onClick={handleSetPin}
          disabled={isPending || pin.length !== 6}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Setting…' : 'Set PIN'}
        </button>
        {pinMsg && (
          <span className={`text-sm font-serif italic ${pinMsg.type === 'success' ? 'text-ledger' : 'text-danger'}`}>
            {pinMsg.text}
          </span>
        )}
      </div>
    </div>
  )
}
