'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { figuresOf, openOf, type Basis, type CoDeal, type Company, type Figures } from '@/lib/schedule-by-company'
import s from './by-company.module.css'

// We collect and We pay as one table, a row a company (2026-11-13, the mockup approved: "照这个做"): what we collect
// from it and pay it, the net, the interest profit, what is still owed from earlier months; ▸ opens its deals, each
// marked Collect or Pay. Actual (the default) reads what came in and went out; By right what the month asks — the
// page's one switch, for the cards, the chart and this table. More columns from Columns: received / paid so far, the
// interest each way, the next instalment, the last repayment, what is owed both ways (a sign to contra).

const EPS = 0.005
const signed = (n: number) => (Math.abs(n) < EPS ? '—' : `${n > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(n))}`)
const bare = (n: number) => (Math.abs(n) < EPS ? '—' : formatMoneyBare(n))
const day = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

type Extra = 'sofar' | 'pi' | 'next' | 'last' | 'pos'
const EXTRAS: Array<{ key: Extra; label: string }> = [
  { key: 'sofar', label: 'Received / paid so far (actual)' },
  { key: 'pi', label: 'Interest in / out' },
  { key: 'next', label: 'Next due' },
  { key: 'last', label: 'Last received / paid' },
  { key: 'pos', label: 'Total owed both ways' },
]
const COLS_KEY = 'repayment.by-company.columns'

type Filter = 'all' | 'both' | 'late' | 'loss'
type SortKey = 'name' | 'collect' | 'pay' | 'net' | 'profit' | 'earlier'

/** The cards over the tabs, as the switch says. */
export function ByCompanyCards({ companies, basis, month }: { companies: Company[]; basis: Basis; month: string }) {
  const deals = companies.flatMap((c) => c.deals)
  const f = figuresOf(deals, basis)
  const open = openOf(deals)
  const mon = dayjs(`${month}-01`).format('MMM')
  const profitCard = (note: string) => (
    <StatCard
      key="profit"
      tone={f.profit >= 0 ? 'ledger' : 'danger'}
      label={`Interest profit · ${mon}`}
      value={signed(f.profit) === '—' ? formatMoney(0) : `${f.profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(f.profit))}`}
      icon={f.profit >= 0 ? 'check' : 'alert'}
      note={note}
    />
  )
  const netCard = (note: string) => (
    <StatCard
      key="net"
      tone="primary"
      label={`Net cash · ${mon}`}
      value={`${f.net < 0 ? '−' : ''}${formatMoney(Math.abs(f.net))}`}
      icon="swap"
      note={note}
    />
  )
  return (
    <StatCards label="Repayment Schedule" size="small">
      {basis === 'act'
        ? [
            <StatCard key="in" tone="in" label={`Received · ${mon}`} value={formatMoney(f.collect)} icon="inbox" note="Really came in this month" />,
            <StatCard key="out" tone="out" label={`Paid · ${mon}`} value={formatMoney(f.pay)} icon="send" note="Really went out this month" />,
            netCard('Received − paid (principal + interest)'),
            profitCard(`Interest received ${formatMoney(f.interestIn)} − paid ${formatMoney(f.interestOut)}`),
            <StatCard key="open" label={`Still open · ${mon}`} value={`${formatMoneyBare(open.collect)} / ${formatMoneyBare(open.pay)}`} icon="clock" note="To collect / to pay, not yet settled" />,
          ]
        : [
            <StatCard key="in" tone="in" label={`To collect · ${mon}`} value={formatMoney(f.collect)} icon="inbox" note="Due this month + earlier unpaid" />,
            <StatCard key="out" tone="out" label={`To pay · ${mon}`} value={formatMoney(f.pay)} icon="send" note="Due this month + earlier unpaid" />,
            netCard('Collect − pay (principal + interest)'),
            profitCard(`If all due is settled: in ${formatMoney(f.interestIn)} − out ${formatMoney(f.interestOut)}`),
            <StatCard
              key="settled"
              label={`Settled so far · ${mon}`}
              value={open.settledShare == null ? '—' : `${Math.round(open.settledShare * 100)}%`}
              icon="check"
              note="Of everything due, both ways"
            />,
          ]}
    </StatCards>
  )
}

