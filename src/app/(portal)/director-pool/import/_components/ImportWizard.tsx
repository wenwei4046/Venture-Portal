'use client'

// Import wizard for the HTML tool's saveData() JSON (version 2). Parses the
// file client-side for a preview, then hands the raw text to the server
// action which REPLACES all existing calculator data.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { importDpJson } from '../../actions'

interface Preview {
  months: string[]
  directors: { id: string; weight: number }[]
  settings?: { fixed?: number; savingPct?: number; gbPct?: number }
  keyedInputs: number
  contraDirectors: number
}

export default function ImportWizard() {
  const router = useRouter()
  const [jsonText, setJsonText] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [year, setYear] = useState(2026)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File | undefined) => {
    setError('')
    setPreview(null)
    setJsonText(null)
    if (!file) return
    const text = await file.text()
    try {
      const parsed = JSON.parse(text)
      if (!parsed.months || !parsed.directors) throw new Error('months / directors missing')
      const keyedInputs =
        Object.keys(parsed.billingInputs ?? {}).length +
        Object.keys(parsed.advStatInputs ?? {}).length +
        Object.keys(parsed.allowPayStatInputs ?? {}).length +
        Object.keys(parsed.savingWithdrawals ?? {}).length +
        Object.keys(parsed.advanceOverrides ?? {}).length
      setPreview({
        months: parsed.months.map((m: { name: string }) => m.name),
        directors: parsed.directors.map((d: { id: string; weight: number }) => ({ id: d.id, weight: d.weight })),
        settings: parsed.settings,
        keyedInputs,
        contraDirectors: Object.keys(parsed.billingContraOffsets ?? {}).length,
      })
      setJsonText(text)
      setFileName(file.name)
    } catch (e) {
      setError(`Not a valid Salary Pool JSON file: ${e instanceof Error ? e.message : 'parse error'}`)
    }
  }

  const doImport = async () => {
    if (!jsonText) return
    if (
      !confirm(
        `⚠️ Import will REPLACE all existing Director Pool calculator data with "${fileName}" (year ${year}). Continue?`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const result = await importDpJson(jsonText, year)
      if (!result.ok) {
        setError(result.error)
        return
      }
      alert(
        `✅ Imported successfully!\n\n${result.months} month(s) · ${result.directorInputs} keyed input row(s) · ${result.contraEvents} contra event(s)`,
      )
      router.push('/director-pool')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="font-serif italic text-sm text-graphite mb-6 leading-relaxed">
        Upload the JSON file saved from the standalone HTML tool (💾 Save button —
        <span className="font-mono text-xs"> SalaryPool_Data_*.json</span>). Everything carries over: months,
        company inputs, keyed statutory, advance overrides, saving withdrawals and contra state.
      </p>

      <div className="border border-hairline rounded-md bg-surface p-6 mb-6">
        <label className="block mb-4">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-graphite block mb-2">
            JSON file
          </span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="text-sm text-ink file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:border-hairline file:bg-surface file:text-xs file:text-graphite file:cursor-pointer"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-graphite block mb-2">
            Year（HTML 里的月份没有年份 — 选它们属于哪一年）
          </span>
          <input
            type="number"
            value={year}
            min={2020}
            max={2100}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-hairline rounded bg-surface px-3 py-1.5 font-mono text-sm text-ink w-28 focus:outline-none focus:border-accent"
          />
        </label>
      </div>

      {error && (
        <p className="font-serif text-sm text-danger mb-4 border-l-2 border-danger pl-3">{error}</p>
      )}

      {preview && (
        <div className="border border-hairline rounded-md bg-surface p-6 mb-6">
          <h2 className="font-serif italic text-base text-ink mb-3">Preview — {fileName}</h2>
          <table className="ledger-table mb-2">
            <tbody>
              <tr>
                <td className="font-mono text-xs text-graphite w-48">Months</td>
                <td className="font-serif text-sm text-ink">
                  {preview.months.join(', ')} <span className="text-graphite">({preview.months.length})</span>
                </td>
              </tr>
              <tr>
                <td className="font-mono text-xs text-graphite">Directors / weights</td>
                <td className="font-serif text-sm text-ink">
                  {preview.directors.map((d) => `${d.id} ${d.weight}%`).join(' · ')}
                </td>
              </tr>
              {preview.settings && (
                <tr>
                  <td className="font-mono text-xs text-graphite">Settings</td>
                  <td className="font-serif text-sm text-ink">
                    Fixed RM {preview.settings.fixed ?? 14400} · Saving {preview.settings.savingPct ?? 5}% · Split{' '}
                    {preview.settings.gbPct ?? 75}/{100 - (preview.settings.gbPct ?? 75)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="font-mono text-xs text-graphite">Keyed inputs</td>
                <td className="font-serif text-sm text-ink">{preview.keyedInputs} entries</td>
              </tr>
              <tr>
                <td className="font-mono text-xs text-graphite">Contra offsets</td>
                <td className="font-serif text-sm text-ink">{preview.contraDirectors} director(s)</td>
              </tr>
            </tbody>
          </table>
          <p className="font-serif italic text-xs text-danger">
            ⚠️ Importing replaces ALL existing calculator data in the portal.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!preview || busy}
          onClick={doImport}
          className="px-5 py-2 rounded-md border border-accent text-sm font-medium text-accent hover:bg-accent/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {busy ? 'Importing…' : 'Import & Replace'}
        </button>
        <Link
          href="/director-pool"
          className="px-5 py-2 rounded-md border border-hairline text-sm text-graphite hover:text-ink transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
