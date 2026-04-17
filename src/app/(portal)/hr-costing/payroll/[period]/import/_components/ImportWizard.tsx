'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { parseInfotechPayroll, type InfotechRow } from '@/lib/import/infotech-payroll'
import { previewInfotechImport, applyInfotechImport, type PreviewResult } from '../actions'

interface Props {
  period: string
}

export default function ImportWizard({ period }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<InfotechRow[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [grossSum, setGrossSum] = useState(0)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<{ updated: number; skipped: number; noChange: number } | null>(null)

  async function handleFile(file: File) {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseInfotechPayroll(buf)
      if (parsed.rows.length === 0) {
        setError('No employee rows detected. Is this an InfoTech "PayRoll Summary Detailed Report (By Department)" export?')
        return
      }
      setFileName(file.name)
      setRows(parsed.rows)
      setDepartments(parsed.departments)
      setGrossSum(parsed.grossSum)

      // Run preview straight away
      startTransition(async () => {
        try {
          const p = await previewInfotechImport(parsed.rows, period)
          setPreview(p)
          setStage('preview')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Preview failed')
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file')
    }
  }

  function runApply() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await applyInfotechImport(rows, period)
        setApplyResult(r)
        setStage('done')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Apply failed')
      }
    })
  }

  function reset() {
    setStage('upload')
    setFileName(null)
    setRows([])
    setDepartments([])
    setGrossSum(0)
    setPreview(null)
    setApplyResult(null)
    setError(null)
  }

  // ───────── Stage: Upload ─────────
  if (stage === 'upload') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
        <h2 className="font-serif text-xl text-ink mb-2">Upload InfoTech export</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Drop the xlsx file from InfoTech &mdash; <em>PayRoll Summary Detailed Report (By Department)</em>.
          Columns are read by position, no mapping needed.
        </p>
        <label className="block cursor-pointer border-2 border-dashed border-hairline hover:border-accent rounded-md p-10 text-center transition-colors">
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="hidden"
            disabled={isPending}
          />
          <span className="font-serif italic text-graphite block">
            {isPending ? 'Parsing...' : 'Click to choose an xlsx file'}
          </span>
          <span className="font-sans text-xs text-muted mt-2 block">InfoTech format only</span>
        </label>
        <div className="mt-5 text-xs font-sans text-muted space-y-1">
          <p className="font-serif italic text-graphite">Three fields are imported per row:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><span className="font-mono">Tot. Sal</span> → Basic Salary</li>
            <li><span className="font-mono">OT Amt</span> → OT Amount</li>
            <li><span className="font-mono">Allowance Add</span> → Non-Statutory Allowance</li>
          </ul>
          <p className="mt-2 text-muted italic">
            Statutory + PCB + Net are recomputed by the system, not taken from the file.
          </p>
        </div>
        {error && <p className="mt-4 text-sm font-serif italic text-danger">{error}</p>}
      </div>
    )
  }

  // ───────── Stage: Preview ─────────
  if (stage === 'preview' && preview) {
    return (
      <div className="max-w-4xl">
        <div className="bg-surface border border-hairline rounded-md p-6 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <h2 className="font-serif text-xl text-ink">Preview</h2>
              <p className="font-serif italic text-graphite text-xs mt-1">
                <span className="font-mono">{fileName}</span>
                {departments.length > 0 && ` · ${departments.length} department${departments.length === 1 ? '' : 's'}`}
                {' · '}gross total <span className="font-mono tabular">{formatMoney(grossSum)}</span>
              </p>
            </div>
            <button
              onClick={reset}
              className="text-xs font-sans text-muted hover:text-ink"
              disabled={isPending}
            >
              ← upload different file
            </button>
          </div>
          <div className="flex gap-8 mt-4">
            <Stat label="To update" value={preview.toUpdate.length} />
            <Stat label="Unchanged" value={preview.noChangeCount} muted />
            <Stat label="Skipped" value={preview.skipped.length} danger={preview.skipped.length > 0} />
          </div>
        </div>

        {preview.toUpdate.length > 0 && (
          <div className="mb-6">
            <h3 className="font-serif text-lg text-ink mb-3">Updates</h3>
            <div className="space-y-2">
              {preview.toUpdate.map(u => (
                <div key={u.rowIndex} className="border border-hairline rounded-md p-4 bg-surface">
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-serif text-md text-ink">{u.staffName}</div>
                    <div className="font-sans text-xs text-muted italic">
                      matched by {u.matchedBy === 'employee_code' ? 'code' : 'name'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    {u.changes.map(c => (
                      <div key={c.field} className="font-sans text-graphite">
                        <span className="text-muted text-xs uppercase">
                          {c.field.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono tabular ml-2">
                          {formatMoney(c.from)} → <span className="text-ink font-medium">{formatMoney(c.to)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.skipped.length > 0 && (
          <details className="mb-6">
            <summary className="cursor-pointer font-serif text-lg text-danger">
              Skipped <span className="text-muted font-sans text-sm ml-2">({preview.skipped.length})</span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.skipped.map(s => (
                <div key={s.rowIndex} className="text-sm font-sans text-graphite">
                  <span className="font-mono">{s.code || '—'}</span> · {s.name} ·{' '}
                  <span className="italic text-danger">{s.reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-hairline">
          <button
            onClick={runApply}
            disabled={isPending || preview.toUpdate.length === 0}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Applying...' : `Apply ${preview.toUpdate.length} updates`}
          </button>
          {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
        </div>
      </div>
    )
  }

  // ───────── Stage: Done ─────────
  return (
    <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
      <h2 className="font-serif text-xl text-ink mb-2">✓ Import complete</h2>
      <p className="font-serif italic text-graphite mb-6">
        {applyResult?.updated ?? 0} updated
        {(applyResult?.noChange ?? 0) > 0 && ` · ${applyResult?.noChange ?? 0} unchanged`}
        {(applyResult?.skipped ?? 0) > 0 && ` · ${applyResult?.skipped ?? 0} skipped`}.
      </p>
      <div className="flex gap-3">
        <a
          href={`/hr-costing/payroll/${period}`}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
        >
          See updated grid →
        </a>
        <button onClick={reset} className="text-sm font-sans text-muted hover:text-ink">
          Import another file
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, muted, danger }: { label: string; value: number; muted?: boolean; danger?: boolean }) {
  const color = danger ? 'text-danger' : muted ? 'text-graphite' : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">{label}</div>
      <div className={`font-mono tabular text-2xl mt-1 ${color}`}>{value}</div>
    </div>
  )
}
