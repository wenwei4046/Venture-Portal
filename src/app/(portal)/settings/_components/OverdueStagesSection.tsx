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
    <section className="bg-white rounded-md border border-slate-200 p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Overdue Stages</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Days-overdue thresholds and penalty rates. Escalation stage has no upper bound.
        </p>
      </header>

      <form action={handleSubmit} className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="text-left py-2 pr-3 font-medium">Stage</th>
                <th className="text-left py-2 pr-3 font-medium">Days From</th>
                <th className="text-left py-2 pr-3 font-medium">Days To</th>
                <th className="text-left py-2 font-medium">Penalty Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((stage) => (
                <tr key={stage.stage} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-3 font-medium text-slate-900">
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
                      className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                      className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                        className="w-full px-2 py-1.5 pr-7 border border-slate-300 rounded text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        %
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Saving...' : 'Save Overdue Stages'}
          </button>
          {message ? (
            <span
              className={`text-sm ${
                message.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}
              role="status"
            >
              {message.type === 'success' ? '✓' : '✗'} {message.text}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  )
}
