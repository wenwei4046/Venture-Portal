'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  parseInfotechStaffXlsx,
  type InfotechStaffRow,
} from '@/lib/import/infotech-staff'
import {
  previewInfotechStaffImport,
  applyInfotechStaffImport,
  type StaffPreviewResult,
} from '../actions'

export default function ImportStaffWizard() {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<InfotechStaffRow[]>([])
  const [resignedCount, setResignedCount] = useState(0)
  const [preview, setPreview] = useState<StaffPreviewResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<{
    created: number
    duplicates: number
    directors: number
    deptMissing: number
    failed: Array<{ rowIndex: number; employee_code: string; reason: string }>
  } | null>(null)

  async function handleFile(file: File) {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseInfotechStaffXlsx(buf)
      if (parsed.rows.length === 0) {
        setError(
          'No employee rows detected. Is this the "Active, Newly Joined & Resigned Employees List" export?',
        )
        return
      }
      setFileName(file.name)
      setRows(parsed.rows)
      setResignedCount(parsed.resignedCount)

      startTransition(async () => {
        try {
          const p = await previewInfotechStaffImport(parsed.rows)
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
        const r = await applyInfotechStaffImport(rows)
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
    setResignedCount(0)
    setPreview(null)
    setApplyResult(null)
    setError(null)
  }

  // ─────────── Stage 1 — upload ───────────
  if (stage === 'upload') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
        <h2 className="font-serif text-xl text-ink mb-2">Upload InfoTech export</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Drop the xlsx file from InfoTech &mdash; <em>Active, Newly Joined &amp; Resigned Employees List (By Department)</em>.
          Columns are read by position, no mapping needed.
        </p>
        <label className="block cursor-pointer border-2 border-dashed border-hairline hover:border-accent rounded-md p-10 text-center transition-colors">
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="hidden"
            disabled={isPending}
          />
          <span className="font-serif italic text-graphite block">
            {isPending ? 'Parsing…' : 'Click to choose an xlsx file'}
          </span>
          <span className="font-sans text-xs text-muted mt-2 block">InfoTech format only</span>
        </label>
        <div className="mt-5 text-xs font-sans text-muted space-y-1">
          <p className="font-serif italic text-graphite">Imported per row:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>Employee code, name, department (mapped from InfoTech dept code)</li>
            <li>Basic salary, hire date, NRIC</li>
            <li>Bank account number (bank name must be filled manually later)</li>
          </ul>
          <p className="mt-2 text-muted italic">
            Statutory categories default to Part A / First / KA1 / not exempt — HR adjusts per staff if needed.
          </p>
        </div>
        {error && <p className="mt-4 text-sm font-serif italic text-danger">{error}</p>}
      </div>
    )
  }

  // ─────────── Stage 2 — preview ───────────
  if (stage === 'preview' && preview) {
    const byDept = new Map<string, number>()
    for (const p of preview.toCreate) {
      byDept.set(p.dept_name_portal, (byDept.get(p.dept_name_portal) ?? 0) + 1)
    }

    return (
      <div className="max-w-4xl">
        <div className="bg-surface border border-hairline rounded-md p-6 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <h2 className="font-serif text-xl text-ink">Preview</h2>
              <p className="font-serif italic text-graphite text-xs mt-1">
                <span className="font-mono">{fileName}</span>
                {resignedCount > 0 && ` · ${resignedCount} resigned row(s) skipped`}
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
          <div className="flex gap-8 mt-4 flex-wrap">
            <Stat label="To create" value={preview.toCreate.length} />
            <Stat label="Duplicates" value={preview.duplicates.length} muted />
            <Stat label="Directors skipped" value={preview.directors.length} muted />
            <Stat
              label="Dept unmapped"
              value={preview.deptMissing.length}
              danger={preview.deptMissing.length > 0}
            />
          </div>
          {preview.directors.length > 0 && (
            <p className="font-serif italic text-muted text-xs mt-3">
              Directors are managed in <em>Director Salary</em> — their payroll rows
              are written when you <em>Save and Calculate</em> there, not via this
              import.
            </p>
          )}
        </div>

        {byDept.size > 0 && (
          <div className="mb-6">
            <h3 className="font-serif text-lg text-ink mb-3">By department</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[...byDept.entries()].map(([dept, count]) => (
                <div
                  key={dept}
                  className="border border-hairline rounded-md p-3 bg-surface"
                >
                  <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
                    {dept}
                  </div>
                  <div className="font-mono tabular text-xl text-ink mt-1">{count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview.toCreate.length > 0 && (
          <details className="mb-6" open>
            <summary className="cursor-pointer font-serif text-lg text-ink">
              New staff <span className="text-muted font-sans text-sm ml-2">({preview.toCreate.length})</span>
            </summary>
            <div className="mt-3 border border-hairline rounded-md bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-2 px-4 font-medium">Code</th>
                    <th className="text-left py-2 px-4 font-medium">Name</th>
                    <th className="text-left py-2 px-4 font-medium">Department</th>
                    <th className="text-right py-2 px-4 font-medium">Basic</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toCreate.map(p => (
                    <tr
                      key={p.rowIndex}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="py-2 px-4 font-mono text-ink">{p.employee_code}</td>
                      <td className="py-2 px-4 font-serif text-ink">{p.employee_name}</td>
                      <td className="py-2 px-4 font-serif italic text-graphite">
                        {p.dept_name_portal}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular text-ink">
                        {formatMoney(p.basic_salary)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {preview.duplicates.length > 0 && (
          <details className="mb-6">
            <summary className="cursor-pointer font-serif text-lg text-graphite">
              Duplicates <span className="text-muted font-sans text-sm ml-2">({preview.duplicates.length}) — already in DB, will be skipped</span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.duplicates.map(d => (
                <div key={d.rowIndex} className="text-sm font-sans text-graphite">
                  <span className="font-mono">{d.employee_code}</span> · {d.employee_name}
                </div>
              ))}
            </div>
          </details>
        )}

        {preview.deptMissing.length > 0 && (
          <details className="mb-6" open>
            <summary className="cursor-pointer font-serif text-lg text-danger">
              Unmapped departments <span className="text-muted font-sans text-sm ml-2">({preview.deptMissing.length}) — rows skipped</span>
            </summary>
            <p className="text-xs font-sans text-muted italic mt-2 mb-3">
              Add these departments in the portal first, or extend the dept code map in
              <code className="mx-1 font-mono">src/app/(portal)/hr-costing/staff/import/actions.ts</code>.
            </p>
            <div className="space-y-1">
              {preview.deptMissing.map(d => (
                <div key={d.rowIndex} className="text-sm font-sans text-graphite">
                  <span className="font-mono">{d.employee_code}</span> · {d.employee_name} ·{' '}
                  <span className="italic text-danger">{d.dept_code}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-hairline">
          <button
            onClick={runApply}
            disabled={isPending || preview.toCreate.length === 0}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending
              ? 'Applying…'
              : `Create ${preview.toCreate.length} staff`}
          </button>
          {error && (
            <span className="text-sm font-serif italic text-danger">{error}</span>
          )}
        </div>
      </div>
    )
  }

  // ─────────── Stage 3 — done ───────────
  return (
    <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
      <h2 className="font-serif text-xl text-ink mb-2">✓ Import complete</h2>
      <p className="font-serif italic text-graphite mb-2">
        {applyResult?.created ?? 0} staff created
        {(applyResult?.directors ?? 0) > 0 && ` · ${applyResult?.directors ?? 0} directors skipped (use Director Salary)`}
        {(applyResult?.duplicates ?? 0) > 0 && ` · ${applyResult?.duplicates ?? 0} duplicates skipped`}
        {(applyResult?.deptMissing ?? 0) > 0 && ` · ${applyResult?.deptMissing ?? 0} unmapped departments skipped`}
        {(applyResult?.failed?.length ?? 0) > 0 && ` · ${applyResult?.failed?.length ?? 0} failed`}.
      </p>
      {applyResult && applyResult.failed.length > 0 && (
        <details className="mb-4 text-sm font-sans">
          <summary className="cursor-pointer text-danger font-serif">Failed rows</summary>
          <div className="mt-2 space-y-1">
            {applyResult.failed.map(f => (
              <div key={f.rowIndex} className="text-xs text-graphite">
                <span className="font-mono">{f.employee_code}</span> — {f.reason}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="flex gap-3 mt-6">
        <a
          href="/hr-costing/staff"
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
        >
          Back to Staff →
        </a>
        <button
          onClick={reset}
          className="text-sm font-sans text-muted hover:text-ink"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  muted,
  danger,
}: {
  label: string
  value: number
  muted?: boolean
  danger?: boolean
}) {
  const color = danger ? 'text-danger' : muted ? 'text-graphite' : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className={`font-mono tabular text-2xl mt-1 ${color}`}>{value}</div>
    </div>
  )
}
