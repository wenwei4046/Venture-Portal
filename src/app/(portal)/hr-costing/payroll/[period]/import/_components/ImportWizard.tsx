'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  previewImport,
  applyImport,
  type ColumnMap,
  type ParsedRow,
  type PreviewResult,
  type SystemField,
} from '../actions'

interface Props {
  period: string
}

const FIELD_LABEL: Record<SystemField, string> = {
  skip: '— skip —',
  employee_code: 'Match: Employee Code',
  employee_name_match: 'Match: Employee Name',
  basic_salary: 'Basic Salary',
  statutory_allowance: 'Statutory Allowance',
  non_statutory_allowance: 'Non-Stat Allowance',
  ot_hours: 'OT Hours',
  ot_amount: 'OT Amount',
  commission_amount: 'Commission',
  unpaid_leave_days: 'Unpaid Leave (days)',
}

const FIELD_ORDER: SystemField[] = [
  'skip',
  'employee_code',
  'employee_name_match',
  'basic_salary',
  'statutory_allowance',
  'non_statutory_allowance',
  'ot_hours',
  'ot_amount',
  'commission_amount',
  'unpaid_leave_days',
]

function autoMap(header: string): SystemField {
  const n = header.toLowerCase().replace(/[^a-z]/g, '')
  if (n.includes('code') || n === 'empno' || n === 'employeeno') return 'employee_code'
  if (n.includes('name')) return 'employee_name_match'
  if (n.includes('basic')) return 'basic_salary'
  if (n.includes('statutory') && n.includes('allow')) return 'statutory_allowance'
  if (n.includes('nonstat') || (n.includes('allowance') && !n.includes('stat'))) return 'non_statutory_allowance'
  if (n.includes('othour')) return 'ot_hours'
  if (n.includes('ot') && (n.includes('amount') || n.includes('pay'))) return 'ot_amount'
  if (n.includes('commission')) return 'commission_amount'
  if (n.includes('unpaid') || n.includes('leave')) return 'unpaid_leave_days'
  return 'skip'
}

/** Dead-simple CSV parser. Handles quoted values with embedded commas. */
function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const splitLine = (line: string): string[] => {
    const out: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQuote) {
        if (c === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (c === '"') {
          inQuote = false
        } else {
          current += c
        }
      } else {
        if (c === '"') inQuote = true
        else if (c === ',') {
          out.push(current.trim())
          current = ''
        } else {
          current += c
        }
      }
    }
    out.push(current.trim())
    return out
  }

  const headers = splitLine(lines[0])
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    const row: ParsedRow = {}
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

export default function ImportWizard({ period }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMap>({})
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<{ updated: number; skipped: number } | null>(null)

  function handleFile(file: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const { headers, rows } = parseCSV(text)
        if (headers.length === 0) {
          setError('CSV looks empty.')
          return
        }
        const initMap: ColumnMap = {}
        for (const h of headers) initMap[h] = autoMap(h)
        setHeaders(headers)
        setRows(rows)
        setMapping(initMap)
        setStage('map')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse CSV')
      }
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }

  function runPreview() {
    setError(null)
    startTransition(async () => {
      try {
        const p = await previewImport(mapping, rows, period)
        setPreview(p)
        setStage('preview')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Preview failed')
      }
    })
  }

  function runApply() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await applyImport(mapping, rows, period)
        setApplyResult(r)
        setStage('done')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Apply failed')
      }
    })
  }

  // ───────── Stage: Upload ─────────
  if (stage === 'upload') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-8 max-w-2xl">
        <h2 className="font-serif text-xl text-ink mb-2">1. Upload CSV</h2>
        <p className="font-serif italic text-graphite text-sm mb-6">
          Drop your InfoTech export. Headers can be anything — we&apos;ll auto-match where possible, you adjust the rest.
        </p>
        <label className="block cursor-pointer border-2 border-dashed border-hairline hover:border-accent rounded-md p-10 text-center transition-colors">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
            className="hidden"
          />
          <span className="font-serif italic text-graphite block">Click to choose a CSV file</span>
          <span className="font-sans text-xs text-muted mt-2 block">or drag and drop</span>
        </label>
        {error && <p className="mt-4 text-sm font-serif italic text-danger">{error}</p>}
      </div>
    )
  }

  // ───────── Stage: Map columns ─────────
  if (stage === 'map') {
    return (
      <div className="bg-surface border border-hairline rounded-md p-6 max-w-3xl">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="font-serif text-xl text-ink">2. Map columns</h2>
            <p className="font-serif italic text-graphite text-sm mt-1">
              {rows.length} rows detected. Pick which system field each CSV column goes to, or skip.
            </p>
          </div>
          <button
            onClick={() => { setStage('upload'); setHeaders([]); setRows([]); setMapping({}) }}
            className="text-xs font-sans text-muted hover:text-ink"
          >
            ← re-upload
          </button>
        </div>
        <div className="space-y-3 mb-6">
          {headers.map(h => (
            <div key={h} className="grid grid-cols-2 gap-4 items-center">
              <div className="font-mono text-sm text-ink truncate" title={h}>{h}</div>
              <select
                value={mapping[h]}
                onChange={e => setMapping({ ...mapping, [h]: e.target.value as SystemField })}
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
              >
                {FIELD_ORDER.map(f => (
                  <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-4 border-t border-hairline">
          <button
            onClick={runPreview}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Previewing...' : 'Preview changes →'}
          </button>
          {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
        </div>
      </div>
    )
  }

  // ───────── Stage: Preview ─────────
  if (stage === 'preview' && preview) {
    return (
      <div className="max-w-4xl">
        <div className="bg-surface border border-hairline rounded-md p-6 mb-6">
          <h2 className="font-serif text-xl text-ink mb-2">3. Preview</h2>
          <div className="flex gap-8 mt-4">
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">To update</div>
              <div className="font-mono tabular text-2xl text-ink mt-1">{preview.toUpdate.length}</div>
            </div>
            <div>
              <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Skipped</div>
              <div className="font-mono tabular text-2xl text-graphite mt-1">{preview.skipped.length}</div>
            </div>
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
                    <div className="font-sans text-xs text-muted italic">matched by {u.matchedBy}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    {u.changes.map(c => (
                      <div key={c.field} className="font-sans text-graphite">
                        <span className="text-muted text-xs uppercase">{c.field.replace(/_/g, ' ')}</span>
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
            <summary className="cursor-pointer font-serif text-lg text-ink">
              Skipped rows <span className="text-muted font-sans text-sm ml-2">({preview.skipped.length})</span>
            </summary>
            <div className="mt-3 space-y-1">
              {preview.skipped.map(s => (
                <div key={s.rowIndex} className="text-sm font-sans text-graphite">
                  Row {s.rowIndex + 1}: <span className="italic">{s.reason}</span>
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
          <button
            onClick={() => setStage('map')}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink"
          >
            ← back to mapping
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
        {applyResult?.updated ?? 0} payroll rows updated. {applyResult?.skipped ?? 0} rows skipped.
      </p>
      <div className="flex gap-3">
        <a
          href={`/hr-costing/payroll/${period}`}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
        >
          See updated grid →
        </a>
        <button
          onClick={() => {
            setStage('upload')
            setHeaders([])
            setRows([])
            setMapping({})
            setPreview(null)
            setApplyResult(null)
          }}
          className="text-sm font-sans text-muted hover:text-ink"
        >
          Import another file
        </button>
      </div>
    </div>
  )
}
