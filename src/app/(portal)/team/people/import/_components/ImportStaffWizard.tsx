'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import {
  parseInfotechStaffXlsx,
  type InfotechStaffRow,
} from '@/lib/import/infotech-staff'
import {
  previewInfotechStaffImport,
  applyInfotechStaffImport,
  type StaffPreviewResult,
} from '../actions'

// Drawn in the sheet's vocabulary (DESIGN.md › "Sheet theme"), after the two
// InfoTech wizards it sits beside — HR › Payroll's and Director Salary's:
// summary cards for what the file will do, the month's tables for what it
// brings in, amber callouts for rows it leaves behind.
const PRIMARY_BTN =
  'bg-accent hover:bg-accent-hover text-ink text-sm font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50'
const SECONDARY_BTN =
  'bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50'

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
    updated: number
    unchanged: number
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
      <div className="bg-surface border border-hairline rounded-card p-8 max-w-2xl">
        {/* `.sheet-heading` owns its margin, so the air sits on its neighbours. */}
        <h2 className="sheet-heading">Upload InfoTech export</h2>
        <label className="block mt-3 cursor-pointer border-2 border-dashed border-hairline hover:border-accent hover:bg-accent-bg rounded-lg p-10 text-center transition-colors">
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
          <span className="text-sm font-medium block">
            {isPending ? 'Parsing…' : 'Click to choose an xlsx file'}
          </span>
          <span className="text-xs mt-2 block">InfoTech format only</span>
        </label>
        <div className="mt-5 text-xs space-y-1">
          <p className="font-medium">Imported per row:</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li>
              InfoTech No, name, designation, department (mapped from InfoTech dept code) — the
              portal&apos;s own HV code is given on save
            </li>
            <li>Basic salary (contract master), hire date, NRIC</li>
            <li>Bank account number (bank name must be filled manually later)</li>
          </ul>
          <p className="mt-2">
            Rows are matched to people by InfoTech No first, by name second — never by the
            portal&apos;s HV code. Re-importing updates existing staff to match the file — InfoTech
            is the contract master.
            Statutory categories default to Part A / First / KA1 / not exempt — HR adjusts per staff if needed.
          </p>
        </div>
        {error && <p className="sheet-danger mb-0">{error}</p>}
      </div>
    )
  }

  // ─────────── Stage 2 — preview ───────────
  if (stage === 'preview' && preview) {
    const byDept = new Map<string, number>()
    for (const p of preview.toCreate) {
      byDept.set(p.dept_name_portal, (byDept.get(p.dept_name_portal) ?? 0) + 1)
    }
    const newBasic = preview.toCreate.reduce((sum, p) => sum + p.basic_salary, 0)

    return (
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="sheet-heading">Preview</h2>
            <p className="sheet-subtitle">
              <span className="font-mono">{fileName}</span>
              {resignedCount > 0 && ` · ${resignedCount} resigned row(s) skipped`}
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

        {/* New people are what the file adds to the roster — the row's walnut
            card. The rest say what it does to the people already on it, and
            which rows it leaves behind (red while there are any). */}
        <StatCards label="What this file will do">
          <StatCard
            label="To create"
            value={String(preview.toCreate.length)}
            icon="upload"
            tone="primary"
            note="New people on the roster"
          />
          <StatCard
            label="To update"
            value={String(preview.toUpdate.length)}
            icon="swap"
            note="Synced to the file"
          />
          <StatCard
            label="Unchanged"
            value={String(preview.unchanged.length)}
            icon="check"
            note="Already match the file"
          />
          <StatCard label="Directors skipped" value={String(preview.directors.length)} icon="briefcase" />
          <StatCard
            label="Dept unmapped"
            value={String(preview.deptMissing.length)}
            icon="building"
            tone={preview.deptMissing.length > 0 ? 'danger' : undefined}
            note={preview.deptMissing.length > 0 ? 'Rows skipped' : undefined}
          />
          <StatCard
            label="Needs a look"
            value={String(preview.skipped.length)}
            icon="file-alert"
            tone={preview.skipped.length > 0 ? 'danger' : undefined}
            note={preview.skipped.length > 0 ? 'Rows skipped' : undefined}
          />
        </StatCards>

        {byDept.size > 0 && (
          <section className="mb-6">
            <div className="sect-head">
              <h2>By department</h2>
              <span className="rule" aria-hidden />
              <span className="count">{preview.toCreate.length} NEW</span>
            </div>
            <div className="max-w-md">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="right">New staff</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byDept.entries()].map(([dept, count]) => (
                    <tr key={dept}>
                      <td className="font-medium">{dept}</td>
                      <td className="num">{count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>All departments</td>
                    <td className="num">{preview.toCreate.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {preview.toCreate.length > 0 && (
          <details className="mb-6" open>
            <summary className="cursor-pointer text-md font-semibold mb-3">
              New staff <span className="sheet-count ml-2">{preview.toCreate.length}</span>
            </summary>
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>InfoTech No</th>
                    <th>Name</th>
                    <th className="m-hide">Designation</th>
                    <th className="m-hide">Department</th>
                    <th className="right">Basic</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {preview.toCreate.map(p => (
                    <LedgerRow key={p.rowIndex}>
                      <td className="font-mono">{p.employee_code}</td>
                      <td className="font-medium">{p.employee_name}</td>
                      <td className="m-hide" data-label="Designation">
                        {p.designation ?? '—'}
                      </td>
                      <td className="m-hide" data-label="Department">
                        {p.dept_name_portal}
                      </td>
                      <td className="num">{formatMoney(p.basic_salary)}</td>
                    </LedgerRow>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      {preview.toCreate.length} new {preview.toCreate.length === 1 ? 'person' : 'people'}
                    </td>
                    <td className="m-hide" colSpan={2} />
                    <td className="num">{formatMoney(newBasic)}</td>
                    <td className="lt-toggle" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        )}

        {preview.toUpdate.length > 0 && (
          <details className="mb-6" open>
            <summary className="cursor-pointer text-md font-semibold mb-3">
              Updates to existing staff{' '}
              <span className="sheet-count ml-2">{preview.toUpdate.length}</span>
              <span className="text-sm font-normal ml-2">— synced to the file</span>
            </summary>
            {/* One row per person; the cell beside them lists every field the
                file changes, old value → new. */}
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>What changes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toUpdate.map(u => (
                    <tr key={u.rowIndex}>
                      <td>
                        <span className="font-mono mr-2">{u.employee_code}</span>
                        <span className="font-medium">{u.employee_name}</span>
                      </td>
                      <td>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                          {u.changes.map(c => (
                            <div key={c.field}>
                              <span className="text-[10px] uppercase tracking-wide">
                                {c.field.replace(/_/g, ' ')}
                              </span>
                              <span className="font-mono ml-2 text-xs">
                                {c.from} → <span className="font-semibold">{c.to}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {preview.unchanged.length > 0 && (
          <details className="mb-6">
            <summary className="cursor-pointer text-md font-semibold">
              Unchanged <span className="sheet-count ml-2">{preview.unchanged.length}</span>
              <span className="text-sm font-normal ml-2">— already match the file</span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.unchanged.map(d => (
                <div key={d.rowIndex} className="text-sm">
                  <span className="font-mono">{d.employee_code}</span> · {d.employee_name}
                </div>
              ))}
            </div>
          </details>
        )}

        {preview.deptMissing.length > 0 && (
          <details className="sheet-warning" open>
            <summary className="cursor-pointer text-sm font-bold">
              Unmapped departments{' '}
              <span className="sheet-count ml-2">{preview.deptMissing.length}</span>
              <span className="font-normal ml-2">— rows skipped</span>
            </summary>
            <p className="text-xs mt-2 mb-3">
              Add these departments in the portal first, or extend the dept code map in
              <code className="mx-1 font-mono">src/app/(portal)/team/people/import/actions.ts</code>.
            </p>
            <div className="space-y-1">
              {preview.deptMissing.map(d => (
                <div key={d.rowIndex} className="text-sm">
                  <span className="font-mono">{d.employee_code}</span> · {d.employee_name} ·{' '}
                  <span className="font-mono text-danger">{d.dept_code}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* A row the matcher would not guess at (2026-09-12): a name two
            people share, or somebody whose InfoTech No is known under a
            different number in the file. Neither an update nor a new person
            until somebody has looked. */}
        {preview.skipped.length > 0 && (
          <details className="sheet-warning" open>
            <summary className="cursor-pointer text-sm font-bold">
              Needs a look <span className="sheet-count ml-2">{preview.skipped.length}</span>
              <span className="font-normal ml-2">— rows skipped</span>
            </summary>
            <p className="text-xs mt-2 mb-3">
              Rows are matched by InfoTech No first, then by name. These matched nobody safely —
              set the InfoTech No on the right person&apos;s card (Edit) and upload again.
            </p>
            <div className="space-y-1">
              {preview.skipped.map(s => (
                <div key={s.rowIndex} className="text-sm">
                  <span className="font-mono">{rows[s.rowIndex]?.employeeCode}</span> ·{' '}
                  {rows[s.rowIndex]?.employeeName} ·{' '}
                  <span className="text-danger">{s.reason}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-hairline">
          <button
            onClick={runApply}
            disabled={isPending || preview.toCreate.length + preview.toUpdate.length === 0}
            className={PRIMARY_BTN}
          >
            {isPending
              ? 'Applying…'
              : `Import ${preview.toCreate.length + preview.toUpdate.length} staff (${preview.toCreate.length} new · ${preview.toUpdate.length} update)`}
          </button>
          {error && <p className="sheet-danger basis-full m-0">{error}</p>}
        </div>
      </div>
    )
  }

  // ─────────── Stage 3 — done ───────────
  return (
    <div className="bg-surface border border-hairline rounded-card p-8 max-w-2xl">
      <h2 className="sheet-heading">✓ Import complete</h2>
      <p className="text-sm mt-2 mb-2">
        {applyResult?.created ?? 0} staff created
        {(applyResult?.updated ?? 0) > 0 && ` · ${applyResult?.updated ?? 0} updated to match the file`}
        {(applyResult?.unchanged ?? 0) > 0 && ` · ${applyResult?.unchanged ?? 0} already matched`}
        {(applyResult?.directors ?? 0) > 0 && ` · ${applyResult?.directors ?? 0} directors skipped (use Director Salary)`}
        {(applyResult?.deptMissing ?? 0) > 0 && ` · ${applyResult?.deptMissing ?? 0} unmapped departments skipped`}
        {(applyResult?.failed?.length ?? 0) > 0 && ` · ${applyResult?.failed?.length ?? 0} failed`}.
      </p>
      {applyResult && applyResult.failed.length > 0 && (
        <details className="sheet-danger">
          <summary className="cursor-pointer text-sm font-bold">
            Failed rows <span className="sheet-count ml-2">{applyResult.failed.length}</span>
          </summary>
          <div className="mt-2 space-y-1">
            {applyResult.failed.map(f => (
              <div key={f.rowIndex} className="text-xs">
                <span className="font-mono">{f.employee_code}</span> — {f.reason}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="flex flex-wrap gap-3 mt-6">
        <Link href="/team/people" className={PRIMARY_BTN}>
          Back to Staff →
        </Link>
        <button onClick={reset} className={SECONDARY_BTN}>
          Import another file
        </button>
      </div>
    </div>
  )
}
