'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteAllocTxn, generateAllocatorInvoices, type GenerateResult } from '../actions'
import type { AllocatorData, TxnRow } from './types'
import { unwrap } from './unwrap'

const fmt = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function RecordsTab({
  data,
  onEdit,
}: {
  data: AllocatorData
  /** Loads the record into the Calculate tab; saving there overwrites it. */
  onEdit: (t: TxnRow) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<GenerateResult | null>(null)

  const invoiced = data.invoices.length > 0

  // Per-company billed totals across the period's txns (own share excluded).
  const totals = new Map<string, number>()
  let ownTotal = 0
  for (const t of data.txns) {
    for (const d of t.details) {
      if (d.isOwnShare) { ownTotal += d.amount; continue }
      totals.set(d.companyLabel, (totals.get(d.companyLabel) ?? 0) + d.amount)
    }
  }
  const billedGrand = Array.from(totals.values()).reduce((a, b) => a + b, 0)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }

  if (data.txns.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-8 text-center">
        <p className="font-serif italic text-muted">{data.period} 还没有分摊记录 — 去「计算」tab 开始。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Invoices banner */}
      {invoiced ? (
        <div className="border border-accent-border bg-accent-bg rounded-md p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <span className="font-serif italic text-accent text-sm">
              {data.period} 已开单 — 记录已锁定(要改先去 Invoice 页删掉 draft)
            </span>
            <Link href="/statements" className="font-serif italic text-sm text-accent hover:text-accent-hover">
              去 Invoice 页处理 →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* invoice-doc is the per-invoice document view (a /statements/[id]
                link 404s — that route is monthly statements, user 2026-08-01). */}
            {data.invoices.map((inv) => (
              <a
                key={inv.id}
                href={`/billing/invoice-doc?id=${inv.id}`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-surface border border-hairline rounded-md font-mono text-xs text-ink hover:text-accent transition-colors"
              >
                {inv.companyLabel} · {inv.invoiceNo} · <em className="font-serif">{inv.status}</em> →
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => run(async () => { setGenResult(unwrap(await generateAllocatorInvoices(data.period))) })}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? '开单中…' : `Generate draft invoices (${new Set(
              data.txns.flatMap((t) => t.details.filter((d) => !d.isOwnShare).map((d) => d.companyLabel)),
            ).size} 家)`}
          </button>
          <span className="font-serif italic text-muted text-xs">
            每家一张 draft,跟手工多行开单同一条路;开完去 Invoice 页复核 issue。
          </span>
        </div>
      )}

      {genResult ? (
        <div className="border border-hairline rounded-md bg-surface p-4 text-sm font-sans space-y-1">
          {genResult.created.map((c) => (
            <div key={c.company} className="text-ledger">✓ {c.company} → {c.invoiceNo}</div>
          ))}
          {genResult.skipped.map((s) => (
            <div key={s.company} className="text-muted">– {s.company} 跳过:已有 {s.reason}</div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* Txn list */}
      <div className="overflow-x-auto border border-hairline rounded-md">
        <table className="ledger-table w-full">
          <thead>
            <tr>
              <th>Txn</th>
              <th>Description</th>
              <th>Method</th>
              <th className="num">Amount</th>
              <th>分摊结果</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.txns.map((t) => (
              <tr key={t.id}>
                <td className="font-mono text-xs text-accent whitespace-nowrap">{t.txnNo}</td>
                <td>
                  <div className="font-serif text-md text-ink">{t.description}</div>
                  <div className="font-mono text-[10px] text-muted">
                    {t.categoryName || '—'}{t.hcPeriod ? ` · HC ${t.hcPeriod}` : ''}
                  </div>
                </td>
                <td>
                  <span className="px-2 py-0.5 bg-surface-2 rounded-md font-mono text-[10px] uppercase">{t.method}</span>
                </td>
                <td className="num font-mono tabular">{fmt(t.amount)}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {t.details.map((d, i) => (
                      <span
                        key={i}
                        title={d.detail}
                        className={`px-2 py-0.5 rounded-md border text-xs font-mono tabular ${
                          d.isOwnShare
                            ? 'bg-surface text-muted border-hairline italic'
                            : 'bg-accent-bg text-ink border-accent-border'
                        }`}
                      >
                        {d.isOwnShare ? 'HV own' : d.companyLabel} {fmt(d.amount)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    disabled={isPending || invoiced}
                    title={invoiced ? '已开单,先删 draft invoice' : '带回计算 tab 修改,存档覆盖原记录'}
                    className="text-accent hover:text-accent-hover font-serif italic text-sm mr-3 disabled:opacity-40"
                  >
                    改
                  </button>
                  <button
                    type="button"
                    onClick={() => run(async () => { unwrap(await deleteAllocTxn(t.id)) })}
                    disabled={isPending || invoiced}
                    title={invoiced ? '已开单,先删 draft invoice' : '删掉这笔分摊'}
                    className="text-muted hover:text-danger font-mono text-sm px-1 disabled:opacity-40"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-company totals */}
      <div className="border border-hairline rounded-md bg-surface p-4">
        <div className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent mb-2">
          {data.period} 各家合计
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([label, amt]) => (
            <span key={label} className="px-2.5 py-1 bg-accent-bg border border-accent-border rounded-md font-mono tabular text-sm text-ink">
              {label} · RM {fmt(amt)}
            </span>
          ))}
          {ownTotal > 0 ? (
            <span className="px-2.5 py-1 bg-surface border border-hairline rounded-md font-mono tabular text-sm text-muted italic">
              HV own · RM {fmt(ownTotal)}(不开单)
            </span>
          ) : null}
        </div>
        <div className="mt-3 pt-3 border-t border-hairline flex items-baseline justify-between">
          <span className="font-serif italic text-graphite text-sm">会开单的合计</span>
          <span className="font-mono tabular font-semibold text-ink">RM {fmt(billedGrand)}</span>
        </div>
      </div>
    </div>
  )
}
