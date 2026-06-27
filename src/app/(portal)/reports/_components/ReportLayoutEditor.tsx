'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ReportCategory, ReportLayout } from '@/lib/report-layouts'
import { saveReportLayout } from '../layout-actions'

interface AccountMeta {
  code: string
  name: string
}

// Drag-and-drop editor for a custom report layout (Cash Flow / P&L): create
// categories, drag accounts into them, reorder, save. Subtotals recompute on
// the report automatically. Company-wide, keyed by reportKey.
export default function ReportLayoutEditor({
  reportKey,
  accounts,
  initial,
}: {
  reportKey: string
  accounts: AccountMeta[]
  initial: ReportLayout
}) {
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [dragCode, setDragCode] = useState<string | null>(null)

  const nameByCode = useMemo(() => new Map(accounts.map((a) => [a.code, a.name])), [accounts])
  const allCodes = useMemo(() => new Set(accounts.map((a) => a.code)), [accounts])

  const [categories, setCategories] = useState<ReportCategory[]>(() =>
    initial.categories.map((c) => ({ ...c, accounts: c.accounts.filter((code) => allCodes.has(code)) })),
  )

  const assigned = useMemo(() => new Set(categories.flatMap((c) => c.accounts)), [categories])
  const unassigned = useMemo(() => accounts.filter((a) => !assigned.has(a.code)), [accounts, assigned])

  const moveCode = (code: string, targetId: string | 'unassigned') => {
    setCategories((prev) => {
      const stripped = prev.map((c) => ({ ...c, accounts: c.accounts.filter((x) => x !== code) }))
      if (targetId === 'unassigned') return stripped
      return stripped.map((c) => (c.id === targetId ? { ...c, accounts: [...c.accounts, code] } : c))
    })
    setMessage(null)
  }
  const addCategory = () =>
    setCategories((prev) => [...prev, { id: crypto.randomUUID(), name: 'New category', accounts: [] }])
  const renameCategory = (id: string, name: string) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
  const deleteCategory = (id: string) => setCategories((prev) => prev.filter((c) => c.id !== id))
  const moveCategory = (id: string, dir: -1 | 1) =>
    setCategories((prev) => {
      const i = prev.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const save = () => {
    setMessage(null)
    startSaving(async () => {
      try {
        await saveReportLayout(reportKey, { categories })
        setMessage({ type: 'success', text: 'Saved. The report now uses this layout.' })
        router.refresh()
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' })
      }
    })
  }

  const Chip = ({ code }: { code: string }) => (
    <div
      draggable
      onDragStart={() => setDragCode(code)}
      onDragEnd={() => setDragCode(null)}
      className={`cursor-grab active:cursor-grabbing select-none px-2.5 py-1.5 rounded-md border text-sm font-sans flex items-center gap-2 ${
        dragCode === code ? 'opacity-50 border-accent' : 'bg-paper border-hairline hover:border-accent-border'
      }`}
      title={code}
    >
      <span className="text-muted font-mono text-[10px]">⠿</span>
      <span className="text-ink">{nameByCode.get(code) ?? code}</span>
    </div>
  )

  const DropZone = ({ targetId, children }: { targetId: string | 'unassigned'; children: ReactNode }) => (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (dragCode) moveCode(dragCode, targetId)
        setDragCode(null)
      }}
      className="min-h-[44px] flex flex-wrap gap-2 p-2 rounded-md bg-surface border border-dashed border-hairline"
    >
      {children}
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="font-serif italic text-muted text-sm max-w-2xl">
          Drag accounts into the categories you want. Subtotals on the report
          recompute automatically. Anything left in <em>Unassigned</em> still
          shows on the report under its own group.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {message ? (
            <span className={`text-sm font-sans ${message.type === 'error' ? 'text-danger' : 'text-ledger'}`}>
              {message.text}
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-sans rounded-md transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        <section>
          <div className="text-xs uppercase tracking-wide text-muted font-sans mb-2">
            Unassigned ({unassigned.length})
          </div>
          <DropZone targetId="unassigned">
            {unassigned.length === 0 ? (
              <span className="text-sm font-serif italic text-muted px-1">All accounts assigned.</span>
            ) : (
              unassigned.map((a) => <Chip key={a.code} code={a.code} />)
            )}
          </DropZone>
        </section>

        <section className="space-y-4">
          {categories.map((cat, idx) => (
            <div key={cat.id} className="border border-hairline rounded-md bg-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={cat.name}
                  onChange={(e) => renameCategory(cat.id, e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
                />
                <button type="button" onClick={() => moveCategory(cat.id, -1)} disabled={idx === 0}
                  className="px-2 py-1 text-graphite hover:text-ink disabled:opacity-30" title="Move up">▲</button>
                <button type="button" onClick={() => moveCategory(cat.id, 1)} disabled={idx === categories.length - 1}
                  className="px-2 py-1 text-graphite hover:text-ink disabled:opacity-30" title="Move down">▼</button>
                <button type="button" onClick={() => deleteCategory(cat.id)}
                  className="px-2 py-1 text-danger hover:opacity-80" title="Delete category (accounts return to Unassigned)">✕</button>
              </div>
              <DropZone targetId={cat.id}>
                {cat.accounts.length === 0 ? (
                  <span className="text-sm font-serif italic text-muted px-1">Drag accounts here.</span>
                ) : (
                  cat.accounts.map((code) => <Chip key={code} code={code} />)
                )}
              </DropZone>
            </div>
          ))}
          <button
            type="button"
            onClick={addCategory}
            className="px-4 py-2 border border-dashed border-hairline rounded-md text-sm font-sans text-graphite hover:text-ink hover:border-accent-border transition-colors"
          >
            + Add category
          </button>
        </section>
      </div>
    </div>
  )
}
