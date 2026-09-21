import { formatMoneyBare } from '@/lib/utils'
import type { TermsChangeComparison } from '@/lib/treasury-terms'

// 差价 of one 从某月起 change: the old plan carried on vs the new plan, month
// by month, with what was actually paid for the months already reached.
// Pure JSX — rendered by the record detail pages (server) and the Company
// Statement (client) alike.

const pct = (r: number) => `${(r * 100).toFixed(3)}%`
const money = (n: number) => (Math.abs(n) < 0.005 ? '—' : formatMoneyBare(n))
const signed = (n: number) => (Math.abs(n) < 0.005 ? '—' : `${n > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(n))}`)

export function TermsChangeSummary({ c }: { c: TermsChangeComparison }) {
  const monthsLabel = (m: number | null) => (m == null ? 'no fixed term' : `${m}mo`)
  return (
    <div className="font-sans text-sm text-graphite">
      <span className="font-mono text-ink">{c.fromYM}</span> onward:{' '}
      <span className="font-mono">{pct(c.old.rate)}</span> → <span className="font-mono text-ink">{pct(c.new.rate)}</span>
      {' · '}
      {monthsLabel(c.old.months)} → <span className="text-ink">{monthsLabel(c.new.months)}</span>
      {c.old.endYM || c.new.endYM ? (
        <>
          {' · '}ends <span className="font-mono">{c.old.endYM ?? '—'}</span> → <span className="font-mono text-ink">{c.new.endYM ?? '—'}</span>
        </>
      ) : null}
      {' · '}base <span className="font-mono text-ink">RM {formatMoneyBare(c.new.base)}</span>
      {c.reason ? <span className="italic text-muted"> · {c.reason}</span> : null}
      {c.rows.length > 0 ? (
        <div className="mt-1">
          monthly <span className="font-mono">{formatMoneyBare(c.old.principalPerMonth + c.old.interestPerMonth)}</span> →{' '}
          <span className="font-mono text-ink">{formatMoneyBare(c.new.principalPerMonth + c.new.interestPerMonth)}</span>
          {' · '}remaining interest <span className="font-mono">{formatMoneyBare(c.totals.oldInterest)}</span> →{' '}
          <span className="font-mono text-ink">{formatMoneyBare(c.totals.newInterest)}</span>{' '}
          <span className={`font-mono ${c.totals.diffInterest > 0 ? 'text-danger' : c.totals.diffInterest < 0 ? 'text-ledger' : 'text-muted'}`}>
            ({signed(c.totals.diffInterest)})
          </span>
          {c.totals.shortfall > 0.005 ? (
            <>
              {' · '}
              <span className="text-danger">short RM {formatMoneyBare(c.totals.shortfall)} on months already due</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 italic text-muted">compounding — the balance rolls on at the new rate from {c.fromYM}</div>
      )}
    </div>
  )
}

export function TermsChangeTable({ c }: { c: TermsChangeComparison }) {
  if (c.rows.length === 0) return null
  const hasPaid = c.rows.some((r) => r.paidPrincipal != null)
  const th = 'text-right py-1 px-2 font-medium'
  const td = 'py-1 px-2 text-right font-mono tabular'
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
            <th className="text-left py-1 px-2 font-medium">Month</th>
            <th className={th}>Old principal</th>
            <th className={th}>Old interest</th>
            <th className={`${th} border-l border-hairline`}>New principal</th>
            <th className={th}>New interest</th>
            <th className={`${th} border-l border-hairline`}>Δ interest</th>
            <th className={th}>Δ total</th>
            {hasPaid ? (
              <>
                <th className={`${th} border-l border-hairline`}>Paid</th>
                <th className={th}>Shortfall</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.ym} className="border-b border-hairline/60">
              <td className="py-1 px-2 font-mono text-ink">{r.ym}</td>
              <td className={`${td} text-graphite`}>{money(r.oldPrincipal)}</td>
              <td className={`${td} text-graphite`}>{money(r.oldInterest)}</td>
              <td className={`${td} text-ink border-l border-hairline`}>{money(r.newPrincipal)}</td>
              <td className={`${td} text-ink`}>{money(r.newInterest)}</td>
              <td className={`${td} border-l border-hairline ${r.diffInterest > 0 ? 'text-danger' : r.diffInterest < 0 ? 'text-ledger' : 'text-muted'}`}>{signed(r.diffInterest)}</td>
              <td className={`${td} ${r.diffTotal > 0 ? 'text-danger' : r.diffTotal < 0 ? 'text-ledger' : 'text-muted'}`}>{signed(r.diffTotal)}</td>
              {hasPaid ? (
                <>
                  <td className={`${td} text-graphite border-l border-hairline`}>
                    {r.paidPrincipal == null ? '' : money(r.paidPrincipal + (r.paidInterest ?? 0))}
                  </td>
                  <td className={`${td} ${(r.shortfall ?? 0) > 0.005 ? 'text-danger' : (r.shortfall ?? 0) < -0.005 ? 'text-ledger' : 'text-muted'}`}>
                    {r.shortfall == null ? '' : signed(r.shortfall)}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
          <tr className="bg-surface/60 font-semibold">
            <td className="py-1 px-2 font-sans italic text-graphite">Total</td>
            <td className={`${td} text-graphite`}>{money(c.totals.oldTotal - c.totals.oldInterest)}</td>
            <td className={`${td} text-graphite`}>{money(c.totals.oldInterest)}</td>
            <td className={`${td} text-ink border-l border-hairline`}>{money(c.totals.newTotal - c.totals.newInterest)}</td>
            <td className={`${td} text-ink`}>{money(c.totals.newInterest)}</td>
            <td className={`${td} border-l border-hairline ${c.totals.diffInterest > 0 ? 'text-danger' : c.totals.diffInterest < 0 ? 'text-ledger' : 'text-muted'}`}>{signed(c.totals.diffInterest)}</td>
            <td className={`${td} ${c.totals.diffTotal > 0 ? 'text-danger' : c.totals.diffTotal < 0 ? 'text-ledger' : 'text-muted'}`}>{signed(c.totals.diffTotal)}</td>
            {hasPaid ? (
              <>
                <td className={`${td} border-l border-hairline`} />
                <td className={`${td} ${c.totals.shortfall > 0.005 ? 'text-danger' : 'text-muted'}`}>{signed(c.totals.shortfall)}</td>
              </>
            ) : null}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
