import { formatMoney } from '@/lib/utils'

// "In vs Out" (2026-10-09, the user's Claude Design handoff): the month as a
// pie — In #3F7A64, Out #E99A53 — beside twelve months of paired bars, drawn
// in plain CSS as the prototype draws them (no chart library), each month's
// figures on hover.

const IN = '#3F7A64'
const OUT = '#E99A53'

export interface TrendMonth {
  /** Short month name, e.g. "Oct". */
  label: string
  in: number
  out: number
}

/** A round top for the axis: 1, 2, 2.5 or 5 × a power of ten, at least the largest bar. */
function niceTop(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= max) return step * pow
  return 10 * pow
}

function tick(v: number): string {
  if (v >= 1_000_000) return `RM ${Math.round((v / 1_000_000) * 100) / 100}m`
  if (v >= 1000) return `RM ${Math.round(v / 1000)}k`
  return `RM ${Math.round(v)}`
}

export default function InOutCharts({ monthIn, monthOut, trend }: { monthIn: number; monthOut: number; trend: TrendMonth[] }) {
  const total = monthIn + monthOut
  const inShare = total > 0 ? monthIn / total : 0
  const pie = total > 0 ? `conic-gradient(${IN} 0 ${inShare * 360}deg, ${OUT} ${inShare * 360}deg 360deg)` : 'rgb(236 234 229)'
  const top = niceTop(Math.max(0, ...trend.map((m) => Math.max(m.in, m.out))))
  const withData = trend.filter((m) => m.in > 0 || m.out > 0).length
  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div className="vp-charts">
      <div className="vp-panel">
        <h3>In vs Out</h3>
        <div className="vp-sub">This month</div>
        <div className="vp-pie" style={{ background: pie }} role="img" aria-label={`In ${pct(inShare)}, out ${pct(total > 0 ? 1 - inShare : 0)}`} />
        <div className="vp-legend">
          <div>
            <div className="vp-key">
              <span className="vp-swatch" style={{ background: IN }} />
              In · {total > 0 ? pct(inShare) : '—'}
            </div>
            <div className="vp-fig" style={{ color: IN }}>
              {formatMoney(monthIn)}
            </div>
          </div>
          <div>
            <div className="vp-key">
              <span className="vp-swatch" style={{ background: OUT }} />
              Out · {total > 0 ? pct(1 - inShare) : '—'}
            </div>
            <div className="vp-fig" style={{ color: '#B8691F' }}>
              {formatMoney(monthOut)}
            </div>
          </div>
        </div>
      </div>

      <div className="vp-panel">
        <h3>12-month In/Out</h3>
        <div className="vp-sub">
          Venture Pool — money flowing in and out by month · {withData} of {trend.length} months have data
        </div>
        <div className="vp-bars-wrap">
          <div className="vp-ticks" aria-hidden>
            {[1, 0.75, 0.5, 0.25, 0].map((p) => (
              <span key={p}>{tick(top * p)}</span>
            ))}
          </div>
          <div className="vp-plot">
            <div className="vp-bars">
              {trend.map((m) => (
                <div key={m.label} className="vp-month" title={`${m.label} · in ${formatMoney(m.in)} · out ${formatMoney(m.out)}`}>
                  <div className="vp-bar in" style={{ height: `${(m.in / top) * 100}%` }} />
                  <div className="vp-bar out" style={{ height: `${(m.out / top) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="vp-months">
              {trend.map((m) => (
                <span key={m.label}>{m.label}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="vp-keys">
          <span>
            <span className="vp-swatch" style={{ background: IN }} />
            In
          </span>
          <span>
            <span className="vp-swatch" style={{ background: OUT }} />
            Out
          </span>
        </div>
      </div>
    </div>
  )
}
