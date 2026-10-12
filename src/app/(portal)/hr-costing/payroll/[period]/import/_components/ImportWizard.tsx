'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { parseInfotechPayroll, type InfotechRow } from '@/lib/import/infotech-payroll'
import { previewInfotechImport, applyInfotechImport, type PreviewResult } from '../actions'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

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
      <div className="bg-surface border border-hairline rounded-card p-8 max-w-2xl">
        {/* `.sheet-heading` owns its margin, so the air sits on its neighbours. */}
        <h2 className="sheet-heading">Upload InfoTech export</h2>
        <label className="block mt-3 cursor-pointer border-2 border-dashed border-hairline hover:border-accent hover:bg-accent-bg rounded-lg p-10 text-center transition-colors">
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
          <span className="text-sm font-medium block">
            {isPending ? 'Parsing...' : 'Click to choose an xlsx file'}
          </span>
          <span className="text-xs mt-2 block">InfoTech format only</span>
        </label>
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      </div>
    )
  }

  // ───────── Stage: Preview ─────────
  if (stage === 'preview' && preview) {
    const totalWrites = preview.toUpdate.length + preview.toCreate.length
    return (
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="sheet-heading">Preview</h2>
            <p className="sheet-subtitle">
              <span className="font-mono">{fileName}</span>
              {sheetInfo?.name && (
                <>
                  {' · '}sheet <span className="font-mono">{sheetInfo.name}</span>
                  {sheetInfo.label ? ` (${sheetInfo.label})` : ''}
                </>
              )}
            </p>
          </div>
          <button
            onClick={reset}
            className="text-xs hover:underline underline-offset-2"
            disabled={isPending}
          >
            ← upload different file
          </button>
        </div>
        {sheetInfo?.mismatch && (
          <div className="sheet-warning">
            <p>
              ⚠ No tab in this file matches the period you’re importing into. Parsed
              {' '}<span className="font-mono">{sheetInfo.name}</span>
              {sheetInfo.label ? ` (${sheetInfo.label})` : ''} instead — check you picked
              the right file/month before applying.
            </p>
          </div>
        )}
        {/* The file's own total leads — it is what gets checked against
            InfoTech's report; the three counts say what the import will do. */}
        <StatCards label="What the file will do">
          <StatCard
            label="Gross total"
            value={formatMoney(grossSum)}
            icon="coin"
            tone="primary"
            note={departments.length > 0 ? `${departments.length} department${departments.length === 1 ? '' : 's'}` : undefined}
          />
          <StatCard label="New rows" value={String(preview.toCreate.length)} icon="upload" />
          <StatCard label="Overwritten" value={String(preview.toUpdate.length)} icon="swap" />
          <StatCard
            label="Skipped"
            value={String(preview.skipped.length)}
            icon="alert"
            tone={preview.skipped.length > 0 ? 'danger' : undefined}
          />
        </StatCards>

        {(preview.toCreate.length > 0 || preview.toUpdate.length > 0) && (
          <section className="mb-6">
            <div className="sect-head">
              <h2>Figures from the file</h2>
              <span className="rule" aria-hidden />
              <span className="count">{totalWrites} ROW{totalWrites === 1 ? '' : 'S'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th className="m-hide">Action</th>
                    <th className="m-hide">Matched by</th>
                    <th className="right m-hide">Gross</th>
                    <th className="right">Net</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {[...preview.toCreate.map(r => ({ ...r, action: 'create' as const })),
                    ...preview.toUpdate.map(r => ({ ...r, action: 'overwrite' as const }))].map(u => (
                    <LedgerRow key={`${u.action}-${u.rowIndex}`}>
                      <td className="font-medium">{u.staffName}</td>
                      <td className="m-hide" data-label="Action">
                        <span className={`chip ${u.action === 'create' ? 'ledger' : 'alert'}`}>
                          <span className="dot" />
                          {u.action}
                        </span>
                      </td>
                      <td className="m-hide" data-label="Matched by">
                        {u.matchedBy === 'infotech_code' ? 'InfoTech No' : 'name'}
                      </td>
                      <td className="num m-hide" data-label="Gross">{formatMoney(u.gross)}</td>
                      <td className="num">{formatMoney(u.net)}</td>
                    </LedgerRow>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {preview.skipped.length > 0 && (
          <details className="sheet-warning">
            <summary className="cursor-pointer text-sm font-bold">
              Skipped <span className="sheet-count ml-2">{preview.skipped.length}</span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.skipped.map(s => (
                <div key={s.rowIndex} className="text-sm">
                  <span className="font-mono">{s.code || '—'}</span> · {s.name} ·{' '}
                  <span className="text-danger">{s.reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-hairline">
          <button
            onClick={runApply}
            disabled={isPending || totalWrites === 0}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending ? 'Applying...' : `Import ${totalWrites} row${totalWrites === 1 ? '' : 's'} from file`}
          </button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>
    )
  }

  // ───────── Stage: Done ─────────
  return (
    <div className="bg-surface border border-hairline rounded-card p-8 max-w-2xl">
      <h2 className="sheet-heading">✓ Import complete</h2>
      <p className="text-sm mt-2 mb-6">
        {(applyResult?.created ?? 0) > 0 && `${applyResult?.created ?? 0} created · `}
        {applyResult?.updated ?? 0} overwritten
        {(applyResult?.skipped ?? 0) > 0 && ` · ${applyResult?.skipped ?? 0} skipped`}
        {(applyResult?.failed ?? 0) > 0 && ` · ${applyResult?.failed ?? 0} failed`}.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href={`/hr-costing/payroll/${period}`}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
        >
          See updated grid →
        </a>
        <button
          onClick={reset}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}
