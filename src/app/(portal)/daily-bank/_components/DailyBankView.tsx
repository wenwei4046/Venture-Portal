'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { DB_COLUMNS, DB_COLUMN_LABELS, type BankDay, type SegAmounts } from '@/lib/daily-bank'
import type { DailyBankData } from '@/lib/daily-bank-data'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import PhoneCards, { type PhoneCard } from '@/components/treasury/PhoneCards'
import { useToast } from '@/components/treasury/Toast'

// Daily Bank on the sheet (2026-10-09, the user's Claude Design handoff —
// Phase 3 of the Finance revamp). The head carries the day between ← and →
// (the label opens a calendar), and PNG / PDF / Get image. Five cards sum the
// day: Balance B/F, Received today, Pending payment, Total available, Banks.
// The board — what an image or the PNG captures — is a sheet section:
//   Bank × Department: per bank a band with its Balance B/F, money received
//   today in green, each payment awaiting the Principal in brown parentheses
//   with its PV and description, then the Available balance row on green; a
//   foot sums what every bank has free.
//   By bank: one table per bank — who paid in and who is waiting to be paid.
// Negatives are red parentheses, a zero is a dash (the user's other system).

// Dynamic departments (2026-08-24): the column set travels in the payload
// (six cores + one per provisioned full dept). Set by the top component each
// render; the nested row components read it synchronously.
let COLS: Array<{ key: string; label: string }> = DB_COLUMNS.map((k) => ({ key: k as string, label: DB_COLUMN_LABELS[k] }))

// Row totals MUST sum over the payload columns, not lib sumAmounts: that
// helper reads the server module's dynamic-column state, which is EMPTY in
// the browser — with IT provisioned, the HLB Available row footed 4,841.53
// high (user report 2026-09-04) while the cells themselves were right.
const sumCols = (a: SegAmounts): number => Math.round(COLS.reduce((s, c) => s + (a[c.key] ?? 0), 0) * 100) / 100
const r2 = (n: number) => Math.round(n * 100) / 100

/** A board figure: a dash for zero, red parentheses below zero, else in the
 *  tone it is given (money in green, pending brown). */
function Fig({ n, kind, dash = true }: { n: number; kind?: 'in' | 'pend'; dash?: boolean }) {
  if (n === 0 && dash) return <span className="db-dash">—</span>
  if (kind === 'pend') return <span className="db-pend">({formatMoneyBare(Math.abs(n))})</span>
  if (n < 0) return <span className="db-neg">({formatMoneyBare(Math.abs(n))})</span>
  return <span className={kind === 'in' ? 'db-in' : undefined}>{formatMoneyBare(n)}</span>
}

