'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import { PRODUCT_LIST_PATH, revenuePath } from '@/lib/revenue'
import {
  parseErpSalesOrders,
  selectPeriod,
  type ErpParseResult,
  type ErpSalesOrder,
} from '@/lib/import/erp-sales-order'
import {
  commitSalesImport,
  type CommitResult,
  type ImportOrderDto,
} from '../../../../import-actions'

interface Props {
  period: string
  /** Only for the "back to the run" links — the import itself is department-wide. */
  subDeptSlug: string
  staff: Array<{ id: string; name: string; code: string | null }>
  aliases: Record<string, string>
}

/**
 * The ERP sales-order import.
 *
 * Parsing happens here in the browser so the whole file can be shown before a
 * single row is written — which matters, because a "July" export routinely
 * carries six weeks of orders and importing it wholesale would pay August work
 * inside the July run.
 *
 * The wizard therefore leads with what it is about to DROP (out-of-period,
 * cancelled) and what it cannot resolve (unmatched agents), not with what it
 * will keep.
 */
export default function SalesImportWizard({ period, subDeptSlug, staff, aliases }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'review' | 'done'>('upload')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ErpParseResult | null>(null)
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [saveAliases, setSaveAliases] = useState(true)
  const [suggestOpenBills, setSuggestOpenBills] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [pending, startTransition] = useTransition()

  const selection = useMemo(
    () => (parsed ? selectPeriod(parsed.orders, period) : null),
    [parsed, period],
  )

  /** Agents that actually appear in the month being imported. */
  const agentsInPeriod = useMemo(() => {
    if (!selection) return []
    const map = new Map<string, { key: string; name: string; orders: number; total: number }>()
    for (const o of selection.selected) {
      const e = map.get(o.agentKey) ?? { key: o.agentKey, name: o.agentName, orders: 0, total: 0 }
      e.orders++
      e.total += o.orderTotal
      map.set(o.agentKey, e)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [selection])

  const unmatched = agentsInPeriod.filter(a => !agentMap[a.key])

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const p = parseErpSalesOrders(buf)
      if (p.orders.length === 0) {
        setError('No sales orders found. Is this the ERP sales-order listing export?')
        return
      }
      setFileName(file.name)
      setParsed(p)
      // Seed from what we already know, so a repeat import needs no clicking.
      const seeded: Record<string, string> = {}
      for (const a of p.agents) {
        if (aliases[a.key]) seeded[a.key] = aliases[a.key]
      }
      setAgentMap(seeded)
      setStage('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file')
    }
  }

  function commit() {
    if (!parsed || !selection) return
    setError(null)
    startTransition(async () => {
      try {
        const r = await commitSalesImport({
          periodMonth: period,
          fileName,
          sheetName: parsed.sheetName || null,
          rowCount: parsed.orders.reduce((a, o) => a + o.lines.length, 0),
          outOfPeriodCount: selection.outOfPeriod,
          cancelledCount: selection.cancelled,
          orders: selection.selected.map(toDto),
          agentMap,
          saveAliases,
          suggestOpenBills,
        })
        setResult(r)
        setStage('done')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed')
      }
    })
  }

  // ── Upload ───────────────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div>
        <ErrorBox error={error} />
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Choose the sales-order export.</p>
          <p className="font-serif italic text-muted text-sm mb-8 max-w-lg mx-auto">
            The whole file is read here in your browser first. Nothing is written until you have
            seen which month it covers, what will be dropped, and who every agent is.
          </p>
          <label className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md cursor-pointer transition-colors">
            Select file
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
          </label>
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────
  if (stage === 'done' && result) {
    return (
      <div className="space-y-6">
        <div className="border border-hairline rounded-md bg-surface p-8">
          <p className="font-serif text-2xl text-ink mb-4">
            {result.orderCount} orders imported.
          </p>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 max-w-2xl font-sans text-sm">
            <Stat label="Order lines" value={String(result.lineCount)} />
            <Stat label="Open Bill picks suggested" value={String(result.openBillsSuggested)} />
            <Stat
              label="Lines without a cost"
              value={String(result.linesWithoutCost)}
              warn={result.linesWithoutCost > 0}
            />
            <Stat
              label="Lines without a brand"
              value={String(result.linesWithoutBrand)}
              warn={result.linesWithoutBrand > 0}
            />
          </dl>

          {result.linesWithoutCost > 0 ? (
            <p className="font-serif italic text-graphite text-sm mt-5 max-w-2xl">
              Those lines have no cost, so their bills have no margin and the below-margin penalty
              will be skipped on them. Fill the gaps in{' '}
              <Link href={PRODUCT_LIST_PATH} className="text-accent hover:underline">
                the Product List
              </Link>
              , or key a margin straight onto the affected orders.
            </p>
          ) : null}

          {result.unmatchedAgents.length > 0 ? (
            <p className="font-serif italic text-danger text-sm mt-4 max-w-2xl">
              {result.unmatchedAgents.length} agent(s) are still unmatched, so their orders carry no
              salesperson and will not pay commission: {result.unmatchedAgents.join(', ')}.
            </p>
          ) : null}
        </div>

        <div className="flex gap-3">
          <Link
            href={revenuePath(subDeptSlug, period)}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Go to the {period.slice(0, 7)} run →
          </Link>
          <button
            type="button"
            onClick={() => {
              setStage('upload')
              setParsed(null)
              setResult(null)
            }}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Import another file
          </button>
        </div>
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────
  if (!parsed || !selection) return null

  return (
    <div className="space-y-10">
      <ErrorBox error={error} />

      <section>
        <div className="sect-head">
          <h2>What the file contains</h2>
          <span className="rule" aria-hidden />
          <span className="count">{fileName}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-4 mb-4">
          <Tile label="Orders in file" value={String(parsed.orders.length)} />
          <Tile
            label={`Kept for ${period.slice(0, 7)}`}
            value={String(selection.selected.length)}
            accent
          />
          <Tile label="Other months" value={String(selection.outOfPeriod)} />
          <Tile label="Cancelled" value={String(selection.cancelled)} />
        </div>

        {parsed.periods.length > 1 ? (
          <p className="font-serif italic text-graphite text-sm mb-3">
            This export spans {parsed.periods.map(p => p.periodMonth.slice(0, 7)).join(', ')} — a
            date range, not a month. Only {period.slice(0, 7)} is being imported; switch the period
            above to bring in the rest.
          </p>
        ) : null}

        {parsed.tallyMismatches.length > 0 ? (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-3 text-sm font-sans">
            {parsed.tallyMismatches.length} order(s) do not add up: the header total differs from
            the sum of their lines. Check the export before importing —{' '}
            {parsed.tallyMismatches
              .slice(0, 3)
              .map(m => `${m.orderNo} (${m.headerTotal} vs ${m.lineSum})`)
              .join(', ')}
            .
          </div>
        ) : null}

        <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Item group</th>
                <th className="right">Lines</th>
                <th className="right">Units</th>
                <th className="right">Value in file</th>
              </tr>
            </thead>
            <tbody>
              {parsed.itemGroups.map(g => (
                <tr key={g.group}>
                  <td className="font-mono text-xs">{g.group}</td>
                  <td className="num">{g.lines}</td>
                  <td className="num">{g.qty}</td>
                  <td className="num">{formatMoney(g.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="sect-head">
          <h2>Who is who</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {agentsInPeriod.length - unmatched.length} / {agentsInPeriod.length} MATCHED
          </span>
        </div>
        <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
          The export names the salesperson in free text with no code, and the names are not always
          clean. An agent left unmatched still imports, but their orders carry no salesperson and
          pay nobody — so the list below is worth finishing.
        </p>

        <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Agent in the file</th>
                <th className="right">Orders</th>
                <th className="right">Value</th>
                <th className="w-72">Salesperson</th>
              </tr>
            </thead>
            <tbody>
              {agentsInPeriod.map(a => (
                <tr key={a.key} className={agentMap[a.key] ? '' : 'bg-danger-bg/30'}>
                  <td>
                    <span className="text-ink">{a.name}</span>
                    {a.name !== a.key ? (
                      <span className="ml-2 font-mono text-[0.6rem] text-muted">{a.key}</span>
                    ) : null}
                  </td>
                  <td className="num">{a.orders}</td>
                  <td className="num">{formatMoney(a.total)}</td>
                  <td>
                    <select
                      value={agentMap[a.key] ?? ''}
                      onChange={e =>
                        setAgentMap(m => ({ ...m, [a.key]: e.target.value }))
                      }
                      aria-label={`Match ${a.name}`}
                      className="w-full px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink"
                    >
                      <option value="">— not a salesperson / skip —</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.code ? ` · ${s.code}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staff.length === 0 ? (
          <p className="font-serif italic text-danger text-sm mt-3">
            There are no salespeople to match against yet. Add them under HR → Staff with a
            commission department first.
          </p>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-6 mb-5">
          <label className="inline-flex items-center gap-2 text-sm font-sans text-graphite">
            <input
              type="checkbox"
              checked={saveAliases}
              onChange={e => setSaveAliases(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Remember these matches for next month
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-sans text-graphite">
            <input
              type="checkbox"
              checked={suggestOpenBills}
              onChange={e => setSuggestOpenBills(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Suggest the 1st/2nd/3rd bill of each day from the document numbers
          </label>
        </div>

        {unmatched.length > 0 ? (
          <p className="font-serif italic text-danger text-sm mb-3">
            {unmatched.length} agent(s) still unmatched: {unmatched.map(a => a.name).join(', ')}.
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={commit}
            disabled={pending || selection.selected.length === 0}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {pending
              ? 'Importing…'
              : `Import ${selection.selected.length} orders into ${period.slice(0, 7)}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage('upload')
              setParsed(null)
            }}
            className="text-sm font-sans text-muted hover:text-ink"
          >
            Choose a different file
          </button>
        </div>
        <p className="font-serif italic text-muted text-xs mt-3 max-w-2xl">
          Importing replaces whatever was imported for this month before — the previous batch is
          retired, not merged.
        </p>
      </section>
    </div>
  )
}

function toDto(o: ErpSalesOrder): ImportOrderDto {
  return {
    orderNo: o.orderNo,
    orderDate: o.orderDate,
    eventDate: o.eventDate,
    periodMonth: o.periodMonth,
    debtorCode: o.debtorCode,
    customerName: o.customerName,
    agentName: o.agentName,
    agentKey: o.agentKey,
    location: o.location,
    orderTotal: o.orderTotal,
    balance: o.balance,
    sequenceInDay: o.sequenceInDay,
    lines: o.lines.map(l => ({
      lineNo: l.lineNo,
      itemGroup: l.itemGroup,
      itemCode: l.itemCode,
      productName: l.description,
      description2: l.description2,
      uom: l.uom,
      location: l.location,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineAmount: l.lineAmount,
    })),
  }
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
      {error}
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-hairline rounded-md bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{label}</div>
      <div className={`num text-xl ${accent ? 'text-accent' : 'text-num-ink'}`}>{value}</div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <>
      <dt className="text-graphite">{label}</dt>
      <dd className={`num ${warn ? 'text-danger' : 'text-num-ink'}`}>{value}</dd>
    </>
  )
}
