'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatDate, formatIntlDate } from '@/lib/utils'
import { formatAgo, ignoreOutcomeNote, matchOutcomeNote } from '@/lib/erp-sync/format'
import { cancelWarmIntent, warmOnIntent } from '@/lib/nav-warm'
import { Chevron } from '@/components/hrv/icons'
import { Card, Cards, Chip, GridHead, GridRow, GridTable, SectHead, btn, hv, type ChipTone } from '@/components/hrv/kit'
import { Drawer, Window } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { clearFirstPaidMonth, setFirstPaidMonth } from '../../cutover-actions'
import { linkErpKey, setErpFeedWindow, unlinkErpKey } from '../../link-actions'
import { ignoreErpAgent, matchErpSalesperson, replayHeldErpEvents, unignoreErpAgent, type MatchOutcome } from '../../sync-actions'
import type { ErpSyncPanelData } from '../../_lib/erp-sync-panel'
import type { ErpLinkView } from '../../_lib/erp-link'
import s from './CommCal.module.css'
import { Select } from '@/components/hrv/select'

// Comm Cal (2026-10-10, the HR revamp handoff): the status strip (ERP
// receiving · Pays from … · Change · Data source ›), five cards, and the
// months. Data source is a right drawer — the ERP link and its live feed —
// and Change opens the first month the portal pays. Everything the old
// panels could do is still in the drawer: paste / replace / unlink the key,
// the feed window, match a name, Not ours / Put back, replay what was held.

export interface CommCalMonth {
  period: string
  label: string
  href: string
  orders: number
  unmatched: number
  run: { status: string; total: number } | null
  claims: number
  source: { tone: ChipTone; text: string; file: string | null }
}

export interface CommCalCard {
  label: string
  value: string
  note: string
  icon: 'calendar' | 'percent' | 'receipt' | 'people' | 'fileAlert'
  tone: 'default' | 'primary' | 'alert' | 'danger'
  href?: string
  noteLink?: boolean
}

export interface CommCalData {
  sub: { id: string; name: string; slug: string; schemeId: string | null }
  months: CommCalMonth[]
  cards: CommCalCard[]
  cutover: { firstPaidMonth: string; setAt: string; setByName: string | null; note: string | null } | null
  /** "June–August": the months with data the portal did not pay. */
  settledRange: string | null
  link: ErpLinkView | null
  sync: ErpSyncPanelData | null
  canManage: boolean
  canEdit: boolean
}

const PERIODS = (n: number) => `${n} PERIOD${n === 1 ? '' : 'S'}`
const COLS = 'minmax(0,1.6fr) 90px 150px 150px 140px minmax(0,1.6fr)'

