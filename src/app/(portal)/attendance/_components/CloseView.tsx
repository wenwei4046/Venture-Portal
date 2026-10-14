'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { SegmentedControl } from '@/components/ds/Controls'
import { StatusChip } from '@/components/ds/Data'
import { Field, Textarea } from '@/components/ds/Field'
import { CenterWindow, PanelHead, Toast, useFlash } from '@/components/ds/Overlay'
import { closeMonth, decideDay, reopenMonth } from '@/lib/attendance/actions'
import { closeLabel, closeNodes, dayLine, dueLine, kindLabel, waitingAt, waitingIn, whenLabel } from '@/lib/attendance/close'
import { daysToDecide, dayMon, monthDays, monthLabel, monthName, registerOf, trackedPeople, type Ctx } from '@/lib/attendance/engine'
import type { AttConfig, AttMonth, AttRequest } from '@/lib/attendance/types'
import { Avatar, Label, NodeTrack, Pill } from './bits'

/**
 * HR › Attendance › Month close (2026-10-15, the handoff's `isClose`): freeze
 * a month before payroll. Every absent or incomplete day is decided (Unpaid ·
 * Excused · Corrected) and every request touching the month decided; then
 * Close freezes the register (one row per person) and Reopen, with a reason,
 * thaws it.
 */

const DECIDE = ['Unpaid', 'Excused', 'Corrected'] as const
type Decision = (typeof DECIDE)[number]

const card = { border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)' } as const

