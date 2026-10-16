'use client'

import { useMemo, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import { Button } from '@/components/ds/Button'
import { Banner, DataTable, DescriptionList, StatusChip, type Column } from '@/components/ds/Data'
import { DsSelect, Field, Textarea } from '@/components/ds/Field'
import { Toast, useFlash } from '@/components/ds/Overlay'
import { attendanceFileLink, decideRequest, saveRoute } from '@/lib/attendance/actions'
import { balanceOf } from '@/lib/attendance/engine'
import type { FileLink } from '@/lib/attendance/files'
import { ROUTE_WORDS, amountLabel, bucketOf, decidedToast, flowNodes, kindLabel, sinceLabel, statusOf, waitingStep, whenLabel, type Bucket } from '@/lib/attendance/requests'
import type { AttConfig, AttLedger, AttRequest, AttRoute, Route } from '@/lib/attendance/types'
import { Avatar, HoverButton, NodeTrack, Pill } from './bits'
import { downloadCsv } from './BalanceCsv'
import { RequestAttachmentPanel } from './RequestAttachmentPanel'
import { RequestOnBehalf } from './RequestOnBehalf'

/**
 * Attendance › Requests (2026-10-15, the handoff's `isRequests`, `HR
 * Attendance.dc.html` lines 218–293): Requests | Approval routes. Incoming on
 * the left — Pending (waiting for HR), At upline, Decided — and the picked one
 * on the right: its facts, the changes asked for, the attachment, the approval
 * flow, the note and Reject / Approve. HR decides its own step, or the
 * upline's on their behalf (recorded as such); a rejection needs a note.
 */

const BUCKETS: Array<[Bucket, string]> = [['hr', 'Pending'], ['upline', 'At upline'], ['decided', 'Decided']]

export default function RequestsView({ config, requests, ledger }: { config: AttConfig; requests: AttRequest[]; ledger: AttLedger | null }) {
  const [sub, setSub] = useState<'list' | 'routes'>('list')
  // `?r=<request id>` opens one request (Month close's Open), on the pill it sits in.
  const askedId = useSearchParams().get('r')
  const asked = requests.find(r => r.id === askedId) ?? null
  const [bucket, setBucket] = useState<Bucket>(asked ? bucketOf(asked) : 'hr')
  const [reqId, setReqId] = useState<string | null>(asked?.id ?? null)
  const [note, setNote] = useState('')
  const [attOpen, setAttOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [toast, flash] = useFlash()
  const [pending, start] = useTransition()
  const [file, setFile] = useState<FileLink | null>(null)
  const [, startFile] = useTransition()
  const now = useMemo(() => new Date(), [requests])

  const counts = { hr: 0, upline: 0, decided: 0 } as Record<Bucket, number>
  for (const r of requests) counts[bucketOf(r)]++
  const rows = requests.filter(r => bucketOf(r) === bucket)
  const req = requests.find(r => r.id === reqId) ?? null

  const exportCsv = () =>
    downloadCsv(`Attendance_requests_${config.today}.csv`, [
      ['Code', 'Person', 'Request', 'When', 'Amount', 'Route', 'Status'],
      ...rows.map(r => [r.ref, r.who, kindLabel(r, config.leaveTypes), whenLabel(r), amountLabel(r), ROUTE_WORDS[r.route], statusOf(r)[1]]),
    ])

  // The attachment, through a ten-minute link made at the press (the `attendance` bucket, 2026-10-15).
  const download = () => {
    if (!req) return
    startFile(async () => {
      const r = await attendanceFileLink('request', req.id, true)
      if (!r.ok) return flash(r.reason)
      window.location.assign(r.data.url)
    })
  }
  const view = () => {
    if (!req) return
    startFile(async () => {
      const r = await attendanceFileLink('request', req.id)
      if (!r.ok) return flash(r.reason)
      setFile(r.data)
      setAttOpen(true)
    })
  }

  const decide = (approve: boolean) => {
    if (!req) return
    start(async () => {
      const res = await decideRequest(req.id, approve, note)
      if (!res.ok) return flash(res.reason)
      setNote('')
      setReqId(null)
      flash(decidedToast(req, approve))
    })
  }

  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Requests" right={<Button variant="secondary" onClick={exportCsv}>Export</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        <div style={{ margin: '-6px 0 -16px' }}>
          <Tabs
            items={[{ key: 'list', label: 'Requests' }, { key: 'routes', label: 'Approval routes' }]}
            active={sub}
            onSelect={k => setSub(k as 'list' | 'routes')}
            size="compact"
            label="Requests"
          />
        </div>
        {sub === 'list' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '350px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
            <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--ds-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>Incoming</span>
                {config.canCreate ? <Button variant="secondary" size="sm" onClick={() => setNewOpen(true)}>+ On someone&apos;s behalf</Button> : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BUCKETS.map(([k, label]) => (
                  <Pill key={k} label={label} n={counts[k]} on={bucket === k} onClick={() => { setBucket(k); setReqId(null) }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rows.map(r => {
                  const on = reqId === r.id
                  return (
                    <HoverButton
                      key={r.id}
                      onClick={() => { setReqId(r.id); setNote(''); setAttOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', border: 0, borderRadius: 8, background: on ? 'rgb(255 245 233)' : 'transparent', boxShadow: on ? 'inset 2px 0 0 rgb(233 154 83)' : 'none', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer' }}
                    >
                      <Avatar name={r.who} size={30} />
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.who}</span>
                        <span style={{ fontSize: 12, color: 'var(--ds-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${kindLabel(r, config.leaveTypes)} · ${whenLabel(r)}`}</span>
                      </span>
                      <span suppressHydrationWarning style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ds-ink-3)' }}>{sinceLabel(r, now)}</span>
                    </HoverButton>
                  )
                })}
                {rows.length === 0 ? <div style={{ padding: '18px 0', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>Nothing waiting.</div> : null}
              </div>
            </div>
            <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, background: 'var(--ds-surface)', minHeight: 200 }}>
              {!req ? (
                <div style={{ padding: '80px 20px', textAlign: 'center', fontSize: 13, color: 'var(--ds-ink-2)' }}>Pick a request on the left.</div>
              ) : (
                <RequestDetail
                  req={req}
                  config={config}
                  ledger={ledger}
                  note={note}
                  setNote={setNote}
                  busy={pending}
                  onDecide={decide}
                  onClose={() => setReqId(null)}
                  onView={view}
                  onDownload={download}
                />
              )}
            </div>
          </div>
        ) : (
          <RoutesTable config={config} onSaved={m => flash(m)} />
        )}
      </div>
      {req && attOpen ? <RequestAttachmentPanel req={req} file={file} kind={kindLabel(req, config.leaveTypes)} when={whenLabel(req)} onClose={() => setAttOpen(false)} onDownload={download} /> : null}
      {newOpen ? <RequestOnBehalf config={config} onClose={() => setNewOpen(false)} onSent={m => { setNewOpen(false); flash(m) }} onError={m => flash(m)} /> : null}
      <Toast message={toast} />
    </HvPage>
  )
}

function RequestDetail({
  req,
  config,
  ledger,
  note,
  setNote,
  busy,
  onDecide,
  onClose,
  onView,
  onDownload,
}: {
  req: AttRequest
  config: AttConfig
  ledger: AttLedger | null
  note: string
  setNote: (v: string) => void
  busy: boolean
  onDecide: (approve: boolean) => void
  onClose: () => void
  onView: () => void
  onDownload: () => void
}) {
  const [tone, label] = statusOf(req)
  const w = waitingStep(req)
  const hrW = w?.role === 'hr', upW = w?.role === 'upline'
  const canDecide = (hrW || upW) && config.canApprove
  const person = config.people.find(p => p.id === req.staffId)
  const own = !!person && person.hasLogin && person.name === config.me
  const type = req.kind === 'leave' ? config.leaveTypes.find(t => t.code === req.leaveCode) : null
  let balLine = '—'
  if (type && person && ledger) {
    if (type.unpaid) balLine = `To payroll as ${req.days ?? ''} unpaid day${req.days === 1 ? '' : 's'}`.replace('  ', ' ')
    else if (req.status === 'pending') {
      const b = balanceOf(person, type, config, ledger, config.today)
      if (b.left != null) balLine = `${Math.round(b.left * 100) / 100} ${type.drawsFrom ?? type.code} left after this`
    }
  }
  const facts = [
    { label: 'Amount', value: amountLabel(req) },
    { label: 'Route', value: ROUTE_WORDS[req.route] },
    { label: 'Reason', value: req.reason || '—' },
    { label: 'Balance', value: balLine },
  ]
  const changes = Array.isArray(req.detail.changes) ? (req.detail.changes as Array<{ field?: string; from?: string; to?: string }>) : []
  const diffCols: Column<{ id: number; f: string; from: string; to: string }>[] = [
    // Wide enough for "Emergency relationship" (2026-10-15: a profile change's fields are People's own names).
    { key: 'f', label: 'Field', width: '190px', render: r => <span style={{ fontWeight: 500 }}>{r.f}</span> },
    { key: 'from', label: 'On record', width: 'minmax(0,1fr)', mono: true },
    { key: 'to', label: 'Asked for', width: 'minmax(0,1fr)', mono: true, render: r => <span style={{ background: 'var(--ds-accent-soft)', padding: '1px 4px', borderRadius: 4 }}>{r.to}</span> },
  ]
  const nodes = flowNodes(req)
  const sick = req.leaveCode === 'SL' || req.leaveCode === 'HL'
  return (
    <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', fontFamily: 'var(--font-mono)' }}>{req.ref}</div>
          <div style={{ fontSize: 19, fontWeight: 500, marginTop: 4 }}>{`${req.who} · ${kindLabel(req, config.leaveTypes)}`}</div>
          <div style={{ fontSize: 13, color: 'var(--ds-ink-2)', marginTop: 3 }}>{whenLabel(req)}</div>
        </div>
        <StatusChip tone={tone}>{label}</StatusChip>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DescriptionList items={facts} />
        {changes.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>Changes asked for · applied to the record only when you approve</div>
            <DataTable columns={diffCols} rows={changes.map((c, i) => ({ id: i, f: c.field ?? '', from: c.from ?? '—', to: c.to ?? '' }))} zebra={false} />
          </div>
        ) : null}
        {req.hasAttachment ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--ds-border)', borderRadius: 10 }}>
            <div style={{ width: 44, height: 56, borderRadius: 6, background: 'var(--ds-surface-3)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ds-ink-3)' }}>{sick ? 'MC' : 'DOC'}</div>
            <div style={{ flex: 1, fontSize: 13 }}>{req.attachment ?? 'Attachment'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={onDownload}>Download</Button>
              <Button size="sm" onClick={onView}>View</Button>
            </div>
          </div>
        ) : null}
        <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, padding: '16px 16px 14px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)', marginBottom: 12 }}>Approval flow</div>
          <NodeTrack
            nodes={nodes.map((st, i) => ({
              state: st.state,
              n: i,
              lines: (
                <>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{st.role}</span>
                  <span style={{ fontSize: 12, color: 'var(--ds-ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.who}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: st.stateFg }}>{st.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ds-ink-3)' }}>{st.at}</span>
                </>
              ),
            }))}
          />
        </div>
        {upW && config.canApprove ? (
          <Banner tone="info" title="Waiting at the upline">{`You may decide on ${w?.approver}'s behalf if they are away. It is recorded as such.`}</Banner>
        ) : null}
        {canDecide ? (
          <Field label="Note" hint="Needed to reject. The requester sees it.">
            <Textarea value={note} onChange={setNote} rows={2} />
          </Field>
        ) : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--ds-border)', paddingTop: 14 }}>
        {canDecide ? (
          <>
            <Button variant="secondary" disabled={busy || !note.trim()} onClick={() => onDecide(false)}>Reject</Button>
            <Button disabled={busy || own} onClick={() => onDecide(true)}>{upW ? 'Approve on behalf' : 'Approve'}</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        )}
      </div>
    </div>
  )
}

