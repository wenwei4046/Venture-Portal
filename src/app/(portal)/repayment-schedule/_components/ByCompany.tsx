'use client'

import { Fragment, cloneElement, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { figuresOf, type CoDeal, type Company, type Figures, type Part, type PartKey, type SideKey } from '@/lib/schedule-by-company'
import s from './by-company.module.css'

// We collect and We pay as one table, a row a company (2026-11-13, the mockup approved: "照这个做"); ▸ opens its deals,
// each marked Collect or Pay. One reading, no Actual / By right (2026-11-20 — the user: "这样我就认为不需要分actual 和by
// right 了吧"): each side's This month (its own instalments), Principal repaid early (settled beyond them), Overdue as
// the month began, Settled so far (all of it, cash and contra) and Still to settle — This month + Repaid early + Overdue
// = Settled + Still, each side — then the cash Net and its Interest + penalty. More columns from Columns: the interest each way, the next instalment, the last repayment, what is owed both
// ways (a sign to contra).

const EPS = 0.005
const signed = (n: number) => (Math.abs(n) < EPS ? '—' : `${n > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(n))}`)
const bare = (n: number) => (Math.abs(n) < EPS ? '—' : formatMoneyBare(n))
const day = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

type Extra = 'pi' | 'next' | 'last' | 'pos'
const EXTRAS: Array<{ key: Extra; label: string }> = [
  { key: 'pi', label: 'Interest + penalty in / out' },
  { key: 'next', label: 'Next due' },
  { key: 'last', label: 'Last received / paid' },
  { key: 'pos', label: 'Total owed both ways' },
]
const COLS_KEY = 'repayment.by-company.columns'
// Split P / I (2026-11-25 — the user: "每一笔的collect 和pay都想要分principal和interest", a Columns switch, "往右加，不是往下"):
// each side figure's principal and interest to its right, Settled's penalty with them (lib/schedule-by-company). Kept by
// the browser.
const SPLIT_KEY = 'repayment.by-company.split'
const PART_LABEL: Record<keyof Part, string> = { p: 'P', i: 'I', pen: 'Pen' }
const PART_WORDS: Record<keyof Part, string> = { p: 'principal', i: 'interest', pen: 'penalty (outside the figure)' }
// The order the figures stand in (2026-11-13 — the user: "我不能自己拖着排？"): drag a heading onto another, as the hub
// tables do; kept by the browser. Company stays first, the row's button last. v4 (2026-11-20): the columns are new, so
// an order kept before starts again from this one.
const ORDER_KEY = 'repayment.by-company.order.v4'
// Grouped, collect then pay in each (2026-11-19 — the user: "有点乱，分不清什么是什么" → A + B), in the order they add
// up (2026-11-20): this month, overdue, settled so far, still to settle, then the cash; a band names each group.
const DEFAULT_ORDER = ['nowCollect', 'nowPay', 'earlyCollect', 'earlyPay', 'bfCollect', 'bfPay', 'settledCollect', 'settledPay', 'openCollect', 'openPay', 'net', 'profit', 'pi', 'next', 'last', 'pos'] as const
type ColKey = (typeof DEFAULT_ORDER)[number]
type Group = 'month' | 'early' | 'overdue' | 'sofar' | 'open' | 'cash' | 'more'

type Filter = 'all' | 'both' | 'late' | 'loss'
type FigKey = 'nowCollect' | 'nowPay' | 'earlyCollect' | 'earlyPay' | 'bfCollect' | 'bfPay' | 'settledCollect' | 'settledPay' | 'openCollect' | 'openPay' | 'net' | 'profit'
type SortKey = 'name' | FigKey

/** The cards over the tabs: the table's four groups, each side (2026-11-20). */
export function ByCompanyCards({ companies, month }: { companies: Company[]; month: string }) {
  const f = figuresOf(companies.flatMap((c) => c.deals))
  const first = dayjs(`${month}-01`)
  const mon = first.format('MMM')
  const pair = (a: number, b: number) => `${formatMoneyBare(a)} / ${formatMoneyBare(b)}`
  return (
    <StatCards label="Repayment Schedule" size="small">
      <StatCard key="now" label={`This month · ${mon}`} value={pair(f.nowCollect, f.nowPay)} icon="inbox" note="Collect / pay · the month’s own instalments" />
      <StatCard key="early" label={`Principal repaid early · ${mon}`} value={pair(f.earlyCollect, f.earlyPay)} icon="swap" note="Collect / pay · repaid beyond the instalments" />
      <StatCard
        key="bf"
        tone={f.bfCollect + f.bfPay >= EPS ? 'danger' : undefined}
        label={`Overdue at ${first.format('D MMM')}`}
        value={pair(f.bfCollect, f.bfPay)}
        icon="alert"
        note="Collect / pay · owed from months before, as the month began"
      />
      <StatCard key="settled" tone="ledger" label={`Settled so far · ${mon}`} value={pair(f.settledCollect, f.settledPay)} icon="check" note="Received / paid · all of it, a contra with it" />
      <StatCard key="open" label={`Still to settle · ${mon}`} value={pair(f.openCollect, f.openPay)} icon="clock" note="Collect / pay · this month’s and overdue" />
    </StatCards>
  )
}

export default function ByCompany({
  companies,
  month,
  monthLong,
  canRecord = false,
}: {
  companies: Company[]
  /** YYYY-MM */
  month: string
  /** "November 2026" */
  monthLong: string
  /** Treasury · Create: a deal's record form. */
  canRecord?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [extra, setExtra] = useState<Extra[]>([])
  const [split, setSplit] = useState(false)
  const [menu, setMenu] = useState(false)
  const [order, setOrder] = useState<ColKey[]>([...DEFAULT_ORDER])
  const [drag, setDrag] = useState<{ from: ColKey | null; over: ColKey | null }>({ from: null, over: null })
  useEffect(() => {
    try {
      const o = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? '[]') as ColKey[]
      if (Array.isArray(o) && o.length) {
        const known = o.filter((k, i, all) => (DEFAULT_ORDER as readonly string[]).includes(k) && all.indexOf(k) === i)
        setOrder([...known, ...DEFAULT_ORDER.filter((k) => !known.includes(k))])
      }
    } catch {
      // Private mode — the order simply is not kept.
    }
    try {
      const v = JSON.parse(window.localStorage.getItem(COLS_KEY) ?? '[]') as Extra[]
      if (Array.isArray(v)) setExtra(v.filter((x) => EXTRAS.some((e) => e.key === x)))
    } catch {
      // Private mode — the columns simply are not kept.
    }
    try {
      setSplit(window.localStorage.getItem(SPLIT_KEY) === '1')
    } catch {
      // Private mode.
    }
  }, [])
  const toggleSplit = () => {
    setSplit(!split)
    try {
      if (split) window.localStorage.removeItem(SPLIT_KEY)
      else window.localStorage.setItem(SPLIT_KEY, '1')
    } catch {
      // Private mode.
    }
  }
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
  const keepOrder = (next: ColKey[]) => {
    setOrder(next)
    try {
      if (next.join() === DEFAULT_ORDER.join()) window.localStorage.removeItem(ORDER_KEY)
      else window.localStorage.setItem(ORDER_KEY, JSON.stringify(next))
    } catch {
      // Private mode.
    }
  }
  const drop = (to: ColKey) => {
    const from = drag.from
    setDrag({ from: null, over: null })
    if (!from || from === to) return
    const next = order.filter((k) => k !== from)
    next.splice(next.indexOf(to) + (order.indexOf(from) < order.indexOf(to) ? 1 : 0), 0, from)
    keepOrder(next)
  }

  const figs = useMemo(() => new Map(companies.map((c) => [c.key, figuresOf(c.deals)])), [companies])
  const fig = (c: Company) => figs.get(c.key) as Figures
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
      const k = sort.key
      return (fig(a)[k] - fig(b)[k]) * sort.dir || a.name.localeCompare(b.name)
    })
  const total = (k: Exclude<keyof Figures, 'parts'>) => shown.reduce((t, c) => t + fig(c)[k], 0)
  const partTotal = (k: SideKey, p: keyof Part) => shown.reduce((t, c) => t + fig(c).parts[k][p], 0)
  const position = shown.reduce((t, c) => t + c.position, 0)

  const tone = (n: number) => (n >= EPS ? s.good : n <= -EPS ? s.bad : s.quiet)
  const sortGlyph = (key: SortKey) => (
    <span className={s.sortGlyph} data-on={sort.key === key ? 'true' : undefined}>
      {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
    </span>
  )
  const toggleSort = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }))

  // Each figure's column: its group, its heading, the side it is (tinted: collect green, pay red — 2026-11-19, B), what
  // a company row, a deal row and the foot say in it.
  type Col = {
    key: ColKey
    group: Group
    dir?: 'in' | 'out'
    label: string
    num?: boolean
    sort?: SortKey
    extra?: Extra
    /** A side figure's parts, to its right while split: principal, interest (Settled: penalty too). */
    parts?: {
      keys: Array<keyof Part>
      co: (f: Figures, p: keyof Part) => number
      deal: (d: CoDeal, p: keyof Part) => number | null
      foot: (p: keyof Part) => number
    }
    co: (c: Company, f: Figures) => ReactNode
    deal: (d: CoDeal) => ReactNode
    foot: () => ReactNode
  }
  const cell = (cls: string, v: ReactNode) => <td className={cls}>{v}</td>
  // A side's figure: the company's, a deal's (on its own side only), the foot's — collect green, pay red, overdue red.
  const side = (key: SideKey, group: Group, dir: 'in' | 'out', label: string, of: (d: CoDeal) => number, late = false): Col => {
    const mine = (d: CoDeal) => d.side === (dir === 'in' ? 'collect' : 'pay')
    const ink = (v: number) => (Math.abs(v) < EPS ? s.quiet : late || dir === 'out' ? s.bad : s.good)
    const pk = key.replace(/(Collect|Pay)$/, '') as PartKey
    return {
      key, group, dir, label, num: true, sort: key,
      parts: {
        keys: pk === 'settled' ? ['p', 'i', 'pen'] : ['p', 'i'],
        co: (f, p) => f.parts[key][p],
        deal: (d, p) => (mine(d) ? d.parts[pk][p] : null),
        foot: (p) => partTotal(key, p),
      },
      co: (_, f) => cell(`${s.num} ${ink(f[key])}`, bare(f[key])),
      deal: (d) => cell(`${s.num} ${late && of(d) >= EPS ? s.bad : ''}`, mine(d) ? bare(of(d)) : ''),
      foot: () => cell(s.num, bare(total(key))),
    }
  }
  const COLS: Record<ColKey, Col> = {
    nowCollect: side('nowCollect', 'month', 'in', 'Collect', (d) => d.now),
    nowPay: side('nowPay', 'month', 'out', 'Pay', (d) => d.now),
    earlyCollect: side('earlyCollect', 'early', 'in', 'Collect', (d) => d.early),
    earlyPay: side('earlyPay', 'early', 'out', 'Pay', (d) => d.early),
    bfCollect: side('bfCollect', 'overdue', 'in', 'Collect', (d) => d.bf, true),
    bfPay: side('bfPay', 'overdue', 'out', 'Pay', (d) => d.bf, true),
    settledCollect: side('settledCollect', 'sofar', 'in', 'Received', (d) => d.settled),
    settledPay: side('settledPay', 'sofar', 'out', 'Paid', (d) => d.settled),
    openCollect: side('openCollect', 'open', 'in', 'Collect', (d) => d.open),
    openPay: side('openPay', 'open', 'out', 'Pay', (d) => d.open),
    net: {
      key: 'net', group: 'cash', label: 'Net', num: true, sort: 'net',
      co: (_, f) => cell(`${s.num} ${tone(f.net)}`, signed(f.net)),
      deal: (d) => cell(s.num, signed(d.side === 'collect' ? d.got : -d.got)),
      foot: () => cell(s.num, signed(total('net'))),
    },
    profit: {
      key: 'profit', group: 'cash', label: 'Interest + penalty', num: true, sort: 'profit',
      co: (_, f) => cell(`${s.num} ${tone(f.profit)}`, signed(f.profit)),
      deal: (d) => {
        const v = d.side === 'collect' ? d.gotInterest : -d.gotInterest
        return cell(`${s.num} ${tone(v)}`, signed(v))
      },
      foot: () => cell(s.num, signed(total('profit'))),
    },
    pi: {
      key: 'pi', group: 'more', label: 'Interest + penalty in / out', num: true, extra: 'pi',
      co: (_, f) => cell(s.num, `${formatMoneyBare(f.interestIn)} / ${formatMoneyBare(f.interestOut)}`),
      deal: (d) => cell(s.num, `P ${formatMoneyBare(Math.max(0, d.got - d.gotInterest))} · I ${formatMoneyBare(d.gotInterest)}`),
      foot: () => cell(s.num, `${formatMoneyBare(total('interestIn'))} / ${formatMoneyBare(total('interestOut'))}`),
    },
    next: {
      key: 'next', group: 'more', label: 'Next due', extra: 'next',
      co: () => <td />,
      deal: (d) => <td>{d.next ? `${dayjs(d.next.due).format('D MMM')} · ${formatMoneyBare(d.next.amount)}` : '—'}</td>,
      foot: () => <td />,
    },
    last: {
      key: 'last', group: 'more', label: 'Last received / paid', extra: 'last',
      co: () => <td />,
      deal: (d) => <td>{day(d.last)}</td>,
      foot: () => <td />,
    },
    pos: {
      key: 'pos', group: 'more', label: 'Total owed both ways', num: true, extra: 'pos',
      co: (c) => (
        <td className={`${s.num} ${tone(c.position)}`}>
          {signed(c.position)}
          {Math.abs(c.position) >= EPS ? <div className={s.sub}>{c.position > 0 ? 'they owe us' : 'we owe them'}</div> : null}
        </td>
      ),
      deal: (d) => cell(s.num, bare(d.owe)),
      foot: () => cell(s.num, signed(position)),
    },
  }
  const cols = order.map((k) => COLS[k]).filter((c) => !c.extra || has(c.extra))
  const partsOf = (c: Col) => (split && c.parts ? c.parts.keys : [])
  const width = (c: Col) => 1 + partsOf(c).length
  const span = cols.reduce((t, c) => t + width(c), 0)
  const GROUP: Record<Group, string> = {
    month: 'This month',
    early: 'Principal repaid early',
    overdue: `Overdue at ${dayjs(`${month}-01`).format('D MMM')}`,
    sofar: 'Settled so far',
    open: 'Still to settle',
    cash: 'Cash this month',
    more: '',
  }
  // The band over the headings: a run of columns of one group under one name; a group's first column draws a rule.
  const runs: Array<{ group: Group; span: number; first: ColKey }> = []
  for (const c of cols) {
    const last = runs[runs.length - 1]
    if (last && last.group === c.group && c.group !== 'more') last.span += width(c)
    else runs.push({ group: c.group, span: width(c), first: c.key })
  }
  const starts = new Set(runs.map((r) => r.first))
  const mark = (c: Col, node: ReactNode) =>
    cloneElement(node as ReactElement<Record<string, unknown>>, {
      'data-dir': c.dir,
      'data-start': starts.has(c.key) ? 'true' : undefined,
    })
  // A figure's cell and, while split, its parts to its right.
  const cells = (c: Col, node: ReactNode, part: (p: keyof Part) => number | null) => (
    <Fragment key={c.key}>
      {mark(c, node)}
      {partsOf(c).map((p) => {
        const v = part(p)
        return (
          <td key={p} className={`${s.num} ${s.part}`} data-part={p} data-dir={c.dir}>
            {v == null ? '' : bare(v)}
          </td>
        )
      })}
    </Fragment>
  )

  const head = (c: Col) => (
    <th
      key={c.key}
      data-col={c.key}
      data-num={c.num ? 'true' : undefined}
      data-dir={c.dir}
      data-start={starts.has(c.key) ? 'true' : undefined}
      data-sort={c.sort ?? undefined}
      data-dragging={drag.from === c.key ? 'true' : undefined}
      data-drop={drag.over === c.key && drag.from && drag.from !== c.key ? 'true' : undefined}
      aria-sort={c.sort && sort.key === c.sort ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      title={`${GROUP[c.group] ? `${GROUP[c.group]} · ` : ''}${c.label} — drag to move${c.sort ? ' · click to sort' : ''}`}
      draggable
      onDragStart={(e) => {
        try {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', c.key)
        } catch {
          // Some browsers refuse data on a drag start; the state carries it.
        }
        setDrag({ from: c.key, over: null })
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (drag.over !== c.key) setDrag((d) => ({ ...d, over: c.key }))
      }}
      onDrop={(e) => {
        e.preventDefault()
        drop(c.key)
      }}
      onDragEnd={() => setDrag({ from: null, over: null })}
      onClick={c.sort ? () => toggleSort(c.sort!) : undefined}
    >
      {c.label}
      {c.sort ? sortGlyph(c.sort) : null}
    </th>
  )
  const heads = (c: Col) => (
    <Fragment key={c.key}>
      {head(c)}
      {partsOf(c).map((p) => (
        <th key={p} data-part={p} data-num="true" data-dir={c.dir} title={`${GROUP[c.group]} · ${c.label} — ${PART_WORDS[p]}`}>
          {PART_LABEL[p]}
        </th>
      ))}
    </Fragment>
  )

  const dealRow = (d: CoDeal) => {
    const c1 = d.side === 'collect'
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
        {cols.map((c) => cells(c, c.deal(d), (p) => c.parts?.deal(d, p) ?? null))}
        <td className="text-right whitespace-nowrap">
          {canRecord && !d.pending && d.open >= EPS && d.href ? (
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
        {chip('late', 'Still overdue', counts.late)}
        {chip('loss', 'Losing this month', counts.loss)}
      </div>
      <div className={s.panel}>
        <div className={s.tools}>
          <div className={s.tHead}>
            <span className={s.tTitle}>By company</span>
            <span className={s.tCount}>
              {shown.length} {shown.length === 1 ? 'company' : 'companies'} · {monthLong}
            </span>
          </div>
          <input className={s.search} placeholder="Search company or deal" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search company or deal" />
          <div className={s.colWrap}>
            <button type="button" className={s.colBtn} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              ▥ Columns{extra.length ? ` · ${extra.length} more` : ''}
              {split ? ' · P / I' : ''}
            </button>
            {menu ? (
              <>
                <div className={s.away} onClick={() => setMenu(false)} aria-hidden="true" />
                <div className={s.colMenu} role="menu">
                  <div className={s.colMenuHint}>
                    Add columns · drag a heading to move it
                    {order.join() !== DEFAULT_ORDER.join() ? (
                      <button type="button" className={s.colReset} onClick={() => keepOrder([...DEFAULT_ORDER])}>
                        Reset order
                      </button>
                    ) : null}
                  </div>
                  {EXTRAS.map((e) => (
                    <label key={e.key}>
                      <input type="checkbox" checked={has(e.key)} onChange={() => toggleExtra(e.key)} /> {e.label}
                    </label>
                  ))}
                  <label className={s.colSplit}>
                    <input type="checkbox" checked={split} onChange={toggleSplit} /> Split P / I — principal and interest beside each figure
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr className={s.groups}>
                <th rowSpan={2} data-col="name" data-sort="name" aria-sort={sort.key === 'name' ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} onClick={() => toggleSort('name')}>
                  Company
                  {sortGlyph('name')}
                </th>
                {runs.map((r) => (
                  <th key={r.first} colSpan={r.span} data-group={r.group} data-start="true">
                    {GROUP[r.group]}
                  </th>
                ))}
                <th rowSpan={2} aria-label="Actions" />
              </tr>
              <tr>{cols.map(heads)}</tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={span + 2} className={s.empty}>
                    {companies.length === 0 ? `Nothing to collect or pay in ${monthLong}.` : 'No company matches.'}
                  </td>
                </tr>
              ) : null}
              {shown.map((c) => {
                const f = fig(c)
                const isOpen = open.has(c.key)
                const toggle = () =>
                  setOpen((cur) => {
                    const next = new Set(cur)
                    if (next.has(c.key)) next.delete(c.key)
                    else next.add(c.key)
                    return next
                  })
                return (
                  <Fragment key={c.key}>
                    <tr className={s.co} onClick={toggle} aria-expanded={isOpen}>
                      <td>
                        <span className={s.caret}>{isOpen ? '▾' : '▸'}</span>
                        <span className={s.coName}>{c.name}</span>
                        <div className={`${s.sub} ${s.coSub}`}>
                          {c.deals.length} {c.deals.length === 1 ? 'deal' : 'deals'}
                          {c.both ? ' · both sides' : ''}
                        </div>
                      </td>
                      {cols.map((col) => cells(col, col.co(c, f), (p) => col.parts?.co(f, p) ?? null))}
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
                  {cols.map((col) => cells(col, col.foot(), (p) => col.parts?.foot(p) ?? null))}
                  <td />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className={s.note}>
        ▸ opens a company&rsquo;s deals, each marked Collect or Pay. Green columns are money coming to us, red going out. This month = what the month&rsquo;s
        own instalments still asked as it began (a compounding month&rsquo;s unpaid interest rolls into the balance and asks none). Principal repaid early = what
        was repaid beyond the instalments — principal on a deal with no fixed term, or paid down ahead of the plan. Overdue = what months before still owed
        as the month began; what came in since does not take it down. Settled so far = all repaid this month, a contra with it. Still to settle = this
        month&rsquo;s and overdue not yet settled. Each side: This month + Principal repaid early + Overdue = Settled + Still to settle. Net = cash
        received − cash paid this month (a contra is no cash). Interest + penalty = interest and penalty received − paid this month.
        {split
          ? ' P / I: each figure’s principal and interest. What is owed is its principal before its interest — a part payment pays the interest first. Settled’s Pen is the penalty received or paid this month, outside Settled.'
          : ''}
      </p>
    </section>
  )
}
