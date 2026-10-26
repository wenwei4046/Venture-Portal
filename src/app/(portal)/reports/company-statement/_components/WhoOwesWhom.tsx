'use client'

// Who owes whom (2026-10-26, from the samples — the user: "who owes whom 这个可以，但是没有 amount 的要显示 '-'"):
// each counterparty's to-repay to the left in red and its to-collect to the right in green, its net beside, the most
// to collect at the top. Pointing at a row shows each side's count, principal, interest and total (the user's A).

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatMoneyBare } from '@/lib/utils'
import type { CounterpartyRow, StatementTotals } from '@/lib/counterparty-statement'
import { toCollect, toRepay } from '@/lib/counterparty-statement-view'

const nil = (n: number) => Math.abs(n) < 0.005
const amount = (n: number) => (nil(n) ? <span className="cs-dim">—</span> : formatMoneyBare(n))
const netText = (n: number) => (nil(n) ? 'Even' : `${n > 0 ? 'Collect' : 'Repay'} ${formatMoneyBare(Math.abs(n))}`)
const netTone = (n: number) => (nil(n) ? '' : n > 0 ? ' is-collect' : ' is-repay')

interface Pointed {
  row: CounterpartyRow
  x: number
  y: number
}

/** The box by the pointer, on the page's body clear of anything that clips (it brings the sheet's palette along). */
function Tip({ at }: { at: Pointed }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width: w, height: h } = el.getBoundingClientRect()
    let x = at.x + 18
    let y = at.y + 18
    if (x + w > window.innerWidth - 8) x = at.x - w - 18
    if (y + h > window.innerHeight - 8) y = at.y - h - 18
    setPos({ left: Math.max(8, x), top: Math.max(8, y) })
  }, [at])
  const g = at.row
  const nCollect = g.items.filter((i) => i.side === 'collect').length
  const nRepay = g.items.length - nCollect
  const side = (word: string, tone: string, count: number, principal: number, interest: number, total: number) => (
    <>
      <tr className={`is-sec ${tone}`}>
        <td>
          {word} · {count}
        </td>
        <td className="n">{amount(total)}</td>
      </tr>
      {count > 0 ? (
        <>
          <tr>
            <td className="ind">Principal</td>
            <td className="n">{amount(principal)}</td>
          </tr>
          <tr>
            <td className="ind">Interest</td>
            <td className="n">{amount(interest)}</td>
          </tr>
        </>
      ) : null}
    </>
  )
  return createPortal(
    <div className="sheet-theme contents">
      <div ref={box} className="dept-tip cs-tip" role="tooltip" style={pos ?? { left: -9999, top: 0 }}>
        <h6>
          {g.counterparty}
          <span>RM</span>
        </h6>
        <table>
          <tbody>
            {side('To collect', 'is-collect', nCollect, g.collectPrincipal, g.collectInterest, toCollect(g))}
            {side('To repay', 'is-repay', nRepay, g.repayPrincipal, g.repayInterest, toRepay(g))}
            <tr className="is-net">
              <td>Net</td>
              <td className={`n${netTone(g.net)}`}>{netText(g.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  )
}

export default function WhoOwesWhom({ rows, totals }: { rows: CounterpartyRow[]; totals: StatementTotals }) {
  const [at, setAt] = useState<Pointed | null>(null)
  if (rows.length === 0) return null
  const list = [...rows].sort((a, b) => b.net - a.net)
  const most = Math.max(1, ...list.map((g) => Math.max(toCollect(g), toRepay(g))))
  const collect = Math.round((totals.collectPrincipal + totals.collectInterest) * 100) / 100
  const repay = Math.round((totals.repayPrincipal + totals.repayInterest) * 100) / 100
  return (
    <section className="mb-6" aria-label="Who owes whom">
      <div className="sect-head">
        <h2>Who owes whom</h2>
        <span className="rule" aria-hidden />
        <span className="count">{rows.length} COUNTERPARTIES · PRINCIPAL + INTEREST · RM</span>
      </div>
      <div className="cs-who">
        <div className="cs-who-row cs-who-head" aria-hidden>
          <span>To repay</span>
          <span />
          <span>Counterparty</span>
          <span />
          <span>To collect</span>
          <span>Net</span>
        </div>
        {list.map((g) => {
          const c = toCollect(g)
          const r = toRepay(g)
          return (
            <div
              key={g.counterparty}
              className="cs-who-row"
              data-cp={g.counterparty}
              onMouseMove={(e) => setAt({ row: g, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setAt(null)}
            >
              <span className="cs-who-amt is-repay">{amount(r)}</span>
              <span className="cs-who-bar is-repay" aria-hidden>
                <i style={{ width: `${(r / most) * 100}%` }} />
              </span>
              <span className="cs-who-name">{g.counterparty}</span>
              <span className="cs-who-bar is-collect" aria-hidden>
                <i style={{ width: `${(c / most) * 100}%` }} />
              </span>
              <span className="cs-who-amt is-collect">{amount(c)}</span>
              <span className={`cs-who-net${netTone(g.net)}`}>{netText(g.net)}</span>
            </div>
          )
        })}
        <div className="cs-who-row cs-who-foot">
          <span className="cs-who-amt is-repay">{amount(repay)}</span>
          <span />
          <span className="cs-who-name">Total</span>
          <span />
          <span className="cs-who-amt is-collect">{amount(collect)}</span>
          <span className={`cs-who-net${netTone(totals.net)}`}>{netText(totals.net)}</span>
        </div>
        <div className="cs-who-keys">
          <span>
            <i className="is-repay" />
            To repay
          </span>
          <span>
            <i className="is-collect" />
            To collect
          </span>
          <span className="cs-dim">Most to collect at the top · point at a row for its figures</span>
        </div>
      </div>
      {at ? <Tip at={at} /> : null}
    </section>
  )
}