type RouteRow = AttRoute & { g: string } & Record<string, unknown>

function RoutesTable({ config, onSaved }: { config: AttConfig; onSaved: (m: string) => void }) {
  const [, start] = useTransition()
  const [local, setLocal] = useState<Record<string, Route>>({})
  const rows: RouteRow[] = config.routes.map(r => ({ ...r, route: local[r.id] ?? r.route, g: r.scope === 'company' ? 'Company' : 'Title override' }))
  const save = (r: RouteRow, route: Route) => {
    setLocal(l => ({ ...l, [r.id]: route }))
    start(async () => {
      const res = await saveRoute(r.id, { scope: r.scope, kinds: r.kinds, label: r.label, titleId: r.titleId, route, why: r.why })
      onSaved(res.ok ? 'Route saved · applies to new requests' : res.reason)
    })
  }
  const cols: Column<RouteRow>[] = [
    { key: 'label', label: 'Request', width: 'minmax(0,1.2fr)', render: r => <span style={{ fontWeight: 500 }}>{r.label}</span> },
    {
      key: 'route',
      label: 'Route',
      width: '200px',
      render: r => (
        <DsSelect
          value={r.route}
          disabled={!config.canEdit}
          onChange={v => save(r, v as Route)}
          options={[{ value: 'upline_then_hr', label: 'Upline → HR' }, { value: 'hr_only', label: 'HR only' }, { value: 'upline_only', label: 'Upline only' }]}
        />
      ),
    },
    { key: 'why', label: 'Why', width: 'minmax(0,1.6fr)' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <DataTable columns={cols} rows={rows} groupBy="g" empty="No approval routes yet." />
    </div>
  )
}
