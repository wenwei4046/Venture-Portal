'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HvPage, PageHead, SecLabel } from '@/components/hrv/kit'
import { CardIcon } from '@/components/hrv/icons'
import { Drawer } from '@/components/hrv/overlay'
import { departmentNames, personName, requestTitle, answerOf } from '@/lib/hiring/view'
import { insightFacts, insightsOf, lastTwelveMonths, type InsightsPeriod } from '@/lib/hiring/insights'
import type { HiringBoard } from '@/lib/hiring/types'
import { StatusChip, Trail } from './bits'
import s from './hiring.module.css'

/**
 * Hiring › Insights (README §12, portal-34): how long each request takes,
 * from submitted to acknowledged to filled, for this month, a month of the
 * last twelve, or all time — six cards with their change on the month
 * before, the days each fill took, by source and by department, and every
 * request sideways. A row opens its facts and trail in the 440px panel.
 */
export default function HiringInsightsView({ board, today }: { board: HiringBoard; today: string }) {
  const router = useRouter()
  const [period, setPeriod] = useState<InsightsPeriod>('this')
  const [monthOpen, setMonthOpen] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const months = useMemo(() => lastTwelveMonths(today), [today])
  const ins = useMemo(
    () => insightsOf(board.requests, period, today, id => personName(board, id), departmentNames(board)),
    [board, period, today],
  )
  const picked = board.requests.find(r => r.id === sel) ?? null
  const monthLabel = period.startsWith('m:') ? months.find(m => m.value === period)?.label ?? 'Pick a month' : 'Pick a month'

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Insights" title="Hiring insights" subtitle="How long each request takes, from submitted to acknowledged to filled." />

      <div className={s.insBar}>
        <div className={s.periods} role="group" aria-label="Period">
          <button type="button" className={s.period} aria-pressed={period === 'this'} onClick={() => setPeriod('this')}>
            This month
          </button>
          <button type="button" className={s.period} aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
            All time
          </button>
          <span className={s.periodSep} aria-hidden="true" />
          <div className={s.rel}>
            <button
              type="button"
              className={`${s.period} ${s.monthBtn}`}
              aria-pressed={period.startsWith('m:')}
              aria-expanded={monthOpen}
              onClick={() => setMonthOpen(o => !o)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15" rx="2" />
                <path d="M8 3v4M16 3v4M3.5 10h17" />
              </svg>
              {monthLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {monthOpen ? (
              <>
                <div className={s.menuCatch} onClick={() => setMonthOpen(false)} aria-hidden="true" />
                <div className={s.monthPop} role="dialog" aria-label="Pick a month">
                  <SecLabel style={{ marginBottom: 8 }}>Last 12 months</SecLabel>
                  <div className={s.monthGrid}>
                    {months.map(m => (
                      <button
                        key={m.value}
                        type="button"
                        className={s.monthCell}
                        aria-pressed={period === m.value}
                        aria-label={m.label}
                        onClick={() => {
                          setPeriod(m.value)
                          setMonthOpen(false)
                        }}
                      >
                        <span className={s.monthShort}>{m.short}</span>
                        <span className={s.monthYear}>{m.year}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <span className={s.insRange}>{ins.range}</span>
        <span className={s.grow} />
      </div>

      <section className={s.insCards} aria-label="This period">
        {ins.cards.map(c => (
          <div key={c.label} className={s.insCard} role="group" aria-label={c.label}>
            <span className={s.insCardBar} data-bar={c.bar} aria-hidden="true" />
            <div className={s.insCardLabel}>{c.label}</div>
            <div className={s.insCardValue} style={{ fontSize: c.value.length > 6 ? 22 : 28 }}>
              {c.value}
            </div>
            <div className={s.insCardFoot}>
              <span className={s.insDelta} data-tone={c.deltaTone}>
                {c.delta}
              </span>
              <span className={s.insCardIcon} aria-hidden="true">
                <CardIcon name={c.icon} />
              </span>
            </div>
          </div>
        ))}
      </section>

      <div className={s.insB}>
        <section className={s.insSec} aria-label="Days from submitted to filled">
          <div className={s.insSecHead}>
            <span className={s.insSecTitle}>Days from submitted to filled</span>
            <span className={s.insSecNote}>Filled this period</span>
          </div>
          {ins.bars.length ? (
            <div className={s.insBars}>
              {ins.bars.map(b => (
                <div key={b.id} className={s.insBarRow}>
                  <span className={s.insBarLabel} title={`${b.id} · ${b.label}`}>
                    {b.label}
                  </span>
                  <span className={s.insBarTrack}>
                    <span className={s.insBarAck} style={{ width: `${b.ackShare}%` }} />
                    <span className={s.insBarRest} style={{ width: `${b.restShare}%` }} />
                  </span>
                  <span className={s.insBarDays}>{b.days}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.insEmpty}>Nothing filled in this period</div>
          )}
          <div className={s.insLegend}>
            <span className={s.insKey}>
              <span className={`${s.insSwatch} ${s.insBarAck}`} />
              To acknowledge
            </span>
            <span className={s.insKey}>
              <span className={`${s.insSwatch} ${s.insBarRest}`} />
              Acknowledged to filled
            </span>
          </div>
        </section>
        <div className={s.insTwo}>
          <section className={s.insSec} aria-label="By source">
            <div className={s.insSecHead}>
              <span className={s.insSecTitle}>By source</span>
              <span className={s.insSecNote}>Share of people hired</span>
            </div>
            {ins.sources.map(d => (
              <div key={d.name} className={s.shareRow}>
                <div className={s.shareTop}>
                  <span className={s.shareName}>{d.name}</span>
                  <span className={s.shareMix}>{d.pax}</span>
                  <span className={s.shareCost}>{d.cost}</span>
                </div>
                <span className={s.shareTrack}>
                  <span className={s.shareFill} style={{ width: `${d.share}%` }} />
                </span>
              </div>
            ))}
            {ins.sources.length ? null : <div className={s.insEmpty}>No hires in this period</div>}
          </section>
          <section className={s.insSec} aria-label="By department">
            <div className={s.insSecHead}>
              <span className={s.insSecTitle}>By department</span>
              <span className={s.insSecNote}>Share of requests</span>
            </div>
            {ins.departments.map(d => (
              <div key={d.name} className={s.shareRow}>
                <div className={s.shareTop}>
                  <span className={s.shareName}>{d.name}</span>
                  <span className={s.shareMix}>{d.mix}</span>
                  <span className={s.shareCost}>{d.avg}</span>
                </div>
                <span className={s.shareTrack}>
                  <span className={s.shareFill} style={{ width: `${d.share}%` }} />
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>

      <div className={s.everyHead}>
        <span className={s.insSecTitle}>Every request</span>
        <span className={s.insSecNote}>Scroll sideways for all columns →</span>
      </div>
      <div className={s.everyTable} role="table" aria-label="Every request">
        <div className={s.everyInner}>
          <div className={`${s.everyThead} ${s.everyCols}`} role="row">
            {['ID', 'Position', 'Company', 'Department', 'Owner (HR)', 'Pax', 'Hired through', 'Budget / month', 'Hiring cost', 'Cost per hire', 'Submitted', 'Acknowledged', 'Filled / closed', 'To ack', 'To fill', 'Status'].map(h => (
              <span key={h} role="columnheader" className={['Pax', 'Budget / month', 'Hiring cost', 'Cost per hire', 'To ack', 'To fill'].includes(h) ? s.r : undefined}>
                {h}
              </span>
            ))}
          </div>
          {ins.rows.map(r => (
            <div
              key={r.id}
              role="row"
              tabIndex={0}
              className={`${s.everyRow} ${s.everyCols}`}
              onClick={() => setSel(r.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') setSel(r.id)
              }}
            >
              <span>{r.id}</span>
              <span style={{ minWidth: 0 }}>
                <span className={s.everyPos}>{r.position}</span>
                {r.hired ? <span className={s.everySub}>{r.hired}</span> : null}
              </span>
              <span>{r.company}</span>
              <span>{r.department}</span>
              <span className={r.ownerSet ? s.cellOwner : s.waiting}>{r.owner}</span>
              <span className={`${s.r} ${s.monoCell}`}>{r.pax}</span>
              <span>{r.source}</span>
              <span className={`${s.r} ${s.monoCell}`}>{r.budget}</span>
              <span className={`${s.r} ${s.monoCell}`}>{r.cost}</span>
              <span className={`${s.r} ${s.monoCell}`}>{r.perHire}</span>
              <span className={s.dateCell}>{r.submitted}</span>
              <span className={s.dateCell}>{r.acknowledged}</span>
              <span className={s.dateCell}>{r.ended}</span>
              <span className={`${s.r} ${s.monoCell}`}>{r.toAck}</span>
              <span className={`${s.r} ${s.monoCell}${r.waiting ? ` ${s.waiting}` : ` ${s.cellOwner}`}`}>{r.toFill}</span>
              <span>
                <StatusChip status={r.status} />
              </span>
            </div>
          ))}
          {ins.rows.length ? null : <div className={s.listEmpty}>No requests in this period.</div>}
        </div>
      </div>
      <div className={s.listFoot}>A request is in the period if it was submitted or filled in it. Days come from each request&apos;s audit trail.</div>

      <Drawer
        open={!!picked}
        onClose={() => setSel(null)}
        width={440}
        headStyle={{ padding: '18px 22px' }}
        headGrow
        bodyStyle={{ padding: '18px 22px' }}
        head={
          picked ? (
            <div>
              <div className={s.isKicker}>{picked.id + ' · ' + answerOf(picked, 'dept')}</div>
              <div className={s.isTitle}>{requestTitle(picked)}</div>
              <div className={s.isChips}>
                <StatusChip status={picked.status} />
                <span className={s.isOwner}>{picked.ownerId ? 'Owner: ' + personName(board, picked.ownerId) : 'No owner yet'}</span>
              </div>
            </div>
          ) : null
        }
        footer={
          picked ? (
            <div className={s.tsFoot}>
              <button type="button" className={s.btnPlain} onClick={() => setSel(null)}>
                Close
              </button>
              <button type="button" className={s.btnOrange} style={{ padding: '8px 18px' }} onClick={() => router.push(`/hiring/requests/${encodeURIComponent(picked.id)}`)}>
                View full →
              </button>
            </div>
          ) : null
        }
      >
        {picked ? (
          <>
            {picked.status === 'filled' && picked.hiredNames.length ? <div className={s.isHired}>Hired: {picked.hiredNames.join(', ')}</div> : null}
            <div className={s.facts}>
              {insightFacts(picked, today).map(f => (
                <FactPair key={f.label} label={f.label} value={f.value} strong={f.strong} />
              ))}
            </div>
            <SecLabel style={{ margin: '20px 0 10px' }}>Audit trail</SecLabel>
            <Trail events={picked.events} />
          </>
        ) : null}
      </Drawer>
    </HvPage>
  )
}

function FactPair({ label, value, strong }: { label: string; value: string; strong: boolean }) {
  return (
    <>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue} data-strong={strong ? 'true' : undefined}>
        {value}
      </span>
    </>
  )
}
