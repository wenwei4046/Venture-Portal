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
  const [sheetInfo, setSheetInfo] = useState<{
    name?: string
    label?: string
    mismatch: boolean
  } | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<{ updated: number; created: number; skipped: number; failed: number } | null>(null)

  async function handleFile(file: File) {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseInfotechPayroll(buf, period)
      if (parsed.rows.length === 0) {
        setError('No employee rows detected. Is this an InfoTech "PayRoll Summary Detailed Report (By Department)" export?')
        return
      }
      setFileName(file.name)
      setRows(parsed.rows)
      setDepartments(parsed.departments)
      setGrossSum(parsed.grossSum)
      setSheetInfo({
        name: parsed.sheetName,
        label: parsed.sheetPeriodLabel,
        mismatch: parsed.periodMismatch ?? false,
      })

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
    setSheetInfo(null)
  }

  // ───────── Stage: Upload ─────────
  if (stage === 'upload') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
        <h2 className="font-serif text-xl text-ink mb-2">Upload InfoTech export</h2>
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
          <p className="font-serif italic text-graphite">Everything is imported verbatim — the file is the source of truth:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><span className="font-mono">Tot. Sal</span> → Basic · <span className="font-mono">OT/Shift/Rest-PH</span> → OT Amount · <span className="font-mono">Allowance Add</span> → Allowance · <span className="font-mono">Bonus</span> → Commission</li>
            <li><span className="font-mono">EPF / SOCSO / EIS</span> (ER + EE) · <span className="font-mono">PCB</span> · <span className="font-mono">Gross</span> · <span className="font-mono">NettWgs</span> → written exactly as exported, no recompute</li>
            <li>Missing payroll rows are created automatically — no need to generate the period first</li>
          </ul>
          <p className="mt-2 text-muted italic">
            Editing an input field on the grid afterwards re-triggers the system recompute for that row.
            Directors are skipped — Director Salary handles them.
          </p>
        </div>
        {error && <p className="mt-4 text-sm font-serif italic text-danger">{error}</p>}
      </div>
    )
  }

  // ───────── Stage: Preview ─────────
  if (stage === 'preview' && preview) {
    const totalWrites = preview.toUpdate.length + preview.toCreate.length
    return (
      <div className="max-w-4xl">
        <div className="bg-surface border border-hairline rounded-md p-6 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <h2 className="font-serif text-xl text-ink">Preview</h2>
              <p className="font-serif italic text-graphite text-xs mt-1">
                <span className="font-mono">{fileName}</span>
                {sheetInfo?.name && (
                  <>
                    {' · '}sheet <span className="font-mono">{sheetInfo.name}</span>
                    {sheetInfo.label ? ` (${sheetInfo.label})` : ''}
                  </>
                )}
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
          {sheetInfo?.mismatch && (
            <div className="mt-3 rounded-md border border-alert bg-alert-bg px-3 py-2">
              <p className="font-serif italic text-alert text-sm">
                ⚠ No tab in this file matches the period you’re importing into. Parsed
                {' '}<span className="font-mono not-italic">{sheetInfo.name}</span>
                {sheetInfo.label ? ` (${sheetInfo.label})` : ''} instead — check you picked
                the right file/month before applying.
              </p>
            </div>
          )}
          <div className="flex gap-8 mt-4">
            <Stat label="New rows" value={preview.toCreate.length} />
            <Stat label="Overwritten" value={preview.toUpdate.length} />
            <Stat label="Skipped" value={preview.skipped.length} danger={preview.skipped.length > 0} />
          </div>
        </div>

        {(preview.toCreate.length > 0 || preview.toUpdate.length > 0) && (
          <div className="mb-6">
            <h3 className="font-serif text-lg text-ink mb-3">Figures from the file</h3>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Matched by</th>
                  <th className="num">Gross</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...preview.toCreate.map(r => ({ ...r, action: 'create' as const })),
                  ...preview.toUpdate.map(r => ({ ...r, action: 'overwrite' as const }))].map(u => (
                  <tr key={`${u.action}-${u.rowIndex}`}>
                    <td>{u.staffName}</td>
                    <td>
                      <span className={`font-serif italic text-xs ${u.action === 'create' ? 'text-ledger' : 'text-alert'}`}>
                        {u.action}
                      </span>
                    </td>
                    <td className="font-sans text-xs text-muted">
                      {u.matchedBy === 'employee_code' ? 'code' : 'name'}
                    </td>
                    <td className="num">{formatMoney(u.gross)}</td>
                    <td className="num">{formatMoney(u.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            disabled={isPending || totalWrites === 0}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Applying...' : `Import ${totalWrites} row${totalWrites === 1 ? '' : 's'} from file`}
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
        {(applyResult?.created ?? 0) > 0 && `${applyResult?.created ?? 0} created · `}
        {applyResult?.updated ?? 0} overwritten
        {(applyResult?.skipped ?? 0) > 0 && ` · ${applyResult?.skipped ?? 0} skipped`}
        {(applyResult?.failed ?? 0) > 0 && ` · ${applyResult?.failed ?? 0} failed`}.
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
