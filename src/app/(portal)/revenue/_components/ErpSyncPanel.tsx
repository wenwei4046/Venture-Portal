'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/utils'
import { formatAgo } from '@/lib/erp-sync/format'
import { ActionButton, Choice, Hidden, Hint, RowForm, SaveButton } from '@/components/RowForm'
import LedgerRow from '@/components/LedgerRow'
import { matchErpSalesperson, replayHeldErpEvents } from '../sync-actions'
import type { ErpSyncPanelData } from '../_lib/erp-sync-panel'

/**
 * The ERP live feed, as the Comm Cal page shows it: how live it is, who the
 * feed could not place, what it had to hold, and what just arrived.
 *
 * Client-side only for the clock. "12 s ago" has to keep counting between
 * server renders or it is not a live indicator, so the panel re-reads the
 * clock every five seconds; everything else is what the server sent.
 */

function periodLabel(period: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return period
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function outcomeClass(status: string): string {
  switch (status) {
    case 'applied':
      return 'text-ledger'
    case 'held':
      return 'text-alert'
    case 'rejected':
    case 'error':
      return 'text-danger'
    default:
      return 'text-muted'
  }
}

export default function ErpSyncPanel({ data }: { data: ErpSyncPanelData }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const [replayNote, setReplayNote] = useState<string | null>(null)

  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>ERP live feed</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {data.lastEventAt ? `LAST EVENT ${formatAgo(data.lastEventAt, now).toUpperCase()}` : 'NOTHING RECEIVED YET'}
        </span>
      </div>

      {!data.lastEventAt ? (
        <Hint>
          The Houzs Century ERP posts every changed sales order here the moment it is saved. Nothing
          has arrived yet — paste its key above, then on the ERP&apos;s Venture Portal Feed page press
          Test connection and Turn on.
        </Hint>
      ) : null}

      {data.unmatched.length > 0 ? (
        <div className="mb-8">
          <h3 className="font-serif italic text-sm text-graphite mb-2">
            Salespeople the feed could not place
          </h3>
          <Hint>
            These names arrived from the ERP and match nobody in the portal, so their orders pay no
            one until you say who they are. The match is remembered.
          </Hint>
          <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
            <table className="ledger-table tight">
              <thead>
                <tr>
                  <th>ERP salesperson</th>
                  <th className="right m-hide">Orders</th>
                  <th className="right m-hide">Value</th>
                  <th>Is</th>
                  <th />
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {data.unmatched.map(u => (
                  <RowForm key={`${u.agentKey}|${u.erpSalespersonId ?? ''}`} action={matchErpSalesperson}>
                    {({ pending }) => (
                      <LedgerRow>
                        <td>
                          <span className="text-ink">{u.agentName}</span>
                          {u.erpSalespersonId ? (
                            <span className="ml-2 font-mono text-[11px] text-muted">
                              {u.erpSalespersonId.slice(0, 8)}
                            </span>
                          ) : null}
                          <Hidden name="sub_department_id" value={data.subDepartmentId} />
                          <Hidden name="agent_key" value={u.agentKey} />
                          <Hidden name="erp_salesperson_id" value={u.erpSalespersonId ?? ''} />
                        </td>
                        <td className="num m-hide" data-label="Orders">{u.orders}</td>
                        <td className="num m-hide" data-label="Value">{formatMoney(u.total)}</td>
                        <td>
                          <Choice name="staff_id" required ariaLabel={`Match ${u.agentName}`} width="w-52">
                            <option value="">Pick a salesperson…</option>
                            {data.staff.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                                {s.code ? ` · ${s.code}` : ''}
                              </option>
                            ))}
                          </Choice>
                        </td>
                        <td>
                          <SaveButton pending={pending} label="Match" />
                        </td>
                      </LedgerRow>
                    )}
                  </RowForm>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.held.length > 0 ? (
        <div className="mb-8">
          <h3 className="font-serif italic text-sm text-graphite mb-2">Held deliveries</h3>
          <Hint>
            The ERP changed these orders after the month&apos;s run was applied, or the month was
            imported from a file. Nothing was written. Reopen the run, then replay.
          </Hint>
          <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
            <table className="ledger-table tight">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="right">Held</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.held.map(h => (
                  <tr key={h.period}>
                    <td>{periodLabel(h.period)}</td>
                    <td className="num">{h.count}</td>
                    <td>
                      {/^\d{4}-\d{2}-01$/.test(h.period) ? (
                        <ActionButton
                          label={`Replay ${h.count}`}
                          confirm={`Replay ${h.count} held ${h.count === 1 ? 'delivery' : 'deliveries'} for ${periodLabel(h.period)}?`}
                          run={async () => {
                            const r = await replayHeldErpEvents(h.period, data.subDepartmentId)
                            setReplayNote(
                              `${periodLabel(h.period)}: ${r.applied} applied, ${r.stillHeld} still held, ${r.replayed} replayed.`,
                            )
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {replayNote ? (
            <p className="font-serif italic text-sm text-graphite mt-2">{replayNote}</p>
          ) : null}
        </div>
      ) : null}

      {data.events.length > 0 ? (
        <div>
          <h3 className="font-serif italic text-sm text-graphite mb-2">Recent deliveries</h3>
          <div className="border border-hairline rounded-md bg-surface overflow-x-auto">
            <table className="ledger-table tight">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Document</th>
                  <th>Outcome</th>
                  <th className="m-hide">Note</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {data.events.map(e => (
                  <LedgerRow key={e.id}>
                    <td className="font-mono text-xs text-muted whitespace-nowrap">{formatAgo(e.receivedAt, now)}</td>
                    <td className="font-mono text-xs">{e.docNo ?? '—'}</td>
                    <td className={`font-mono text-[11px] uppercase tracking-[0.02em] ${outcomeClass(e.status)}`}>
                      {e.status}
                    </td>
                    <td className="m-hide font-serif italic text-sm text-graphite" data-label="Note">
                      {e.message ?? ''}
                      {e.warnings.length > 0 ? (
                        <span className="ml-2 font-mono text-[11px] text-alert">{e.warnings.join(' · ')}</span>
                      ) : null}
                    </td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  )
}
