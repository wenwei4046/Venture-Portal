'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import {
  DB_COLUMNS,
  DB_COLUMN_LABELS,
  sumAmounts,
  type BankDay,
  type SegAmounts,
} from '@/lib/daily-bank'
import type { DailyBankData } from '@/lib/daily-bank-data'

const money = (n: number) => formatMoneyBare(Math.abs(n))

// House rendering for the board: negatives in red parentheses (matches the
// user's other system), zeros as an em dash in matrix cells.
function Cell({ n, zeroDash = true, tone }: { n: number; zeroDash?: boolean; tone?: string }) {
  if (n === 0 && zeroDash) return <span className="text-muted">—</span>
  if (n < 0) return <span className="text-danger">({money(n)})</span>
  return <span className={tone}>{money(n)}</span>
}

const v = (token: string) => `rgb(var(${token}))`

export default function DailyBankView({ data, today }: { data: DailyBankData; today: string }) {
  const router = useRouter()
  const [view, setView] = useState<'matrix' | 'banks'>('matrix')
  const [busy, setBusy] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  const go = (d: string) => router.push(`/daily-bank?date=${d}`)
  const date = data.date
  const dayLabel = dayjs(date).format('ddd · DD/MM/YYYY')

  const captureBlob = async (): Promise<Blob | null> => {
    const node = captureRef.current
    if (!node) return null
    const { toBlob } = await import('html-to-image')
    return toBlob(node, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#faf5ea',
    })
  }

  const downloadPng = async () => {
    setBusy(true)
    try {
      const blob = await captureBlob()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `daily-bank-${date}.png`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  const copyImage = async () => {
    setBusy(true)
    try {
      const blob = await captureBlob()
      if (!blob) return
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      alert('Image copied — paste it straight into WhatsApp/Telegram.')
    } catch {
      alert('Copy not supported in this browser — use the PNG button instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => go(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-md"
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          onChange={e => e.target.value && go(e.target.value)}
          className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        />
        <button
          type="button"
          onClick={() => go(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-md"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => go(today)}
          disabled={date === today}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Today
        </button>

        <span className="flex-1" />

        <div className="inline-flex rounded-md border border-hairline overflow-hidden">
          <button
            type="button"
            onClick={() => setView('matrix')}
            className={`text-sm font-serif italic px-3 py-1.5 ${view === 'matrix' ? 'bg-accent text-white' : 'bg-surface text-ink hover:bg-surface-2'}`}
          >
            Bank × Department
          </button>
          <button
            type="button"
            onClick={() => setView('banks')}
            className={`text-sm font-serif italic px-3 py-1.5 ${view === 'banks' ? 'bg-accent text-white' : 'bg-surface text-ink hover:bg-surface-2'}`}
          >
            By bank
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={copyImage}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
          title="Copy the board as an image — paste into chat apps"
        >
          {busy ? '…' : 'Get image'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={downloadPng}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          PNG
        </button>
        <a
          href={`/daily-bank/export?date=${date}`}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-1.5 rounded-md"
        >
          PDF
        </a>
      </div>

      {/* ── Capture area ── */}
      <div ref={captureRef} className="bg-paper">
        <div
          className="rounded-t-md px-5 py-3 flex items-baseline justify-between"
          style={{ backgroundColor: v('--ink'), color: v('--paper') }}
        >
          <span className="font-sans text-sm font-semibold tracking-[0.2em]">
            {view === 'matrix' ? 'BANK × DEPARTMENT' : 'BANK BALANCE AVAILABLE'}
          </span>
          <span className="font-mono text-xs">{dayLabel}</span>
        </div>

        {view === 'matrix' ? <MatrixView data={data} /> : <BanksView data={data} />}

        <p className="font-sans text-[11px] text-muted leading-relaxed px-5 py-3 border border-t-0 border-hairline rounded-b-md">
          Each department column reads top→bottom: <b>Balance B/F</b> (balance up to the day
          before) → <b>Received today</b> (green) → <b>Pending</b> unpaid items (orange · payee +
          PV, submitted and awaiting the Principal, deducted from the department set on the PV) →
          <b>Available balance</b> (green) = current balance − pending. <b>Paid items are already
          deducted</b> from the balance (not listed separately). <b>Venture</b> covers corporate +
          treasury (fund in/out) + anything untagged. Today&apos;s columns tie to the Dept Pool
          page&apos;s per-bank breakdown — the inter-billing gap is folded into the primary bank.
          The bottom <b>Total available</b> adds up every bank&apos;s available across departments
          — the cash truly free. Past dates are GL-only (no inter-billing fold-in) with the
          pending list rebuilt from submit/approve timestamps — both approximate.
        </p>
      </div>
    </div>
  )
}

// ── Matrix: BANK × DEPARTMENT ───────────────────────────────────────────────
function MatrixView({ data }: { data: DailyBankData }) {
  return (
    <div className="overflow-x-auto border border-t-0 border-hairline">
      <table className="w-full text-[13px] font-mono tabular">
        <thead>
          <tr className="border-b border-hairline">
            <th className="text-left font-sans text-[11px] tracking-wider text-muted px-4 py-2">
              BANK \ DEPT
            </th>
            {DB_COLUMNS.map(c => (
              <th
                key={c}
                className="text-right font-sans text-[11px] tracking-wider text-muted px-3 py-2"
              >
                {DB_COLUMN_LABELS[c].toUpperCase()}
              </th>
            ))}
            <th className="text-right font-sans text-[11px] tracking-wider text-ink px-4 py-2">
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody>
          {data.banks.map(b => (
            <BankMatrixRows key={b.bankId} b={b} />
          ))}
          <tr style={{ backgroundColor: v('--ledger-bg') }}>
            <td className="px-4 py-2 font-sans font-semibold text-ledger">Total available</td>
            {DB_COLUMNS.map(c => (
              <td key={c} className="text-right px-3 py-2 font-semibold">
                <Cell n={data.totals.available[c]} zeroDash={false} tone="text-ink" />
              </td>
            ))}
            <td className="text-right px-4 py-2 font-semibold text-ledger">
              <Cell n={data.totals.grand} zeroDash={false} tone="text-ledger" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function AmountRow({
  label,
  amounts,
  strong = false,
  tone,
  bg,
}: {
  label: React.ReactNode
  amounts: SegAmounts
  strong?: boolean
  tone?: string
  bg?: string
}) {
  return (
    <tr className="border-b border-hairline" style={bg ? { backgroundColor: v(bg) } : undefined}>
      <td className={`px-4 py-2 font-sans ${strong ? 'font-semibold text-ink' : 'text-graphite'}`}>
        {label}
      </td>
      {DB_COLUMNS.map(c => (
        <td key={c} className={`text-right px-3 py-2 ${strong ? 'font-semibold' : ''}`}>
          <Cell n={amounts[c]} tone={tone} />
        </td>
      ))}
      <td className={`text-right px-4 py-2 ${strong ? 'font-semibold' : ''}`}>
        <Cell n={sumAmounts(amounts)} zeroDash={false} tone={tone} />
      </td>
    </tr>
  )
}

function BankMatrixRows({ b }: { b: BankDay }) {
  return (
    <>
      <AmountRow label={<b>{b.bankName} · Balance B/F</b>} amounts={b.bf} strong />
      {sumAmounts(b.inToday) !== 0 ? (
        <AmountRow label="· Received today" amounts={b.inToday} tone="text-ledger" />
      ) : null}
      {b.pending.map((p, i) => (
        <tr key={i} className="border-b border-hairline">
          <td className="px-4 py-2 font-sans text-graphite">
            <span className="text-ink">· {p.payee}</span>{' '}
            <span className="font-mono text-[11px] text-muted">{p.voucherNo}</span>{' '}
            <span className="font-serif italic text-muted">
              {p.description.length > 42 ? `${p.description.slice(0, 40)}…` : p.description}
            </span>{' '}
            <span
              className="font-sans text-[10px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: v('--alert-bg'), color: v('--alert') }}
            >
              Pending
            </span>
          </td>
          {DB_COLUMNS.map(c => (
            <td key={c} className="text-right px-3 py-2">
              {p.amounts[c] !== 0 ? (
                <span className="text-alert">({money(p.amounts[c])})</span>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
          ))}
          <td className="text-right px-4 py-2">
            <span className="text-alert">({money(p.total)})</span>
          </td>
        </tr>
      ))}
      <AmountRow
        label={<span className="text-ledger">⌊ Available balance</span>}
        amounts={b.available}
        tone="text-ink"
        bg="--ledger-bg"
      />
    </>
  )
}

// ── Simple: one section per bank ────────────────────────────────────────────
function BanksView({ data }: { data: DailyBankData }) {
  return (
    <div className="border border-t-0 border-hairline">
      {data.banks.map(b => (
        <div key={b.bankId} className="border-b border-hairline last:border-b-0">
          <div
            className="px-5 py-2 flex items-baseline justify-between"
            style={{ backgroundColor: v('--surface-2') }}
          >
            <span className="font-serif text-base text-ink">{b.bankName}</span>
            <span className="font-mono text-sm text-ink">
              Bank Balance&nbsp;&nbsp;<b>{formatMoneyBare(sumAmounts(b.current))}</b>
            </span>
          </div>
          <table className="w-full text-[13px] font-mono tabular">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left font-sans text-[11px] tracking-wider text-muted px-5 py-1.5">PAY TO</th>
                <th className="text-left font-sans text-[11px] tracking-wider text-muted px-3 py-1.5">PV NO.</th>
                <th className="text-left font-sans text-[11px] tracking-wider text-muted px-3 py-1.5">DESCRIPTION</th>
                <th className="text-right font-sans text-[11px] tracking-wider text-muted px-3 py-1.5">RECEIVED (RM)</th>
                <th className="text-right font-sans text-[11px] tracking-wider text-muted px-5 py-1.5">PENDING PAYMENT (RM)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-hairline">
                <td className="px-5 py-1.5 font-sans text-ink">Balance B/F</td>
                <td /><td /><td />
                <td className="text-right px-5 py-1.5">
                  <Cell n={sumAmounts(b.bf)} zeroDash={false} />
                </td>
              </tr>
              {sumAmounts(b.inToday) !== 0 ? (
                <tr className="border-b border-hairline">
                  <td className="px-5 py-1.5 font-sans text-ledger">Received today</td>
                  <td /><td />
                  <td className="text-right px-3 py-1.5 text-ledger">
                    {formatMoneyBare(sumAmounts(b.inToday))}
                  </td>
                  <td />
                </tr>
              ) : null}
              {b.receipts.map((r, i) => (
                <tr key={`r${i}`} className="border-b border-hairline">
                  <td className="px-5 py-1.5 font-sans text-graphite">&nbsp;&nbsp;· {r.payer}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted">{r.voucherNo}</td>
                  <td className="px-3 py-1.5 font-serif italic text-muted">{r.description}</td>
                  <td className="text-right px-3 py-1.5 text-ledger">{formatMoneyBare(r.amount)}</td>
                  <td />
                </tr>
              ))}
              {b.otherInToday !== 0 ? (
                <tr className="border-b border-hairline">
                  <td className="px-5 py-1.5 font-sans text-graphite">&nbsp;&nbsp;· Other (JV / transfer)</td>
                  <td /><td />
                  <td className="text-right px-3 py-1.5 text-ledger">{formatMoneyBare(b.otherInToday)}</td>
                  <td />
                </tr>
              ) : null}
              {b.pending.map((p, i) => (
                <tr key={`p${i}`} className="border-b border-hairline">
                  <td className="px-5 py-1.5 font-sans text-alert">· {p.payee}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted">{p.voucherNo}</td>
                  <td className="px-3 py-1.5 font-serif italic text-graphite">{p.description}</td>
                  <td />
                  <td className="text-right px-5 py-1.5 text-alert">{formatMoneyBare(p.total)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: v('--ledger-bg') }}>
                <td className="px-5 py-2 font-sans font-semibold text-ledger" colSpan={4}>
                  Available (after pending)
                </td>
                <td className="text-right px-5 py-2 font-semibold">
                  <Cell n={sumAmounts(b.available)} zeroDash={false} tone="text-ledger" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
