'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { parseInfotechPayroll, type InfotechRow } from '@/lib/import/infotech-payroll'
import {
  previewDirectorPayrollImport,
  applyDirectorPayrollImport,
  type DirectorPayrollPreview,
} from '../../payroll-actions'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'

interface Props {
  period: string
}

// One wizard instance per month — see CTCInputGrid for the why. The rows and
// preview held in state were parsed and previewed FOR a period; if the picker
// moves the month while a preview is up, Apply would write those rows under
// the new period. Keying on the period drops the stale preview instead.
export default function DirectorImportWizard(props: Props) {
  return <DirectorImportWizardBody key={props.period} {...props} />
}

function DirectorImportWizardBody({ period }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<InfotechRow[]>([])
  const [grossSum, setGrossSum] = useState(0)
  const [sheetInfo, setSheetInfo] = useState<{
    name?: string
    label?: string
    mismatch: boolean
  } | null>(null)
  const [preview, setPreview] = useState<DirectorPayrollPreview | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<{
    created: number
    updated: number
    skipped: number
    failed: number
  } | null>(null)

  async function handleFile(file: File) {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseInfotechPayroll(buf, period)
      if (parsed.rows.length === 0) {
        setError(
          'No employee rows detected. Is this an InfoTech "PayRoll Summary Detailed Report (By Department)" export?',
        )
        return
      }
      setFileName(file.name)
      setRows(parsed.rows)
      setGrossSum(parsed.grossSum)
      setSheetInfo({
        name: parsed.sheetName,
        label: parsed.sheetPeriodLabel,
        mismatch: parsed.periodMismatch ?? false,
      })

      startTransition(async () => {
        try {
          const p = await previewDirectorPayrollImport(parsed.rows, period)
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
        const r = await applyDirectorPayrollImport(rows, period)
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
        <h2 className="sheet-heading mb-3">Upload InfoTech export</h2>
        <label className="block cursor-pointer border-2 border-dashed border-hairline hover:border-accent rounded-card bg-surface-2 p-10 text-center transition-colors">
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
          <span className="text-xs mt-2 block">
            Director-only InfoTech PayrollSummary
          </span>
        </label>
        <div className="mt-5 text-xs space-y-1">
          <p className="font-medium">
            Everything is imported verbatim — the file is the source of truth:
          </p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>
              Rows are matched to directors by name; unmatched rows still import and are
              flagged
            </li>
            <li>
              <span className="font-mono">EPF / SOCSO / EIS</span> (ER + EE) ·{' '}
              <span className="font-mono">PCB</span> · <span className="font-mono">Gross</span> ·{' '}
              <span className="font-mono">NettWgs</span> → written exactly as exported, no
              recompute
            </li>
            <li>Re-importing the same month overwrites by person — safe to repeat</li>
          </ul>
        </div>
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      </div>
    )
  }

  // ───────── Stage: Preview ─────────
  if (stage === 'preview' && preview) {
    const totalWrites = preview.toCreate.length + preview.toUpdate.length
    const unmatched = [...preview.toCreate, ...preview.toUpdate].filter(
      r => !r.directorCode,
    ).length
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
            className="shrink-0 bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
            disabled={isPending}
          >
            ← upload different file
          </button>
        </div>
        {sheetInfo?.mismatch && (
          <div className="sheet-warning">
            ⚠ No tab in this file matches {dayjs(period).format('MMMM YYYY')}. Parsed{' '}
            <span className="font-mono">{sheetInfo.name}</span>
            {sheetInfo.label ? ` (${sheetInfo.label})` : ''} instead — check you picked the
            right file/month before applying.
          </div>
        )}
        {unmatched > 0 && (
          <div className="sheet-warning">
            ⚠ {unmatched} row{unmatched === 1 ? '' : 's'} did not match any director by
            name — they will import unlinked.
          </div>
        )}

        {/* The file's gross total is what the import brings in — the row's
            walnut card; the counts say what it will do to the month. */}
        <StatCards label="What this file will import">
          <StatCard label="Gross total" value={formatMoney(grossSum)} icon="coin" tone="primary" note="From the file" />
          <StatCard label="New rows" value={String(preview.toCreate.length)} icon="upload" />
          <StatCard label="Overwritten" value={String(preview.toUpdate.length)} icon="swap" />
          <StatCard
            label="Skipped"
            value={String(preview.skipped.length)}
            icon="alert"
            tone={preview.skipped.length > 0 ? 'danger' : undefined}
          />
        </StatCards>

        {totalWrites > 0 && (
          <section className="mb-6">
            <div className="sect-head">
              <h2>Figures from the file</h2>
              <span className="rule" aria-hidden />
              <span className="count">{totalWrites} ROW{totalWrites === 1 ? '' : 'S'}</span>
            </div>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="m-hide">Director</th>
                  <th className="m-hide">Action</th>
                  <th className="right m-hide">Gross</th>
                  <th className="right">Net</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {[
                  ...preview.toCreate.map(r => ({ ...r, action: 'create' as const })),
                  ...preview.toUpdate.map(r => ({ ...r, action: 'overwrite' as const })),
                ].map(u => (
                  <LedgerRow key={`${u.action}-${u.rowIndex}`}>
                    <td className="font-medium">{u.name}</td>
                    <td className="m-hide" data-label="Director">
                      {u.directorCode ? (
                        <span className="font-mono">{u.directorCode}</span>
                      ) : (
                        <span className="chip alert"><span className="dot" />unmatched</span>
                      )}
                    </td>
                    <td className="m-hide" data-label="Action">
                      <span className={`chip ${u.action === 'create' ? 'ledger' : 'alert'}`}>
                        <span className="dot" />
                        {u.action}
                      </span>
                    </td>
                    <td className="num m-hide" data-label="Gross">{formatMoney(u.gross)}</td>
                    <td className="num">{formatMoney(u.net)}</td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {preview.skipped.length > 0 && (
          <details className="mb-6">
            <summary className="cursor-pointer text-md font-semibold">
              Skipped{' '}
              <span className="chip danger ml-1">
                <span className="dot" />
                {preview.skipped.length}
              </span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.skipped.map(s => (
                <div key={s.rowIndex} className="text-sm">
                  <span className="font-mono">{s.code || '—'}</span> · {s.name || '—'} ·{' '}
                  <span className="text-danger">{s.reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-hairline">
          <button
            onClick={runApply}
            disabled={isPending || totalWrites === 0}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending
              ? 'Applying...'
              : `Import ${totalWrites} row${totalWrites === 1 ? '' : 's'} from file`}
          </button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>
    )
  }

  // ───────── Stage: Done ─────────
  return (
    <div className="bg-surface border border-hairline rounded-card p-8 max-w-2xl">
      <h2 className="sheet-heading mb-2">✓ Import complete</h2>
      <p className="text-sm mb-6">
        {(applyResult?.created ?? 0) > 0 && `${applyResult?.created ?? 0} created · `}
        {applyResult?.updated ?? 0} overwritten
        {(applyResult?.skipped ?? 0) > 0 && ` · ${applyResult?.skipped ?? 0} skipped`}
        {(applyResult?.failed ?? 0) > 0 && ` · ${applyResult?.failed ?? 0} failed`}.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href={`/director-salary?period=${dayjs(period).format('YYYY-MM')}`}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
        >
          See Director Payroll table →
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
