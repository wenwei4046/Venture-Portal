'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import type { TbBlock, TbItem } from '@/lib/trial-balance-groups'

// The Trial Balance in groups (2026-10-09, the user's Claude Design handoff):
// As at, Show zero, Find account and Detail level on one row; the accounts by
// type, each type's under their top-level parent. L1 shows each type's total,
// L2 adds the parents, L3 opens them to every account (a parent can be folded
// by hand). Find highlights; nothing is hidden, so every total still covers
// the whole report.

const money = (v: number) => (v > 0.005 ? formatMoneyBare(v) : '—')

function AccountLink({ item }: { item: TbItem }) {
  return (
    <Link href={`/reports/ledger?code=${encodeURIComponent(item.code)}`} className="text-ink hover:text-accent">
      {item.code} · {item.name}
    </Link>
  )
}

export default function TrialBalanceView({
  asOf,
  showZero,
  blocks,
  totals,
}: {
  asOf: string
  showZero: boolean
  blocks: TbBlock[]
  totals: { debit: number; credit: number }
}) {
  const [level, setLevel] = useState<1 | 2 | 3>(3)
  const [find, setFind] = useState('')
  const [closed, setClosed] = useState<Set<string>>(() => new Set())
  const needle = find.trim().toLowerCase()
  const hit = (i: { code: string; name: string }) => !!needle && (i.code.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle))
  const hits = needle ? blocks.flatMap((b) => b.groups.flatMap((g) => g.items)).filter(hit).length : 0

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div>
      {/* As at and Show zero reload the page through a plain GET form (as the
          page always did); Find and the level stay on the page. */}
      <form className="rpt-toolbar" role="group" aria-label="Report controls" method="get" action="/reports/trial-balance">
        <label className="rpt-field">
          <span>As at</span>
          <input type="date" name="as_of" aria-label="As at" defaultValue={asOf} onChange={(e) => e.currentTarget.value && e.currentTarget.form?.requestSubmit()} />
        </label>
        <label className="rpt-field">
          <span>Show</span>
          <span className="flex items-center gap-2 h-8 normal-case tracking-normal text-[13px] font-normal text-ink">
            <input type="checkbox" name="show_zero" value="1" defaultChecked={showZero} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            Zero-balance accounts
          </span>
        </label>
        <div className="rpt-field rpt-find">
          <span>Find account</span>
          <div className="rpt-find-box">
            <input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                // Enter would send the form; Find stays on the page.
                if (e.key === 'Enter') e.preventDefault()
                if (e.key === 'Escape') setFind('')
              }}
              placeholder="Code or name…"
              aria-label="Find account"
              className="search-plain"
            />
            {needle ? <small>{hits === 0 ? 'No match' : `${hits} ${hits === 1 ? 'match' : 'matches'}`}</small> : null}
          </div>
        </div>
        <div className="rpt-field">
          <span>Detail level</span>
          <div className="rpt-levels">
            {([
              [1, 'Each type’s total'],
              [2, '+ the parent accounts'],
              [3, 'Every account'],
            ] as const).map(([l, title]) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} title={title}>
                L{l}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div className="table-frame max-w-4xl">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="right">Debit</th>
                <th className="right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <Fragment key={b.type}>
                  {level >= 2 ? (
                    <tr className="tb-block">
                      <td colSpan={3}>{b.title}</td>
                    </tr>
                  ) : null}
                  {level >= 2
                    ? b.groups.map((g) => {
                        const key = `${b.type}:${g.code}`
                        const single = g.items.length === 1 && g.items[0].code === g.code
                        if (single) {
                          const item = g.items[0]
                          return (
                            <tr key={key} className={hit(item) ? 'search-row-hit' : undefined}>
                              <td>
                                <AccountLink item={item} />
                              </td>
                              <td className="num">{money(item.debit)}</td>
                              <td className="num">{money(item.credit)}</td>
                            </tr>
                          )
                        }
                        const anyHit = g.items.some(hit)
                        const open = level >= 3 && (!closed.has(key) || anyHit)
                        if (!open) {
                          return (
                            <tr key={key} className={`tb-group${anyHit ? ' search-row-hit' : ''}`}>
                              <td>
                                {level >= 3 ? (
                                  <button type="button" className="tb-toggle" aria-expanded={false} onClick={() => toggle(key)}>
                                    <span aria-hidden>▶</span>
                                    <span>{g.name}</span>
                                  </button>
                                ) : (
                                  <span>{g.name}</span>
                                )}
                              </td>
                              <td className="num">{money(g.debit)}</td>
                              <td className="num">{money(g.credit)}</td>
                            </tr>
                          )
                        }
                        return (
                          <Fragment key={key}>
                            <tr className="tb-group">
                              <td colSpan={3}>
                                <button type="button" className="tb-toggle" aria-expanded onClick={() => toggle(key)}>
                                  <span aria-hidden>▼</span>
                                  <span>{g.name}</span>
                                </button>
                              </td>
                            </tr>
                            {g.items.map((item) => (
                              <tr key={item.code} className={hit(item) ? 'search-row-hit' : undefined}>
                                <td className="tb-indent">
                                  <AccountLink item={item} />
                                </td>
                                <td className="num">{money(item.debit)}</td>
                                <td className="num">{money(item.credit)}</td>
                              </tr>
                            ))}
                            <tr className="tb-sub">
                              <td className="tb-indent">Subtotal</td>
                              <td className="num">{money(g.debit)}</td>
                              <td className="num">{money(g.credit)}</td>
                            </tr>
                          </Fragment>
                        )
                      })
                    : null}
                  <tr className="tb-total">
                    <td>{b.total}</td>
                    <td className="num">{money(b.debit)}</td>
                    <td className="num">{money(b.credit)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="rpt-all">
                <td>Total</td>
                <td className="num">{formatMoneyBare(totals.debit)}</td>
                <td className="num">{formatMoneyBare(totals.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