export default function CloseView({ config, month, requests, today, now }: { config: AttConfig; month: AttMonth; requests: AttRequest[]; today: string; now: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [toast, flash] = useFlash()
  const [filter, setFilter] = useState<'days' | 'reqs'>('days')
  // Decisions shown at once, before the server's answer comes back.
  const [local, setLocal] = useState<Record<string, Decision>>({})
  const [reopen, setReopen] = useState<string | null>(null)
  const ctx: Ctx = useMemo(() => ({ config, month, today, now }), [config, month, today, now])
  const m = month.month
  const closed = month.close?.status === 'closed'
  const days = useMemo(() => daysToDecide(ctx), [ctx])
  const waiting = useMemo(() => waitingIn(requests, m), [requests, m])
  const people = useMemo(() => trackedPeople(ctx, monthDays(m)).length, [ctx, m])
  const leaveNames = useMemo(() => new Map(config.leaveTypes.map(t => [t.code, t.name])), [config.leaveTypes])
  const k = (staffId: string, day: string) => `${staffId}|${day}`
  const decisionOf = (staffId: string, day: string, fallback: string | null) => local[k(staffId, day)] ?? (fallback as Decision | null)
  const undecided = days.filter(d => !decisionOf(d.person.id, d.day, d.decision)).length
  const wt = waiting.length
  const left = undecided + wt
  const blocked = closed || left > 0 || !config.canEdit
  const closedAt = month.close?.closedAt ? `${dayMon(month.close.closedAt.slice(0, 10))} · ${month.close.closedAt.slice(11, 16)}` : null
  const nodes = closeNodes(wt, undecided, closed, closedAt)
  const curI = nodes.findIndex(n => !n.done)

  const decide = (staffId: string, day: string, v: string) => {
    if (closed || !config.canEdit) return
    setLocal(o => ({ ...o, [k(staffId, day)]: v as Decision }))
    start(async () => {
      const r = await decideDay(staffId, day, v as Decision)
      if (!r.ok) {
        setLocal(o => {
          const n = { ...o }
          delete n[k(staffId, day)]
          return n
        })
        flash(r.reason)
      } else router.refresh()
    })
  }
  const doClose = () =>
    start(async () => {
      const r = await closeMonth(m, registerOf(ctx))
      if (!r.ok) return flash(r.reason)
      flash(`${monthLabel(m)} closed · ${r.data.people} people frozen`)
      router.refresh()
    })
  const doReopen = () => {
    const reason = (reopen ?? '').trim()
    if (!reason) return
    start(async () => {
      const r = await reopenMonth(m, reason)
      if (!r.ok) return flash(r.reason)
      setReopen(null)
      flash('Reopened · reason recorded')
      router.refresh()
    })
  }

  const files = [
    { name: 'Statutory register', sub: 'Hours, days, OT, rest-day and holiday work, leave', btn: 'Download', href: `/attendance/close/register?m=${m.slice(0, 7)}` },
    { name: `Payroll · ${monthName(m)} run`, sub: 'OT hours by rate and unpaid days, sent on close', btn: 'Open payroll', href: '/hr-costing/payroll' },
  ]

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Month close" right={<Button variant="secondary" onClick={() => { window.location.href = `/attendance/close/register?m=${m.slice(0, 7)}` }} disabled={!closed}>Export</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
        <div style={{ ...card, padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <Label style={{ display: 'block' }}>Closing</Label>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>{monthLabel(m)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ds-ink-2)', marginTop: 3 }}>{dueLine(m)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusChip tone={closed ? 'success' : 'warning'}>{closed ? 'Closed' : 'Open'}</StatusChip>
              {closed && config.canEdit ? <Button variant="secondary" size="sm" onClick={() => setReopen('')}>Reopen</Button> : null}
            </div>
          </div>
          <NodeTrack
            nextRing="var(--ds-border)"
            nodes={nodes.map((n, i) => ({
              n: i + 1,
              state: n.done ? 'done' : i === curI ? 'current' : 'next',
              lines: (
                <>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{n.label}</span>
                  <span style={{ fontSize: 12, color: n.done ? 'var(--ds-success)' : i === curI ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink-3)' }}>{n.note}</span>
                </>
              ),
            }))}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>To clear before closing</span>
                <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>Absent or incomplete days · waiting requests</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill label="Days to decide" n={undecided} on={filter === 'days'} onClick={() => setFilter('days')} />
                <Pill label="Requests waiting" n={wt} on={filter === 'reqs'} onClick={() => setFilter('reqs')} />
              </div>
              {filter === 'days' ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {days.map((d, i) => {
                    const v = decisionOf(d.person.id, d.day, d.decision)
                    return (
                      <div key={k(d.person.id, d.day)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderTop: i ? '1px solid var(--ds-border)' : '0' }}>
                        <Avatar name={d.person.name} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{d.person.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--ds-success)' }}>{v ? `✓ ${v.toLowerCase()}` : ''}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ds-ink-2)', marginTop: 2 }}>{dayLine(d.day, d.code, d.info.in)}</div>
                        </div>
                        <SegmentedControl options={[...DECIDE]} value={v} onChange={x => decide(d.person.id, d.day, x)} size="sm" />
                      </div>
                    )
                  })}
                  {days.length === 0 ? <div style={{ padding: '22px 0', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>No days to decide.</div> : null}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {waiting.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderTop: i ? '1px solid var(--ds-border)' : '0' }}>
                      <Avatar name={r.who} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.who}</div>
                        <div style={{ fontSize: 12, color: 'var(--ds-ink-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {kindLabel(r, leaveNames)} · {whenLabel(r)}
                        </div>
                      </div>
                      <StatusChip tone="warning">{waitingAt(r)}</StatusChip>
                      <Button variant="secondary" size="sm" onClick={() => router.push(`/attendance/requests?r=${r.id}`)}>Open</Button>
                    </div>
                  ))}
                  {wt === 0 ? <div style={{ padding: '22px 0', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>No requests waiting.</div> : null}
                </div>
              )}
            </div>
            <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, opacity: closed ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>Outputs</span>
                <span style={{ fontSize: 12, color: 'var(--ds-ink-3)' }}>{closed ? 'Register kept 7 years' : 'After closing'}</span>
              </div>
              {files.map((o, i) => (
                <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--ds-border)' : '0' }}>
                  <span style={{ width: 34, height: 38, flex: 'none', borderRadius: 5, background: 'var(--ds-surface-3)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ds-ink-2)' }}>CSV</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ds-ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.sub}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!closed}
                    onClick={() => (o.href.startsWith('/hr-costing') ? router.push(o.href) : window.location.assign(o.href))}
                  >
                    {o.btn}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>Checklist</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['Requests decided', wt === 0, String(wt)], ['Days decided', undecided === 0, String(undecided)]].map(([label, ok, val]) => (
                  <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 18, height: 18, flex: 'none', borderRadius: '50%', background: ok ? 'var(--ds-success)' : 'transparent', border: `1.5px solid ${ok ? 'var(--ds-success)' : 'var(--ds-border)'}`, boxSizing: 'border-box', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{ok ? '✓' : ''}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: ok ? 'var(--ds-success)' : 'rgb(var(--tone-clay-deep))' }}>{ok ? '' : val}</span>
                  </div>
                ))}
              </div>
              <Button block size="lg" disabled={blocked || pending} onClick={doClose}>{closeLabel(m, closed, left)}</Button>
              <div style={{ fontSize: 12, color: 'var(--ds-ink-2)', lineHeight: 1.5 }}>
                Freezes days and OT for {people} {people === 1 ? 'person' : 'people'}, then sends them to {monthName(m)}&rsquo;s payroll run.
              </div>
            </div>
          </div>
        </div>
      </div>

      <CenterWindow open={reopen !== null} onClose={() => setReopen(null)} width={440}>
        <PanelHead eyebrow="Month close" title={`Reopen ${monthLabel(m)}`} titleSize={18} padding="18px 20px 14px" onClose={() => setReopen(null)} />
        <div style={{ padding: '18px 20px' }}>
          <Field label="Reason" hint="Required. Saved to the audit trail.">
            <Textarea value={reopen ?? ''} onChange={setReopen} rows={2} placeholder="e.g. Late MC for 9 Oct" />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--ds-border)' }}>
          <Button variant="secondary" size="sm" onClick={() => setReopen(null)}>Cancel</Button>
          <Button size="sm" disabled={!(reopen ?? '').trim() || pending} onClick={doReopen}>Reopen</Button>
        </div>
      </CenterWindow>
      <Toast message={toast} />
    </HvPage>
  )
}
