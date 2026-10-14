import ReturnLink from '@/components/layout/ReturnLink'
import s from '@/components/finv/full.module.css'
import { FullCard as Card, FullFact as Fact, FullPanelRow as PanelRow, FullRow as Row } from '@/components/finv/FullParts'
import a2 from '../../_components/alloc.module.css'
import { officeTime } from '@/lib/office-time'
import { methodLabel, shareLine } from '@/lib/allocator-sheet'
import AllocationPageActions from './AllocationPageActions'

// An allocation's full page (2026-10-14, the Finance revamp v2 — the drawer's
// *View full page ↗*; the prototype draws every record's full page one way,
// D06): *← Billing Allocator* and the crumb; *Allocation · {batch}*, the
// number with billed / to bill, four facts; then the numbered cards — the
// expense, the split by company (the billable total under it), the audit log —
// beside the sticky dark panel: the amount, the split, and the steps this
// reader may take. The design's empty Trail is not drawn (an allocation has no
// steps of its own), nor Print / Copy (the system prints and copies none).

export interface PageAllocation {
  id: string
  no: string
  /** `YYYY-MM`. */
  period: string
  description: string
  amount: number
  method: string
  /** *7012 · Rental*, or none. */
  category: string | null
  /** The snapshot month its headcount came off (`YYYY-MM`); none = the list as it stood. */
  hcPeriod: string | null
  billedRef: string | null
  billed: boolean
  createdAt: string | null
  createdBy: string | null
  lines: Array<{ own: boolean; label: string; targetKey: string; detail: string; amount: number }>
  invoices: Array<{ id: string; no: string; billTo: string; targetKey: string; status: string }>
  audit: Array<{ at: string; who: string; what: string }>
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const r2 = (n: number) => Math.round(n * 100) / 100

export default function AllocationPage({ allocation: a, can }: { allocation: PageAllocation; can: { create: boolean; edit: boolean } }) {
  const batch = a.billed && a.billedRef ? a.billedRef : 'not billed'
  const state = a.billed ? 'billed' : 'to bill'
  const tone = a.billed ? 'ledger' : 'alert'
  const shares = a.lines.filter((l) => !l.own)
  const billable = r2(shares.reduce((t, l) => t + l.amount, 0))
  const day = a.createdAt ? officeTime(a.createdAt).format('DD MMM YYYY') : null
  const hc = a.hcPeriod ? `${MON[Number(a.hcPeriod.slice(5, 7)) - 1]} ${a.hcPeriod.slice(0, 4)} snapshot` : 'Current list'
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <ReturnLink href={`/billing-allocator?period=${a.period}`} alsoFrom={['/billing-allocator']} className={s.back}>
          ← Billing Allocator
        </ReturnLink>
        <span className={s.crumb}>Daily · Billing Allocator · {a.no}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>Allocation · {batch}</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{a.no}</h1>
            <span className={s.pill} data-tone={tone}>
              <span className={s.pillDot} />
              {state}
            </span>
          </div>
          <div className={s.facts}>
            <Fact label="Amount" value={rm(a.amount)} mono />
            <Fact label="Expense" value={a.description} />
            <Fact label="Date" value={day ?? '—'} mono />
            <Fact label="Created by" value={`${a.createdBy ?? 'Unknown'}${a.createdAt ? ` · ${officeTime(a.createdAt).format('DD MMM YYYY · HH:mm')}` : ''}`} />
          </div>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          <Card n={++n} title="Expense">
            <div className={s.lead}>{a.description}</div>
            <dl className={s.dl}>
              <Row label="Category" value={a.category ?? '—'} />
              <Row label="Date" value={day ?? '—'} />
              <Row label="Batch" value={batch} />
            </dl>
          </Card>

          <Card n={++n} title="Split by company" aside={plural(a.lines.length, 'line', 'lines')}>
            <div className={s.table}>
              <div className={s.tHead}>
                <span className={s.tCol}>Company</span>
                <span className={`${s.tCol} ${s.tWide}`}>Share</span>
                <span className={`${s.tNum} ${a2.amount}`}>Amount</span>
              </div>
              {a.lines.map((l, i) => {
                const inv = !l.own && a.billed ? a.invoices.find((x) => x.targetKey === l.targetKey) : undefined
                return (
                  <div key={i} className={s.tRow}>
                    <span className={s.tCol}>{l.label}</span>
                    <span className={`${s.tCol} ${s.tWide}`} data-sub="true" title={l.detail}>
                      {[shareLine(l.detail, l.amount, a.amount), l.own ? 'kept' : state, inv?.no].filter(Boolean).join(' · ')}
                    </span>
                    <span className={`${s.tNum} ${a2.amount}`}>{rm(l.amount)}</span>
                  </div>
                )
              })}
              <div className={s.tFoot}>
                <span className={s.tCol}>Billable total</span>
                <span className={`${s.tNum} ${a2.amount}`}>{rm(billable)}</span>
              </div>
            </div>
          </Card>

          <Card n={++n} title="Audit log" aside={plural(a.audit.length, 'EVENT', 'EVENTS')}>
            {a.audit.length === 0 ? (
              <p className={s.none}>No change on record.</p>
            ) : (
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={s.aWhen}>When</span>
                  <span className={s.aWho}>Who</span>
                  <span className={s.aWhat}>What changed</span>
                </div>
                {a.audit.map((e, i) => (
                  <div key={i} className={s.aRow}>
                    <span className={s.aWhen}>{e.at}</span>
                    <span className={s.aWho} title={e.who}>
                      {e.who}
                    </span>
                    <span className={s.aWhat}>{e.what}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className={s.panel} data-light={tone}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Allocation</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {state}
            </span>
          </div>
          <div className={s.pAmount}>{rm(a.amount)}</div>
          <p className={s.pTo}>
            {a.description}
            {day ? ` · ${day}` : ''}
          </p>

          <div className={s.pGroup}>Split</div>
          <PanelRow label="Method" value={methodLabel(a.method)} />
          {a.method === 'headcount' ? <PanelRow label="Headcount from" value={hc} /> : null}
          <PanelRow label="Companies" value={String(shares.length)} />
          <PanelRow
            label={a.invoices.length > 1 ? 'Invoices' : 'Invoice'}
            value={a.billed ? (a.invoices.length === 1 ? a.invoices[0].no : `${a.invoices.length} invoices`) : '—'}
            sub={a.billed && a.invoices.length > 1 ? batch : undefined}
            mono
          />

          <AllocationPageActions id={a.id} no={a.no} period={a.period} billed={a.billed} invoices={a.invoices} can={can} />
        </aside>
      </div>
    </div>
  )
}