export default function DailyBankView({ data, today, canExport = false }: { data: DailyBankData; today: string; canExport?: boolean }) {
  if (data.columns?.length) COLS = data.columns
  const router = useRouter()
  const [view, setView] = useState<'matrix' | 'banks'>('matrix')
  const [busy, setBusy] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)
  const { say, toast } = useToast()

  const date = data.date
  const isToday = date === today
  const go = (d: string) => router.push(`/daily-bank?date=${d}`)
  const dayLabel = `${isToday ? 'Today · ' : ''}${dayjs(date).format('D MMM YYYY')}`

  // The day in five figures.
  const sumOver = (pick: (b: BankDay) => SegAmounts) => r2(data.banks.reduce((s, b) => s + sumCols(pick(b)), 0))
  const bf = sumOver((b) => b.bf)
  const received = sumOver((b) => b.inToday)
  const pending = sumOver((b) => b.pendingTotal)
  const receiptCount = data.banks.reduce((s, b) => s + b.receipts.length, 0)
  const pendingCount = data.banks.reduce((s, b) => s + b.pending.length, 0)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  const captureBlob = async (): Promise<Blob | null> => {
    const node = captureRef.current
    if (!node) return null
    const { toBlob } = await import('html-to-image')
    // Scroll containers ruin the shot two ways (user 2026-09-04 ×2): columns
    // scrolled out of view are clipped, and a container that still scrolls in
    // the clone paints a scrollbar and eats ~17px off its last row (the
    // half-cut Total available line). So: make EVERY scrolling descendant
    // non-scrolling, widen the node to the widest content, measure after the
    // reflow, pass explicit width/height, and restore whatever happens.
    const restore: Array<() => void> = []
    const descendants = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))]
    let fullWidth = node.clientWidth
    for (const el of descendants) {
      fullWidth = Math.max(fullWidth, el.scrollWidth)
      const cs = getComputedStyle(el)
      if (['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)) {
        const prev = { overflow: el.style.overflow, overflowX: el.style.overflowX, overflowY: el.style.overflowY }
        el.style.overflow = 'visible'
        el.style.overflowX = 'visible'
        el.style.overflowY = 'visible'
        restore.push(() => {
          el.style.overflow = prev.overflow
          el.style.overflowX = prev.overflowX
          el.style.overflowY = prev.overflowY
        })
      }
    }
    const prevNode = { width: node.style.width, maxWidth: node.style.maxWidth }
    node.style.width = `${fullWidth}px`
    node.style.maxWidth = 'none'
    restore.push(() => {
      node.style.width = prevNode.width
      node.style.maxWidth = prevNode.maxWidth
    })
    // Reflow with the new styles, then shoot at the true content size.
    const w = Math.ceil(Math.max(node.scrollWidth, node.offsetWidth))
    const h = Math.ceil(Math.max(node.scrollHeight, node.offsetHeight))
    try {
      // The board sits on the white sheet; the image keeps it white.
      return await toBlob(node, { pixelRatio: 2, width: w, height: h, backgroundColor: '#ffffff' })
    } finally {
      restore.forEach((f) => f())
    }
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

  // 2026-10-10 — the handoff: the copy is confirmed in a toast, not an alert box.
  const copyImage = async () => {
    setBusy(true)
    try {
      const blob = await captureBlob()
      if (!blob) return
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      say('Image copied — paste it straight into WhatsApp/Telegram.')
    } catch {
      say('Copy not supported in this browser — use the PNG button instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · DAILY BANK
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">Daily Bank</h1>
            <div className="db-daynav">
              <button type="button" aria-label="Previous day" title="Previous day" onClick={() => go(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}>
                ←
              </button>
              <span className="db-daynav-label">
                {dayLabel}
                <input
                  type="date"
                  aria-label="Pick a day"
                  value={date}
                  max={today}
                  onChange={(e) => e.target.value && go(e.target.value)}
                />
              </span>
              <button
                type="button"
                aria-label="Next day"
                title="Next day"
                disabled={date >= today}
                onClick={() => go(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}
              >
                →
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isToday ? (
            <button type="button" className="btn-quiet-sheet" onClick={() => go(today)}>
              Today
            </button>
          ) : null}
          <button type="button" className="btn-quiet-sheet" disabled={busy} onClick={downloadPng}>
            PNG
          </button>
          {canExport ? (
            <a className="btn-quiet-sheet" href={`/daily-bank/export?date=${date}`}>
              PDF
            </a>
          ) : null}
          <button type="button" className="btn-pri-sheet" disabled={busy} onClick={copyImage} title="Copy the board as an image — paste into chat apps">
            {busy ? '…' : 'Get image'}
          </button>
        </div>
      </div>

      <StatCards label="Daily Bank">
        <StatCard label="Balance B/F" value={formatMoney(bf)} icon="wallet" note="GL-exact, start of day" />
        <StatCard
          tone={received > 0 ? 'ledger' : 'default'}
          label="Received today"
          value={formatMoney(received)}
          icon="in"
          note={receiptCount > 0 ? plural(receiptCount, 'receipt', 'receipts') : received > 0 ? 'by JV / transfer' : 'nothing in yet'}
        />
        <StatCard
          tone={pending > 0 ? 'wait' : 'default'}
          label="Pending payment"
          value={formatMoney(pending)}
          icon="clock"
          note={pendingCount > 0 ? `${pendingCount} awaiting Principal` : 'nothing waiting'}
        />
        <StatCard tone="primary" label="Total available" value={formatMoney(data.totals.grand ?? 0)} icon="bank" note="Cash truly free" />
        <StatCard label="Banks" value={String(data.banks.length)} icon="building" note={plural(COLS.length, 'department', 'departments')} />
      </StatCards>

      <SlidingTabs
        items={[
          { key: 'matrix', label: 'Bank × Department' },
          { key: 'banks', label: 'By bank', count: data.banks.length },
        ]}
        active={view}
        onTabChange={(key) => setView(key as 'matrix' | 'banks')}
        variant="control"
      />

      {/* The board — what Get image and PNG capture. Its long reading note is
          gone (2026-10-12, user: the descriptions made the view messy). */}
      <div ref={captureRef} className="dbank">
        {view === 'matrix' ? <MatrixView data={data} label={dayLabel} /> : <BanksView data={data} />}
      </div>
      {toast}
    </div>
  )
}

function SectHead({ title, count }: { title: string; count: ReactNode }) {
  return (
    <div className="sect-head">
      <h2>{title}</h2>
      <span className="rule" aria-hidden />
      <span className="count">{count}</span>
    </div>
  )
}

// ── Bank × Department ──────────────────────────────────────────────────────
// On a phone the wide table becomes a card per bank (the handoff's phone
// board): what the bank has free, the B/F → in → pending walk under it, a
// line per department that moved, and what waits on the Principal.
const walk = (bf: number, inToday: number, pend: number) =>
  `B/F ${formatMoneyBare(bf)}${inToday ? ` · +${formatMoneyBare(inToday)}` : ''}${pend ? ` · −${formatMoneyBare(pend)}` : ''}`

function PhoneBoard({ data }: { data: DailyBankData }) {
  return (
    <div className="db-phone md:hidden">
      {data.banks.map((b) => {
        const depts = COLS.filter((c) => (b.bf[c.key] ?? 0) !== 0 || (b.inToday[c.key] ?? 0) !== 0 || (b.pendingTotal[c.key] ?? 0) !== 0)
        return (
          <div key={b.bankId} className="db-card">
            <div className="db-card-head">
              <div className="db-card-line">
                <span className="db-card-name">{b.bankName}</span>
                <span className="db-card-avail">
                  <Fig n={sumCols(b.available)} dash={false} />
                </span>
              </div>
              <div className="db-card-line db-card-small">
                <span>{walk(sumCols(b.bf), sumCols(b.inToday), sumCols(b.pendingTotal))}</span>
                <span>Available</span>
              </div>
            </div>
            {depts.map((c) => (
              <div key={c.key} className="db-card-dept">
                <div className="min-w-0">
                  <div className="db-card-dept-name">{c.label}</div>
                  <div className="db-card-small">{walk(b.bf[c.key] ?? 0, b.inToday[c.key] ?? 0, b.pendingTotal[c.key] ?? 0)}</div>
                </div>
                <span className="db-card-figure">
                  <Fig n={b.available[c.key] ?? 0} dash={false} />
                </span>
              </div>
            ))}
            {b.pending.length > 0 ? (
              <div className="db-card-pend">
                <div className="db-card-pend-head">Pending · awaiting Principal</div>
                {b.pending.map((p, i) => (
                  <div key={i} className="db-card-pend-row">
                    <span className="db-card-pend-who">
                      {p.payee}{' '}
                      <span className="db-card-small">
                        · {COLS.filter((c) => (p.amounts[c.key] ?? 0) !== 0).map((c) => c.label).join(', ')}
                      </span>
                    </span>
                    <Fig n={p.total} kind="pend" dash={false} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
      <div className="db-card-total">
        <span>Total available</span>
        <Fig n={data.totals.grand ?? 0} dash={false} />
      </div>
    </div>
  )
}

function MatrixView({ data, label }: { data: DailyBankData; label: string }) {
  return (
    <section className="db-section">
      <SectHead title="Bank × Department" count={label.toUpperCase()} />
      <PhoneBoard data={data} />
      <div className="db-box hidden md:block">
        <table className="ledger-table db-matrix">
          <thead>
            <tr>
              <th className="db-label-col">Bank \ Dept</th>
              {COLS.map((col) => (
                <th key={col.key} className="num">
                  {col.label}
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.banks.map((b) => (
              <BankRows key={b.bankId} b={b} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total available</td>
              {COLS.map((col) => (
                <td key={col.key} className="num">
                  <Fig n={data.totals.available[col.key] ?? 0} dash={false} />
                </td>
              ))}
              <td className="num">
                <Fig n={data.totals.grand ?? 0} dash={false} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function BankRows({ b }: { b: BankDay }) {
  return (
    <>
      <tr className="db-band">
        <td>{b.bankName} · Balance B/F</td>
        {COLS.map((col) => (
          <td key={col.key} className="num">
            <Fig n={b.bf[col.key] ?? 0} />
          </td>
        ))}
        <td className="num">
          <Fig n={sumCols(b.bf)} dash={false} />
        </td>
      </tr>
      {sumCols(b.inToday) !== 0 ? (
        <tr className="db-indent">
          <td>· Received today</td>
          {COLS.map((col) => (
            <td key={col.key} className="num">
              <Fig n={b.inToday[col.key] ?? 0} kind="in" />
            </td>
          ))}
          <td className="num">
            <Fig n={sumCols(b.inToday)} kind="in" dash={false} />
          </td>
        </tr>
      ) : null}
      {b.pending.map((p, i) => (
        <tr key={i} className="db-indent">
          <td>
            <span className="db-payee">· {p.payee}</span> <span className="chip alert db-tag">Pending</span>
            <span className="db-sub">
              {p.voucherNo}
              {p.description ? ` · ${p.description}` : ''}
            </span>
          </td>
          {COLS.map((col) => (
            <td key={col.key} className="num">
              <Fig n={p.amounts[col.key] ?? 0} kind="pend" />
            </td>
          ))}
          <td className="num">
            <Fig n={p.total} kind="pend" dash={false} />
          </td>
        </tr>
      ))}
      <tr className="db-avail">
        <td>⌊ Available balance</td>
        {COLS.map((col) => (
          <td key={col.key} className="num">
            <Fig n={b.available[col.key] ?? 0} />
          </td>
        ))}
        <td className="num">
          <Fig n={sumCols(b.available)} dash={false} />
        </td>
      </tr>
    </>
  )
}

// ── By bank ────────────────────────────────────────────────────────────────
// On a phone each bank reads as a stacked list (2026-10-10, the handoff's
// phone list) instead of a table that scrolls sideways: who paid in, in
// green, who waits to be paid, in brown parentheses, the PV and description
// as labelled details, and the Available (after pending) at its foot.
function BankPhoneList({ b }: { b: BankDay }) {
  const cards: PhoneCard[] = [{ key: 'bf', band: true, title: 'Balance B/F', figure: <Fig n={sumCols(b.bf)} dash={false} /> }]
  if (sumCols(b.inToday) !== 0) {
    cards.push({ key: 'in', title: <span className="db-in">Received today</span>, figure: <Fig n={sumCols(b.inToday)} kind="in" /> })
  }
  b.receipts.forEach((r, i) =>
    cards.push({
      key: `r${i}`,
      title: `· ${r.payer}`,
      figure: <Fig n={r.amount} kind="in" />,
      figureLabel: 'Received (RM)',
      details: [
        { label: 'PV No.', value: r.voucherNo },
        { label: 'Description', value: r.description },
      ],
    }),
  )
  if (b.otherInToday !== 0) {
    cards.push({ key: 'other', title: '· Other (JV / transfer)', figure: <Fig n={b.otherInToday} kind="in" />, figureLabel: 'Received (RM)' })
  }
  b.pending.forEach((p, i) =>
    cards.push({
      key: `p${i}`,
      title: <span className="db-pend-name">· {p.payee}</span>,
      figure: <Fig n={p.total} kind="pend" />,
      figureLabel: 'Pending payment (RM)',
      details: [
        { label: 'PV No.', value: p.voucherNo },
        { label: 'Description', value: p.description },
      ],
    }),
  )
  return (
    <div className="md:hidden">
      <PhoneCards label={b.bankName} cards={cards} foot={{ label: 'Available (after pending)', value: <Fig n={sumCols(b.available)} dash={false} /> }} />
    </div>
  )
}

function BanksView({ data }: { data: DailyBankData }) {
  return (
    <>
      {data.banks.map((b) => (
        <section key={b.bankId} className="db-section">
          <SectHead title={b.bankName} count={`BANK BALANCE ${formatMoney(sumCols(b.current))}`} />
          <BankPhoneList b={b} />
          <div className="db-box hidden md:block">
            <table className="ledger-table db-bybank">
              <thead>
                <tr>
                  <th className="db-label-col">Pay to</th>
                  <th>PV No.</th>
                  <th>Description</th>
                  <th className="num">Received (RM)</th>
                  <th className="num">Pending payment (RM)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="db-band">
                  <td>Balance B/F</td>
                  <td />
                  <td />
                  <td />
                  <td className="num">
                    <Fig n={sumCols(b.bf)} dash={false} />
                  </td>
                </tr>
                {sumCols(b.inToday) !== 0 ? (
                  <tr>
                    <td className="db-in">Received today</td>
                    <td />
                    <td />
                    <td className="num">
                      <Fig n={sumCols(b.inToday)} kind="in" />
                    </td>
                    <td />
                  </tr>
                ) : null}
                {b.receipts.map((r, i) => (
                  <tr key={`r${i}`} className="db-indent">
                    <td>· {r.payer}</td>
                    <td className="db-vno">{r.voucherNo}</td>
                    <td className="db-desc">{r.description}</td>
                    <td className="num">
                      <Fig n={r.amount} kind="in" />
                    </td>
                    <td />
                  </tr>
                ))}
                {b.otherInToday !== 0 ? (
                  <tr className="db-indent">
                    <td>· Other (JV / transfer)</td>
                    <td />
                    <td />
                    <td className="num">
                      <Fig n={b.otherInToday} kind="in" />
                    </td>
                    <td />
                  </tr>
                ) : null}
                {b.pending.map((p, i) => (
                  <tr key={`p${i}`} className="db-indent">
                    <td className="db-pend-name">· {p.payee}</td>
                    <td className="db-vno">{p.voucherNo}</td>
                    <td className="db-desc">{p.description}</td>
                    <td />
                    <td className="num">
                      <Fig n={p.total} kind="pend" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Available (after pending)</td>
                  <td className="num">
                    <Fig n={sumCols(b.available)} dash={false} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}