function monthName(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function dayMonth(iso: string): string {
  return formatIntlDate(new Date(iso), { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')
}

/** A message a Server Action threw, or the line to show when production hid it. */
function reason(err: unknown, fallback: string): string | null {
  const text = err instanceof Error ? err.message : ''
  if (text.includes('NEXT_REDIRECT')) return null
  return text && !text.startsWith('An error occurred in the Server Components render') ? text : fallback
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  return now
}

function runChip(run: CommCalMonth['run']) {
  if (!run) return <Chip tone="run">not computed</Chip>
  const tone: ChipTone = run.status === 'computed' ? 'runOn' : run.status === 'applied' || run.status === 'locked' ? 'ledger' : run.status === 'draft' ? 'alert' : 'run'
  return <Chip tone={tone}>{run.status}</Chip>
}

export default function CommCalBody({ data, empty = null }: { data: CommCalData; empty?: React.ReactNode }) {
  const router = useRouter()
  const now = useNow()
  const [sourceOpen, setSourceOpen] = useState(false)
  const [paysOpen, setPaysOpen] = useState(false)
  const feed = data.link && data.sync ? { link: data.link, sync: data.sync } : null
  const erpState = !feed ? null : !feed.link.linked ? 'off' : feed.sync.lastEventAt ? 'on' : 'waiting'

  return (
    <>
      <div className={s.strip}>
        {feed ? (
          <div className={s.erp}>
            <span className={s.dot} data-state={erpState} aria-hidden="true" />
            <span className={s.strong}>{erpState === 'on' ? 'ERP receiving' : erpState === 'waiting' ? 'ERP linked' : 'ERP not linked'}</span>
            <span className={s.quiet}>
              {erpState === 'on'
                ? `last delivery ${formatAgo(feed.sync.lastEventAt, now)}`
                : erpState === 'waiting'
                  ? 'nothing received yet'
                  : 'paste its key under Data source'}
            </span>
          </div>
        ) : null}
        <div className={s.pays}>
          <span className={s.strong}>{data.cutover ? `Pays from ${monthName(data.cutover.firstPaidMonth)}` : 'Pays every month'}</span>
          {/* Who set the first paid month and when; no line explaining "Pays every month" (2026-10-12). */}
          {data.cutover ? (
            <span className={s.paysNote}>
              {`${data.settledRange ? `${data.settledRange} settled by hand` : 'Earlier months settled by hand'}${data.cutover.setByName ? ` · ${data.cutover.setByName}` : ''}, ${dayMonth(data.cutover.setAt)}`}
            </span>
          ) : null}
          {data.canManage && data.sub.schemeId ? (
            <button type="button" className={s.change} onClick={() => setPaysOpen(true)}>
              Change
            </button>
          ) : null}
        </div>
        {feed ? (
          <button type="button" className={s.source} data-open={sourceOpen ? 'true' : 'false'} onClick={() => setSourceOpen(o => !o)} aria-expanded={sourceOpen}>
            Data source
            <span className={s.sourceChev}>
              <Chevron right />
            </span>
          </button>
        ) : null}
      </div>

      {data.months.length === 0 ? empty : (
        <>
          <Cards label={`Commission Calculation for ${data.sub.name}`} style={{ marginBottom: 26 }}>
            {data.cards.map(c => (
              <Card
                key={c.label}
                label={c.label}
                value={c.value}
                note={c.note}
                icon={c.icon}
                tone={c.tone}
                noteLink={c.noteLink}
                onClick={c.href ? () => router.push(c.href!) : undefined}
              />
            ))}
          </Cards>

          <SectHead title="Months with sales data" count={PERIODS(data.months.length)} />
          <GridTable label="Months with sales data">
            <GridHead
              cols={COLS}
              cellStyle={{ padding: '13px 14px' }}
              cells={[
                'Month',
                { label: 'Orders', style: { textAlign: 'right' } },
                { label: 'Unmatched agents', style: { textAlign: 'right' } },
                'Run',
                { label: 'Commission', style: { textAlign: 'right' } },
                { label: 'Source', style: { padding: '13px 14px 13px 28px' } },
              ]}
            />
            {data.months.map((m, i) => (
              <MonthRow key={m.period} m={m} zebra={i % 2 === 1} />
            ))}
          </GridTable>
        </>
      )}

      {feed ? <DataSourceDrawer open={sourceOpen} onClose={() => setSourceOpen(false)} data={data} link={feed.link} sync={feed.sync} now={now} /> : null}
      <PaysFromWindow open={paysOpen} onClose={() => setPaysOpen(false)} data={data} />
    </>
  )
}

function MonthRow({ m, zebra }: { m: CommCalMonth; zebra: boolean }) {
  const router = useRouter()
  return (
      <GridRow
        cols={COLS}
        zebra={zebra}
        onClick={() => router.push(m.href)}
        title={`Open ${m.label}`}
        // A month is the heaviest page in the department: rendered while the pointer rests on it.
        onMouseEnter={() => warmOnIntent(router, m.href)}
        onMouseLeave={cancelWarmIntent}
      >
        <div style={{ padding: '11px 14px' }} role="cell">
          <div className={s.monthLabel}>{m.label}</div>
          {m.claims > 0 ? (
            <a
              href={`${m.href}?view=claims`}
              className={s.claims}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                router.push(`${m.href}?view=claims`)
              }}
            >
              {m.claims} possible double claim{m.claims === 1 ? '' : 's'}
            </a>
          ) : null}
        </div>
        <span role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px' }}>{m.orders}</span>
        <span role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px', color: m.unmatched > 0 ? 'rgb(var(--hv-danger))' : undefined }}>
          {m.unmatched}
        </span>
        <span role="cell" style={{ padding: '11px 14px' }}>{runChip(m.run)}</span>
        <span role="cell" className={`${hv.right} ${hv.mono}`} style={{ padding: '11px 14px' }}>
          {m.run ? formatMoney(m.run.total) : '—'}
        </span>
        <div role="cell" style={{ padding: '9px 14px 9px 28px' }}>
          {m.source.text ? <Chip tone={m.source.tone}>{m.source.text}</Chip> : null}
          {m.source.file ? <div className={s.file}>{m.source.file}</div> : null}
        </div>
      </GridRow>
  )
}

function PaysFromWindow({ open, onClose, data }: { open: boolean; onClose: () => void; data: CommCalData }) {
  const router = useRouter()
  const cutover = data.cutover
  const [month, setMonth] = useState(cutover ? cutover.firstPaidMonth.slice(0, 7) : '')
  const [note, setNote] = useState(cutover?.note ?? '')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function run(act: () => Promise<void>, done: string) {
    setError('')
    start(async () => {
      try {
        await act()
        onClose()
        router.refresh()
        flash(done)
      } catch (err) {
        const r = reason(err, 'That did not save')
        if (r) setError(r)
      }
    })
  }

  return (
    <Window open={open} onClose={onClose} width={420} scrim={0.22} z={32} label="The portal pays from" style={{ borderRadius: 14, border: '1px solid rgb(229 228 223)', boxShadow: '0 16px 48px rgb(43 31 23 / .2)' }}>
      <div className={s.form}>
        <div>
          <div className={s.formTitle}>Pays from</div>
          <div className={s.formSub}>
            The first month the portal pays. Earlier months were settled by hand: their bills never carry into a run,
            and a change the ERP makes to one is a drop or an upsell to confirm.
          </div>
        </div>
        <label className={s.field}>
          <span className={s.fieldLabel}>First month the portal pays</span>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={hv.input} style={{ width: 200 }} />
        </label>
        <label className={s.field}>
          <span className={s.fieldLabel}>Why (optional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. June–August paid from the claim forms" className={hv.input} />
        </label>
        {error ? <p className={s.dsError}>{error}</p> : null}
        <div className={s.formFoot}>
          {cutover ? (
            <button
              type="button"
              className={hv.linkBtn}
              style={{ marginRight: 'auto', fontSize: 12.5 }}
              disabled={pending}
              onClick={() => {
                if (window.confirm('Let the portal pay every month again? Bills of earlier months will carry into the next run until a run pays them.')) {
                  run(() => clearFirstPaidMonth(data.sub.id), 'The portal pays every month again')
                }
              }}
            >
              Pay every month
            </button>
          ) : null}
          <button type="button" className={btn('outline')} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btn('primary')}
            style={{ padding: '8px 16px' }}
            disabled={pending || !/^\d{4}-\d{2}$/.test(month)}
            onClick={() => run(() => setFirstPaidMonth(data.sub.id, `${month}-01`, note), `Pays from ${monthName(`${month}-01`)}`)}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Window>
  )
}

function DataSourceDrawer({
  open,
  onClose,
  data,
  link,
  sync,
  now,
}: {
  open: boolean
  onClose: () => void
  data: CommCalData
  link: ErpLinkView
  sync: ErpSyncPanelData
  now: number
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [keyOpen, setKeyOpen] = useState(!link.linked)
  const [windowOpen, setWindowOpen] = useState(false)
  const [error, setError] = useState('')
  const [why, setWhy] = useState<Record<string, string>>({})

  function act(fn: () => Promise<unknown>, done: (result: unknown) => string, after?: () => void) {
    setError('')
    start(async () => {
      try {
        const result = await fn()
        after?.()
        router.refresh()
        flash(done(result))
      } catch (err) {
        const r = reason(err, 'That did not go through')
        if (r) setError(r)
      }
    })
  }

  const chip = link.linked ? (sync.lastEventAt ? <Chip tone="ledger">Receiving</Chip> : <Chip tone="info">Waiting for the ERP</Chip>) : <Chip tone="plain">Not linked</Chip>

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={440}
      eyebrow={data.sub.name}
      eyebrowStyle={{ letterSpacing: '.18em' }}
      title="Data source"
      titleStyle={{ fontSize: 18, marginTop: 4 }}
    >
      <div className={s.dsBody}>
        <div className={s.dsRow}>
          <span className={s.dsTitle}>Houzs ERP</span>
          {chip}
        </div>
        {link.linked ? (
          <div className={s.dsMono}>
            key {link.keyHint ?? ''}
            {link.linkedByName ? ` · pasted by ${link.linkedByName}` : ''}
            {link.linkedAt ? ` on ${formatDate(link.linkedAt)}` : ''}
          </div>
        ) : null}
        {keyOpen && data.canManage ? (
          <form
            className={s.dsCard}
            action={fd =>
              act(
                () => linkErpKey(fd),
                () => (link.linked ? 'Key replaced — the ERP sends with the new key' : 'ERP linked — deliveries are accepted from now on'),
                () => setKeyOpen(false),
              )
            }
          >
            <input type="hidden" name="sub_department_id" value={link.subDepartmentId} />
            <span className={s.dsLabel}>API key from the ERP</span>
            <div className={s.dsInline}>
              <input name="api_key" type="password" required placeholder="Paste the key the ERP generated" className={hv.input} style={{ flex: 1, minWidth: 0 }} aria-label="API key" />
              <button type="submit" className={btn('primary')} disabled={pending}>
                {link.linked ? 'Save key' : 'Link'}
              </button>
              {link.linked ? (
                <button type="button" className={btn('outline')} onClick={() => setKeyOpen(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
            <span className={s.dsNote}>
              On the ERP, open Venture Portal Feed and press Generate API key. After pasting it here, press Test connection there, then Turn on.
            </span>
          </form>
        ) : null}
        <div>
          <div className={s.dsLabel}>The ERP sends to</div>
          <button
            type="button"
            className={s.dsUrl}
            title="Copy the address"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.receiverUrl)
                flash('Address copied')
              } catch {
                /* the address is on screen to select by hand */
              }
            }}
          >
            {link.receiverUrl}
          </button>
        </div>
        {windowOpen ? (
          <form
            className={s.dsCard}
            action={fd => act(() => setErpFeedWindow(fd), () => 'Feed window saved', () => setWindowOpen(false))}
          >
            <input type="hidden" name="sub_department_id" value={link.subDepartmentId} />
            <span className={s.dsLabel}>Ignore orders before</span>
            <div className={s.dsInline}>
              <input name="min_order_date" type="date" defaultValue={link.minOrderDate ?? ''} className={hv.input} aria-label="Ignore orders before" />
              <button type="submit" className={btn('primary')} disabled={pending}>
                Save
              </button>
              <button type="button" className={btn('outline')} onClick={() => setWindowOpen(false)}>
                Cancel
              </button>
            </div>
            <span className={s.dsNote}>
              An order dated before this is accepted and thrown away — the ERP is told it succeeded, so its queue never backs up, and no month is made for it.
            </span>
          </form>
        ) : (
          <div className={s.dsRow} style={{ fontSize: 12.5 }}>
            <span>
              <span className={s.dsLabel}>Ignore orders before</span>&nbsp; {link.minOrderDate ? formatDate(link.minOrderDate) : 'nothing — every year the ERP holds arrives'}
            </span>
            {data.canManage ? (
              <button type="button" className={hv.linkBtn} onClick={() => setWindowOpen(true)}>
                Change
              </button>
            ) : null}
          </div>
        )}
        {link.linked && data.canManage ? (
          <div className={s.dsLinks}>
            <button type="button" className={hv.linkBtn} onClick={() => setKeyOpen(true)}>
              Replace key
            </button>
            <button
              type="button"
              className={`${hv.linkBtn} ${s.dsDanger}`}
              disabled={pending}
              onClick={() => {
                if (window.confirm("Forget the ERP's key? Its deliveries are refused from now on; orders already received stay.")) {
                  act(() => unlinkErpKey(link.subDepartmentId), () => 'ERP unlinked — its deliveries are refused from now on')
                }
              }}
            >
              Unlink
            </button>
          </div>
        ) : null}
        {error ? <p className={s.dsError}>{error}</p> : null}

        <div className={s.dsRule} />
        <div className={s.dsRow}>
          <span className={s.dsTitle}>ERP live feed</span>
          <span className={s.dsMono} style={{ color: 'rgb(var(--hv-brown))' }}>
            {sync.lastEventAt ? `last event ${formatAgo(sync.lastEventAt, now)}` : 'nothing received yet'}
          </span>
        </div>

        {sync.unmatched.length > 0 ? (
          <>
            <div className={s.dsSub}>Salespeople the feed could not place</div>
            <div className={s.dsText}>
              These names match nobody in the portal, so their orders pay no one until you say who they are. Some are nobody at all — Not ours takes their bills out of the month.
            </div>
            {sync.unmatched.map(u => (
              <form
                key={`${u.agentKey}|${u.erpSalespersonId ?? ''}`}
                className={s.dsCard}
                action={fd => act(() => matchErpSalesperson(fd), r => matchOutcomeNote(u.agentName, r as MatchOutcome))}
              >
                <input type="hidden" name="sub_department_id" value={sync.subDepartmentId} />
                <input type="hidden" name="agent_key" value={u.agentKey} />
                <input type="hidden" name="erp_salesperson_id" value={u.erpSalespersonId ?? ''} />
                <div className={s.dsRow} style={{ fontSize: 12.5 }}>
                  <span>
                    <b style={{ fontWeight: 500 }}>{u.agentName}</b> <span className={s.dsId}>{u.erpSalespersonId?.slice(0, 8)}</span>
                  </span>
                  <span className={s.dsMono}>
                    {u.orders} bill{u.orders === 1 ? '' : 's'} · {formatMoney(u.total)}
                  </span>
                </div>
                {data.canEdit ? (
                  <div className={s.dsInline}>
                    <Select name="staff_id" required defaultValue={u.suggestedStaffId ?? ''} style={{ flex: 1, minWidth: 0 }} aria-label={`Match ${u.agentName}`}>
                      <option value="">Pick a salesperson…</option>
                      {sync.staff.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.code ? ` · ${p.code}` : ''}
                        </option>
                      ))}
                    </Select>
                    <button type="submit" className={btn('primary')} disabled={pending} style={{ padding: '7px 12px', fontSize: 12.5 }}>
                      Match
                    </button>
                  </div>
                ) : null}
                {data.canEdit ? (
                  <div className={s.dsInline}>
                    <input
                      value={why[u.agentKey] ?? ''}
                      onChange={e => setWhy(w => ({ ...w, [u.agentKey]: e.target.value }))}
                      placeholder="Why it is not ours"
                      className={hv.input}
                      style={{ flex: 1, minWidth: 0, padding: '6px 9px', fontSize: 12.5 }}
                      aria-label={`Why ${u.agentName} is not ours`}
                    />
                    <button
                      type="button"
                      className={btn('danger')}
                      disabled={pending}
                      style={{ padding: '6px 10px', fontSize: 12.5 }}
                      onClick={() => {
                        if (window.confirm(`${u.agentName} is not ours? Their ${u.orders} ${u.orders === 1 ? 'bill' : 'bills'} (${formatMoney(u.total)}) leave the month and will never pay anybody.`)) {
                          act(() => ignoreErpAgent(u.agentKey, u.erpSalespersonId, sync.subDepartmentId, why[u.agentKey]), r => ignoreOutcomeNote(u.agentName, r as Parameters<typeof ignoreOutcomeNote>[1]))
                        }
                      }}
                    >
                      Not ours
                    </button>
                  </div>
                ) : null}
              </form>
            ))}
          </>
        ) : null}

        <div className={s.dsText}>Not our salespeople — the ERP keeps naming these; their bills stay out of the month.</div>
        <div>
          {sync.ignored.length === 0 ? (
            <div className={s.dsListRow} style={{ color: 'rgb(var(--hv-brown))' }}>Nobody so far.</div>
          ) : (
            sync.ignored.map(g => (
              <div key={g.agentKey} className={s.dsListRow} title={g.note ?? undefined}>
                <span>
                  <b>{g.agentName}</b> <span className={s.dsId}>{g.erpSalespersonId?.slice(0, 8)}</span>
                  {data.canEdit ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className={s.putBack}
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Put ${g.agentName} back on the list to be answered? Their ${g.orders} ${g.orders === 1 ? 'bill counts' : 'bills count'} towards the month again.`)) {
                            act(() => unignoreErpAgent(g.agentKey, sync.subDepartmentId), n => `${g.agentName} is back on the list — ${n} ${n === 1 ? 'bill counts' : 'bills count'} again`)
                          }
                        }}
                      >
                        Put back
                      </button>
                    </>
                  ) : null}
                </span>
                <span className={s.dsMono} style={{ fontSize: 12.5 }}>
                  {g.orders} bill{g.orders === 1 ? '' : 's'} · {formatMoney(g.total)}
                </span>
              </div>
            ))
          )}
        </div>

        {sync.held.length > 0 ? (
          <>
            <div className={s.dsSub}>Held deliveries</div>
            <div className={s.dsText}>
              The ERP changed these orders after the month went to payroll, while it was closed to the feed, or after it was imported from a file. Replay once the month is open again.
            </div>
            {sync.held.map(h => (
              <div key={h.period} className={s.dsListRow}>
                <span>
                  <b>{/^\d{4}-\d{2}-\d{2}$/.test(h.period) ? monthName(h.period) : h.period}</b>
                </span>
                {/^\d{4}-\d{2}-01$/.test(h.period) && data.canEdit ? (
                  <button
                    type="button"
                    className={btn('outline')}
                    disabled={pending}
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() =>
                      act(() => replayHeldErpEvents(h.period, sync.subDepartmentId), r => {
                        const x = r as { applied: number; stillHeld: number; replayed: number }
                        return `${monthName(h.period)}: ${x.applied} applied, ${x.stillHeld} still held`
                      })
                    }
                  >
                    Replay {h.count}
                  </button>
                ) : (
                  <span className={s.dsMono}>{h.count} held</span>
                )}
              </div>
            ))}
          </>
        ) : null}

        {sync.events.length > 0 ? (
          <details className={s.dsDetails}>
            <summary>Recent deliveries · {sync.events.length}</summary>
            <div style={{ marginTop: 8 }}>
              {sync.events.map(e => (
                <div key={e.id} className={s.dsEvent}>
                  <span className={s.dsMono}>{formatAgo(e.receivedAt, now)}</span>
                  <span className={s.dsMono} title={e.message ?? undefined}>
                    {e.docNo ?? '—'}
                  </span>
                  <Chip tone={e.status === 'applied' ? 'ledger' : e.status === 'held' ? 'alert' : e.status === 'rejected' || e.status === 'error' ? 'danger' : 'info'}>{e.status}</Chip>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Drawer>
  )
}
