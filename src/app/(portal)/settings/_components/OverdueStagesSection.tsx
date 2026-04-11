'use client'

import { useState, useTransition } from 'react'
import { updateOverdueStages } from '../actions'
import type { OverdueConfig, OverdueConfigStage } from '@/types'

interface Props {
  stages: OverdueConfig[]
}

const STAGE_LABELS: Record<OverdueConfigStage, string> = {
  grace: 'Grace',
  late_1: 'Late 1',
  late_2: 'Late 2',
  escalation: 'Escalation',
}

const STAGE_ORDER: OverdueConfigStage[] = ['grace', 'late_1', 'late_2', 'escalation']

export default function OverdueStagesSection({ stages }: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateOverdueStages(formData)
        setMessage({ type: 'success', text: 'Overdue stages saved.' })
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })
  }

  const sorted = STAGE_ORDER.map((s) => stages.find((x) => x.stage === s)).filter(
    (x): x is OverdueConfig => x !== undefined
  )

  return (
    <section className="bg-surface border border-hairline rounded-md p-6">
      <header className="mb-5">
        <h2 className="font-serif text-xl text-ink">Overdue Stages</h2>
        <p className="font-serif italic text-graphite text-sm mt-0.5">
          Days-overdue thresholds and penalty rates. Escalation stage has no upper bound.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-3 font-medium">Stage</th>
                <th className="text-left py-3 pr-3 font-medium">Days From</th>
                <th className="text-left py-3 pr-3 font-medium">Days To</th>
                <th className="text-left py-3 font-medium">Penalty Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((stage) => (
                <tr key={stage.stage} className="border-b border-hairline last:border-0">
                  <td className="py-3 pr-3 font-serif text-md text-ink">
                    {STAGE_LABELS[stage.stage]}
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      name={`${stage.stage}_days_from`}
                      type="number"
                      step="1"
                      min="0"
                      defaultValue={stage.days_from}
                      required
                      className="w-24 px-2 py-1.5 bg-paper border border-hairline rounded text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      name={`${stage.stage}_days_to`}
                      type="number"
                      step="1"
                      min="0"
                      defaultValue={stage.days_to ?? ''}
                      placeholder={stage.stage === 'escalation' ? 'no limit' : ''}
                      className="w-24 px-2 py-1.5 bg-paper border border-hairline rounded text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border placeholder:text-muted placeholder:italic"
                    />
                  </td>
                  <td className="py-3">
                    <div className="relative w-32">
                      <input
                        name={`${stage.stage}_penalty`}
                        type="number"
                        step="0.001"
                        min="0"
                        max="99.999"
                        defaultValue={(stage.penalty_rate * 100).toFixed(3)}
                        required
                        className="w-full px-2 py-1.5 pr-7 bg-paper border border-hairline rounded text-sm font-mono tabular font-medium text-ink focus:outline-none focus:border-accent-border"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted">
                        %
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : 'Save Overdue Stages'}
          </button>
          {message ? (
            <span
              className={
                message.type === 'success'
                  ? 'text-sm font-serif italic text-ledger'
                  : 'text-sm font-serif italic text-danger'
              }
              role="status"
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  )
}
