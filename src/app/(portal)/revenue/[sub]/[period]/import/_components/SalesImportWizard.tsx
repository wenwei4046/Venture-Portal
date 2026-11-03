'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import { PRODUCT_LIST_PATH, revenuePath } from '@/lib/revenue'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
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
import { Select } from '@/components/hrv/select'

interface Props {
  period: string
  subDepartmentId: string
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
export default function SalesImportWizard({ period, subDeptSlug, subDepartmentId, staff, aliases }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<'upload' | 'review' | 'done'>('upload')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ErpParseResult | null>(null)
  const [agentMap, setAgentMap] = useState<Record<string, string>>({})
  const [saveAliases, setSaveAliases] = useState(true)
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
          subDepartmentId,
          periodMonth: period,
          fileName,
          sheetName: parsed.sheetName || null,
          rowCount: parsed.orders.reduce((a, o) => a + o.lines.length, 0),
          outOfPeriodCount: selection.outOfPeriod,
          cancelledCount: selection.cancelled,
          orders: selection.selected.map(toDto),
          agentMap,
          saveAliases,
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
        <div className="border border-hairline rounded-card bg-surface-2 px-6 py-10 text-center">
          <p className="text-md font-bold mb-2">Choose the sales-order export.</p>
          <p className="text-sm mb-5 max-w-lg mx-auto">
            The whole file is read here in your browser first. Nothing is written until you have
            seen which month it covers, what will be dropped, and who every agent is.
          </p>
          {/* The page's one primary action — a label, so the file picker it
              wraps opens on a click anywhere on the button. */}
          <label className="inline-block bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control cursor-pointer transition-colors">
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
        <div>
          {/* What the import wrote. The orders it brought in are the figure the
              page ends on — the sheet's one walnut card; the two gaps turn red
              only while lines are missing a cost or a brand. */}
          <StatCards label="What the import wrote">
            <StatCard label="Orders imported" value={String(result.orderCount)} icon="receipt" tone="primary" />
            <StatCard label="Order lines" value={String(result.lineCount)} icon="layers" />
            <StatCard
              label="Lines without a cost"
              value={String(result.linesWithoutCost)}
              icon="file-alert"
              tone={result.linesWithoutCost > 0 ? 'danger' : undefined}
            />
            <StatCard
              label="Lines without a brand"
              value={String(result.linesWithoutBrand)}
              icon="alert"
              tone={result.linesWithoutBrand > 0 ? 'danger' : undefined}
            />
          </StatCards>

          {result.linesWithoutCost > 0 ? (
            <p className="sheet-warning max-w-2xl">
              Those lines have no cost, so their bills have no margin and the below-margin penalty
              will be skipped on them. Fill the gaps in{' '}
              <Link href={PRODUCT_LIST_PATH} className="text-accent hover:underline">
                the Product List
              </Link>
              , or key a margin straight onto the affected orders.
            </p>
          ) : null}

          {result.unmatchedAgents.length > 0 ? (
            <p className="sheet-warning max-w-2xl">
              {result.unmatchedAgents.length} agent(s) are still unmatched, so their orders carry no
              salesperson and will not pay commission: {result.unmatchedAgents.join(', ')}.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={revenuePath(subDeptSlug, period)}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
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
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
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
        {/* What the file holds, and what of it this month keeps — the kept
            count is the figure the review turns on: the sheet's walnut card. */}
        <StatCards label="What the file contains">
          <StatCard label="Orders in file" value={String(parsed.orders.length)} icon="upload" />
          <StatCard
            label={`Kept for ${period.slice(0, 7)}`}
            value={String(selection.selected.length)}
            icon="check"
            tone="primary"
          />
          <StatCard label="Other months" value={String(selection.outOfPeriod)} icon="calendar" />
          <StatCard label="Cancelled" value={String(selection.cancelled)} icon="file-alert" />
        </StatCards>

        {parsed.periods.length > 1 ? (
          <p className="sheet-notice">
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

        <div className="overflow-x-auto">
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
        <p className="text-sm mb-4 max-w-3xl">
          The export names the salesperson in free text with no code, and the names are not always
          clean. An agent left unmatched still imports, but their orders carry no salesperson and
          pay nobody — so the list below is worth finishing.
        </p>

        <div className="overflow-x-auto">
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
                // An unmatched agent's row keeps its red wash. `!` because the
                // table's zebra and hover rules outrank a plain utility, which
                // would otherwise wash out every other unmatched row.
                <tr key={a.key} className={agentMap[a.key] ? '' : '!bg-danger-bg/30'}>
                  <td>
                    <span className="font-medium">{a.name}</span>
                    {a.name !== a.key ? (
                      <span className="ml-2 font-mono text-[10px]">{a.key}</span>
                    ) : null}
                  </td>
                  <td className="num">{a.orders}</td>
                  <td className="num">{formatMoney(a.total)}</td>
                  <td>
                    <Select bare
                      value={agentMap[a.key] ?? ''}
                      onChange={e =>
                        setAgentMap(m => ({ ...m, [a.key]: e.target.value }))
                      }
                      aria-label={`Match ${a.name}`}
                      className="w-full px-2 py-1 bg-surface border border-hairline rounded-control text-sm text-ink"
                    >
                      <option value="">— not a salesperson / skip —</option>
                      {staff.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.code ? ` · ${s.code}` : ''}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {staff.length === 0 ? (
          <p className="sheet-warning">
            There are no salespeople to match against yet. Add them under HR → Staff with a
            commission department first.
          </p>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-6 mb-5">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveAliases}
              onChange={e => setSaveAliases(e.target.checked)}
              className="h-4 w-4"
            />
            Remember these matches for next month
          </label>
        </div>

        {unmatched.length > 0 ? (
          <p className="sheet-warning">
            {unmatched.length} agent(s) still unmatched: {unmatched.map(a => a.name).join(', ')}.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={commit}
            disabled={pending || selection.selected.length === 0}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
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
            className="text-sm hover:underline"
          >
            Choose a different file
          </button>
        </div>
        <p className="text-xs mt-3 max-w-2xl">
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