export default function ByCompany({
  companies,
  basis,
  monthLong,
  canRecord = false,
}: {
  companies: Company[]
  basis: Basis
  /** "November 2026" */
  monthLong: string
  /** Treasury · Create: a deal's record form. */
  canRecord?: boolean
}) {
  const A = basis === 'act'
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [extra, setExtra] = useState<Extra[]>([])
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(COLS_KEY) ?? '[]') as Extra[]
      if (Array.isArray(v)) setExtra(v.filter((x) => EXTRAS.some((e) => e.key === x)))
    } catch {
      // Private mode — the columns simply are not kept.
    }
  }, [])
  const toggleExtra = (key: Extra) => {
    const next = extra.includes(key) ? extra.filter((x) => x !== key) : [...extra, key]
    setExtra(next)
    try {
      window.localStorage.setItem(COLS_KEY, JSON.stringify(next))
    } catch {
      // Private mode.
    }
  }
  const has = (k: Extra) => extra.includes(k)

  const figs = useMemo(() => new Map(companies.map((c) => [c.name, figuresOf(c.deals, basis)])), [companies, basis])
  const fig = (c: Company) => figs.get(c.name) as Figures
  const counts = {
    all: companies.length,
    both: companies.filter((c) => c.both).length,
    late: companies.filter((c) => fig(c).earlier >= EPS).length,
    loss: companies.filter((c) => fig(c).profit <= -EPS).length,
  }
  const q = query.trim().toLowerCase()
  const shown = companies
    .filter((c) => (filter === 'both' ? c.both : filter === 'late' ? fig(c).earlier >= EPS : filter === 'loss' ? fig(c).profit <= -EPS : true))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.deals.some((d) => `${d.tag ?? ''} ${d.words}`.toLowerCase().includes(q)))
    .sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir
      return (fig(a)[sort.key] - fig(b)[sort.key]) * sort.dir || a.name.localeCompare(b.name)
    })
  const total = (k: keyof Figures) => shown.reduce((t, c) => t + fig(c)[k], 0)
  const position = shown.reduce((t, c) => t + c.position, 0)

  const th = (label: string, key: SortKey | null, num = false) => (
    <th
      data-num={num ? 'true' : undefined}
      data-sort={key ?? undefined}
      aria-sort={key && sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      onClick={key ? () => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 })) : undefined}
    >
      {label}
      {key ? (
        <span className={s.sortGlyph} data-on={sort.key === key ? 'true' : undefined}>
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      ) : null}
    </th>
  )
  const tone = (n: number) => (n >= EPS ? s.good : n <= -EPS ? s.bad : s.quiet)

  const dealRow = (d: CoDeal) => {
    const c1 = d.side === 'collect'
    const fig = A ? d.got : d.due
    const intr = A ? d.gotInterest : d.dueInterest
    const owedNow = d.open
    return (
      <tr key={`${d.side}:${d.id}`} className={s.deal}>
        <td className={s.dealCell}>
          <span className={`${s.side} ${c1 ? s.sideCollect : s.sidePay}`}>{c1 ? 'Collect' : 'Pay'}</span>
          {d.href ? (
            <Link href={d.href} className={s.dealTag}>
              {d.tag ?? (c1 ? 'Loan' : 'Fund source')}
            </Link>
          ) : (
            <span className={s.dealTag}>{d.tag ?? (c1 ? 'Loan' : 'Fund source')}</span>
          )}
          {d.pending ? <span className="chip wait ml-2">pending PV</span> : null}
          <div className={s.sub}>{d.words}</div>
        </td>
        <td className={s.num}>{c1 ? bare(fig) : ''}</td>
        <td className={s.num}>{c1 ? '' : bare(fig)}</td>
        <td className={s.num} />
        <td className={`${s.num} ${tone(c1 ? intr : -intr)}`}>{signed(c1 ? intr : -intr)}</td>
        <td className={`${s.num} ${d.earlier >= EPS ? s.bad : s.quiet}`}>{bare(d.earlier)}</td>
        {has('sofar') ? (
          <>
            <td className={s.num}>{c1 ? bare(d.got) : ''}</td>
            <td className={s.num}>{c1 ? '' : bare(d.got)}</td>
          </>
        ) : null}
        {has('pi') ? <td className={s.num}>{`P ${formatMoneyBare(Math.max(0, fig - intr))} · I ${formatMoneyBare(intr)}`}</td> : null}
        {has('next') ? <td>{d.next ? `${dayjs(d.next.due).format('D MMM')} · ${formatMoneyBare(d.next.amount)}` : '—'}</td> : null}
        {has('last') ? <td>{day(d.last)}</td> : null}
        {has('pos') ? <td className={s.num}>{bare(d.owe)}</td> : null}
        <td className="text-right whitespace-nowrap">
          {canRecord && !d.pending && owedNow >= EPS && d.href ? (
            <Link href={`${d.href}${c1 ? '#repayment-form' : '#repay_principal'}`} className="sch-row-btn border-0">
              {c1 ? 'Record receipt' : 'Record payment'}
            </Link>
          ) : null}
        </td>
      </tr>
    )
  }

  const chip = (key: Filter, label: string, n: number) => (
    <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={filter === key ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
      {label} · {n}
    </button>
  )

  return (
    <section className="mb-8">
      <div className={s.chips} role="group" aria-label="Show">
        {chip('all', 'All', counts.all)}
        {chip('both', 'Both sides', counts.both)}
        {chip('late', 'Earlier unpaid', counts.late)}
        {chip('loss', 'Losing this month', counts.loss)}
      </div>
      <div className={s.panel}>
        <div className={s.tools}>
          <div className={s.tHead}>
            <span className={s.tTitle}>By company</span>
            <span className={s.tCount}>
              {shown.length} {shown.length === 1 ? 'company' : 'companies'} · {monthLong} · {A ? 'actual' : 'by right'}
            </span>
          </div>
          <input className={s.search} placeholder="Search company or deal" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search company or deal" />
          <div className={s.colWrap}>
            <button type="button" className={s.colBtn} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              ▥ Columns{extra.length ? ` · ${extra.length} more` : ''}
            </button>
            {menu ? (
              <>
                <div className={s.away} onClick={() => setMenu(false)} aria-hidden="true" />
                <div className={s.colMenu} role="menu">
                  <div className={s.colMenuHint}>Add columns</div>
                  {EXTRAS.map((e) => (
                    <label key={e.key}>
                      <input type="checkbox" checked={has(e.key)} onChange={() => toggleExtra(e.key)} /> {e.label}
                    </label>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                {th('Company', 'name')}
                {th(A ? 'Received' : 'We collect', 'collect', true)}
                {th(A ? 'Paid' : 'We pay', 'pay', true)}
                {th('Net', 'net', true)}
                {th('Interest profit', 'profit', true)}
                {th('Earlier unpaid', 'earlier', true)}
                {has('sofar') ? (
                  <>
                    {th('Received so far', null, true)}
                    {th('Paid so far', null, true)}
                  </>
                ) : null}
                {has('pi') ? th('Interest in / out', null, true) : null}
                {has('next') ? th('Next due', null) : null}
                {has('last') ? th('Last received / paid', null) : null}
                {has('pos') ? th('Total owed both ways', null, true) : null}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={20} className={s.empty}>
                    {companies.length === 0 ? `Nothing to collect or pay in ${monthLong}.` : 'No company matches.'}
                  </td>
                </tr>
              ) : null}
              {shown.map((c) => {
                const f = fig(c)
                const isOpen = open.has(c.name)
                const toggle = () =>
                  setOpen((cur) => {
                    const next = new Set(cur)
                    if (next.has(c.name)) next.delete(c.name)
                    else next.add(c.name)
                    return next
                  })
                return (
                  <Fragment key={c.name}>
                    <tr className={s.co} onClick={toggle} aria-expanded={isOpen}>
                      <td>
                        <span className={s.caret}>{isOpen ? '▾' : '▸'}</span>
                        <span className={s.coName}>{c.name}</span>
                        <div className={`${s.sub} ${s.coSub}`}>
                          {c.deals.length} {c.deals.length === 1 ? 'deal' : 'deals'}
                          {c.both ? ' · both sides' : ''}
                        </div>
                      </td>
                      <td className={`${s.num} ${f.collect >= EPS ? s.good : s.quiet}`}>{bare(f.collect)}</td>
                      <td className={`${s.num} ${f.pay >= EPS ? s.bad : s.quiet}`}>{bare(f.pay)}</td>
                      <td className={`${s.num} ${tone(f.net)}`}>{signed(f.net)}</td>
                      <td className={`${s.num} ${tone(f.profit)}`}>{signed(f.profit)}</td>
                      <td className={`${s.num} ${f.earlier >= EPS ? s.bad : s.quiet}`}>{bare(f.earlier)}</td>
                      {has('sofar') ? (
                        <>
                          <td className={`${s.num} ${s.good}`}>{bare(f.gotCollect)}</td>
                          <td className={`${s.num} ${s.bad}`}>{bare(f.gotPay)}</td>
                        </>
                      ) : null}
                      {has('pi') ? <td className={s.num}>{`${formatMoneyBare(f.interestIn)} / ${formatMoneyBare(f.interestOut)}`}</td> : null}
                      {has('next') ? <td /> : null}
                      {has('last') ? <td /> : null}
                      {has('pos') ? (
                        <td className={`${s.num} ${tone(c.position)}`}>
                          {signed(c.position)}
                          {Math.abs(c.position) >= EPS ? <div className={s.sub}>{c.position > 0 ? 'they owe us' : 'we owe them'}</div> : null}
                        </td>
                      ) : null}
                      <td />
                    </tr>
                    {isOpen ? c.deals.map(dealRow) : null}
                  </Fragment>
                )
              })}
              {shown.length > 0 ? (
                <tr className={s.foot}>
                  <td>
                    Total · {shown.length} {shown.length === 1 ? 'company' : 'companies'}
                  </td>
                  <td className={s.num}>{bare(total('collect'))}</td>
                  <td className={s.num}>{bare(total('pay'))}</td>
                  <td className={s.num}>{signed(total('net'))}</td>
                  <td className={s.num}>{signed(total('profit'))}</td>
                  <td className={s.num}>{bare(total('earlier'))}</td>
                  {has('sofar') ? (
                    <>
                      <td className={s.num}>{bare(total('gotCollect'))}</td>
                      <td className={s.num}>{bare(total('gotPay'))}</td>
                    </>
                  ) : null}
                  {has('pi') ? <td className={s.num}>{`${formatMoneyBare(total('interestIn'))} / ${formatMoneyBare(total('interestOut'))}`}</td> : null}
                  {has('next') ? <td /> : null}
                  {has('last') ? <td /> : null}
                  {has('pos') ? <td className={s.num}>{signed(position)}</td> : null}
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className={s.note}>
        ▸ opens a company&rsquo;s deals, each marked Collect or Pay. Net = {A ? 'received − paid' : 'collect − pay'} this month. Interest profit ={' '}
        {A ? 'interest received − interest paid' : 'interest due to us − interest we owe'} this month. A contra is no cash and is left out of Actual.
      </p>
    </section>
  )
}
