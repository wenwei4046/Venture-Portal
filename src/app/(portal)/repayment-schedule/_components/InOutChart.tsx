'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import type { Basis, HistMonth } from '@/lib/schedule-by-company'
import s from './by-company.module.css'

// The six months to this one (2026-11-13 — the user: "我需要很清晰的看到每个月we pay 和we collect 后的公司是赚还是亏",
// "两个都可以做成我去选择要看什么", "6个月"): what we collect up in green, what we pay down in red, the net a dashed line
// with its figure over each month; Interest only (principal left out) or Cash (principal + interest); actual or by right
// as the page's switch says.

const r2 = (n: number) => Math.round(n * 100) / 100
const k = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k` : String(Math.round(n)))
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatMoney(Math.abs(n))}`

export default function InOutChart({ history, basis }: { history: HistMonth[]; basis: Basis }) {
  const [view, setView] = useState<'interest' | 'cash'>('interest')
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const isI = view === 'interest'
  const isA = basis === 'act'
  const rows = history.map((h) => {
    const v = h[basis]
    return { ym: h.ym, i: isI ? v.interestIn : v.cashIn, o: isI ? v.interestOut : v.cashOut }
  })

  const W = 960
  const H = 300
  const L = 50
  const R = 12
  const T = 46
  const B = 30
  const max = Math.max(1, ...rows.map((r) => Math.max(r.i, r.o))) * 1.05
  const mag = Math.pow(10, Math.floor(Math.log10(max / 2)))
  const tick = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((v) => v * 2 >= max) ?? max / 2
  const top = tick * 2
  const half = (H - T - B) / 2
  const mid = T + half
  const y = (v: number) => mid - (v / top) * half
  const cw = (W - L - R) / Math.max(rows.length, 1)
  const bw = Math.min(36, cw * 0.26)
  const pts = rows.map((r, i) => ({ x: L + cw * i + cw / 2, y: y(r.i - r.o), n: r2(r.i - r.o) }))
  const last = rows.length - 1

  const sumI = r2(rows.reduce((t, r) => t + r.i, 0))
  const sumO = r2(rows.reduce((t, r) => t + r.o, 0))
  const up = rows.filter((r) => r.i >= r.o).length
  const t = tip ? rows[tip.i] : null

  return (
    <section className={s.trend} aria-label="The last six months">
      <div className={s.trendHead}>
        <div>
          <h3 className={s.trendTitle}>
            {isI ? 'Interest profit' : 'Cash in and out'}, last {rows.length} months · {isA ? 'actual' : 'by right'}
          </h3>
          <div className={s.trendSub}>
            {isA ? 'What really came in and went out in each month' : 'What fell due in each month, paid or not'} ·{' '}
            {isI ? 'interest only, principal left out' : 'principal + interest'}
          </div>
        </div>
        <div className={s.seg} role="group" aria-label="What the chart shows">
          <button type="button" aria-pressed={isI} onClick={() => setView('interest')}>
            Interest only
          </button>
          <button type="button" aria-pressed={!isI} onClick={() => setView('cash')}>
            Cash (principal + interest)
          </button>
        </div>
      </div>
      <div className={s.legend}>
        <span>
          <i style={{ background: 'rgb(var(--fv-chip-ledger-ink) / 0.78)' }} />
          In · we collect
        </span>
        <span>
          <i style={{ background: 'rgb(var(--fv-chip-danger-ink) / 0.68)' }} />
          Out · we pay
        </span>
        <span>
          <i style={{ background: 'var(--ds-ink)', borderRadius: '50%' }} />
          Net (in − out)
        </span>
      </div>
      <div className={s.chart} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="In, out and net by month">
          {[-top, -tick, tick, top].map((v) => (
            <g key={v}>
              <line className={s.grid} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
              <text className={s.axis} x={L - 6} y={y(v) + 4} textAnchor="end">
                {v > 0 ? '' : '−'}
                {k(Math.abs(v))}
              </text>
            </g>
          ))}
          <line className={s.zero} x1={L} x2={W - R} y1={mid} y2={mid} />
          <text className={s.axis} x={L - 6} y={mid + 4} textAnchor="end">
            0
          </text>
          {rows.map((r, i) => {
            const cx = L + cw * i + cw / 2
            const cur = i === last
            return (
              <g
                key={r.ym}
                className={s.col}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement?.parentElement ?? e.currentTarget).getBoundingClientRect()
                  setTip({ i, x: e.clientX - box.left, y: e.clientY - box.top - 10 })
                }}
              >
                {cur ? <rect className={s.band} x={L + cw * i + 4} y={T - 40} width={cw - 8} height={H - T - B + 58} rx={10} /> : null}
                <rect className={s.hit} x={L + cw * i} y={T - 40} width={cw} height={H - T - B + 58} />
                <rect className={s.barIn} x={cx - bw - 2} y={y(r.i)} width={bw} height={Math.max(0, mid - y(r.i))} rx={4} />
                <rect className={s.barOut} x={cx + 2} y={mid} width={bw} height={Math.max(0, y(-r.o) - mid)} rx={4} />
                <text className={cur ? s.monCur : s.mon} x={cx} y={H - 8} textAnchor="middle">
                  {dayjs(`${r.ym}-01`).format('MMM')}
                  {cur ? (isA ? ' · so far' : ' · now') : ''}
                </text>
              </g>
            )
          })}
          <polyline className={s.netLine} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />
          {pts.map((p) => (
            <g key={p.x} pointerEvents="none">
              <circle className={p.n >= 0 ? s.dotUp : s.dotDown} cx={p.x} cy={p.y} r={4.5} />
              <text className={p.n >= 0 ? s.netUp : s.netDown} x={p.x} y={T - 22} textAnchor="middle">
                {p.n >= 0 ? '+' : '−'}
                {k(Math.abs(p.n))}
              </text>
            </g>
          ))}
        </svg>
        {tip && t ? (
          <div className={s.tip} style={{ left: tip.x, top: tip.y }}>
            {dayjs(`${t.ym}-01`).format('MMM YYYY')}
            <br />
            In <b>{formatMoney(t.i)}</b>
            <br />
            Out <b>{formatMoney(t.o)}</b>
            <br />
            Net <b className={t.i - t.o >= 0 ? s.tipUp : s.tipDown}>{signed(r2(t.i - t.o))}</b> {t.i - t.o >= 0 ? 'in profit' : 'at a loss'}
          </div>
        ) : null}
      </div>
      <div className={s.sumrow}>
        <span>
          {rows.length} months in <b>{formatMoney(sumI)}</b>
        </span>
        <span>
          out <b>{formatMoney(sumO)}</b>
        </span>
        <span>
          net <b className={sumI >= sumO ? s.good : s.bad}>{signed(r2(sumI - sumO))}</b>
        </span>
        <span>
          <b>{up}</b> of {rows.length} months {isI ? 'in profit' : 'more in than out'}
        </span>
      </div>
    </section>
  )
}
