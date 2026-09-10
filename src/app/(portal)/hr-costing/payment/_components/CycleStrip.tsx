import { formatMoneyBare } from '@/lib/utils'

export interface StripCell {
  n: string
  title: string
  state: 'done' | 'now' | 'wait'
  stateText: string
  amount: number
  sub: string
  /** The plain sentence under the figure — who, where, when. */
  say?: string
  /** True on the one cell the reader should act on. */
  current?: boolean
}

interface Props {
  cells: StripCell[]
  /** The strip is the page's one dark object (tone walnut). */
  dark: boolean
}

/**
 * The cycle strip — four cells that read the run state (submitted → funded →
 * salary PVs → statutory). This IS the "detect": nothing to click, it is
 * derived from payroll_runs, the funding requests and the vouchers. Each cell
 * carries the state in words, the figure, and one sentence that names the
 * account and the day (BambooHR / ADP's "cash required" pattern).
 */
export default function CycleStrip({ cells, dark }: Props) {
  return (
    <div className={`pay-strip${dark ? ' hero-walnut' : ''}`}>
      {cells.map((c) => (
        <div key={c.n} className={`pay-cell${c.current ? ' now' : ''}${c.state === 'wait' ? ' wait' : ''}`}>
          <div className="t">
            <i>{c.n}</i>
            {c.title}
          </div>
          <div className={`st ${c.state}`}>
            {c.state === 'done' ? '✓ ' : ''}
            {c.stateText}
          </div>
          <div className="amt">
            <small>RM</small>
            {formatMoneyBare(c.amount)}
          </div>
          <div className="sub">{c.sub}</div>
          {c.say ? <div className="say">{c.say}</div> : null}
        </div>
      ))}
    </div>
  )
}
