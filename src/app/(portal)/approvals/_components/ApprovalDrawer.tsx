'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { Chip } from '@/components/finv/Hub'
import { HrIcon } from '@/components/hrv/icons'
import { poolLabel } from '@/lib/pools'
import { plural, portalHrefOf, rm, type ApprovalMember, type ApprovalRecordModel } from '@/lib/fin-app/approval-model'
import { getBatchVoucherDetails, type BatchVoucherRow } from '../actions'
import { openApprovalRequest } from '../page-actions'
import { getAttachmentSignedUrl } from '@/app/(portal)/payments/actions'
import type { DecisionAsk } from './decisions'
import type { HubRow } from '../_lib/hub-model'
import { ApprovalHero, RequestBody, heroStatus } from './RequestParts'
import s from './approvals.module.css'

// A request in the Approvals hub's drawer (2026-10-17 — the Principal's own view takes Finance's view, and Approvals
// is the tab the user opens most). One request: what its page shows (RequestParts — the phone app's request screen
// draws the same), Approve · Reject at its foot, the voucher / loan / fund source / what raised it a press away. A
// combined approval: its vouchers — who each pays, its number, its pools, its files — each approved or rejected on its
// own where nothing else rides along (the old batch window's), else the whole of it. Every decision is the queue's
// own (decisions.tsx).

const openFile = (fileId: string) => {
  void getAttachmentSignedUrl(fileId).then(
    ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
    () => flash('That file could not be opened just now.'),
  )
}

export function ApprovalDrawer({
  row,
  open,
  live,
  busy,
  onClose,
  onAsk,
  onOpenGroup,
}: {
  /** The row opened (kept while the drawer plays out). */
  row: HubRow | null
  open: boolean
  /** Still waiting on the lists (nothing decided it here yet). */
  live: boolean
  busy: boolean
  onClose: () => void
  onAsk: (a: DecisionAsk) => void
  /** A request decided with others: open its combined approval instead. */
  onOpenGroup: ((groupId: string) => void) | null
}) {
  const [record, setRecord] = useState<ApprovalRecordModel | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [details, setDetails] = useState<BatchVoucherRow[] | null>(null)
  const [approving, setApproving] = useState<Set<string> | null>(null)
  const [menu, setMenu] = useState(false)
  const router = useRouter()

  const singleId = open && row?.kind === 'single' ? row.id : null
  const groupId = open && row?.kind === 'group' ? row.groupId : null
  useEffect(() => {
    if (!singleId) return
    setRecord(null)
    setRefused(null)
    let live = true
    void openApprovalRequest(singleId).then(
      (res) => {
        if (!live) return
        if (res.ok) setRecord(res.record)
        else setRefused(res.reason)
      },
      () => live && setRefused('This request could not be read just now. Try again.'),
    )
    return () => {
      live = false
    }
  }, [singleId])
  useEffect(() => {
    if (!groupId) return
    setDetails(null)
    setApproving(null)
    let live = true
    void getBatchVoucherDetails(groupId).then(
      (rows) => live && setDetails(rows),
      () => live && setDetails([]),
    )
    return () => {
      live = false
    }
  }, [groupId])

  if (!row) return <FinDrawer open={false} onClose={onClose} title="" label="Request">{null}</FinDrawer>

  let title = ''
  let body: ReactNode
  let bar: ReactNode[] = []
  let links: DialogMenuItem[] = []
  let headActions: ReactNode = null

  if (row.kind === 'single') {
    const r = record?.id === row.id ? record : null
    title = r?.no ?? row.no ?? row.type
    headActions = (
      <Link href={`/approvals/${row.id}`} className={d.headBtn}>
        View full page ↗
      </Link>
    )
    if (r) {
      const go = (href: string) => ({
        onClick: () => {
          setMenu(false)
          router.push(href)
        },
      })
      links = [
        ...(r.voucher ? [{ key: 'voucher', label: 'Open the voucher', ...go(`/payments/${r.voucher.id}`) }] : []),
        ...(r.voucher?.upstream ? [{ key: 'upstream', label: `Open the ${r.voucher.upstream.label.toLowerCase()}`, ...go(r.voucher.upstream.portalHref) }] : []),
        ...(r.loan ? [{ key: 'loan', label: 'Open the loan', ...go(portalHrefOf(r.loan.open)) }] : []),
        ...(r.open ? [{ key: 'open', label: r.open.hub === 'fund-in' ? 'Open the fund source' : r.open.hub === 'fund-out' ? 'Open the loan' : 'Open the voucher', ...go(portalHrefOf(r.open)) }] : []),
        ...(r.groupId && onOpenGroup ? [{ key: 'group', label: 'Open the combined request', onClick: () => { setMenu(false); onOpenGroup(r.groupId as string) } }] : []),
      ]
      const decides = r.status === 'pending' && r.may && !r.groupId && live
      if (decides) {
        bar = [
          <button
            key="approve"
            type="button"
            className={d.barBtn}
            data-kind="primary"
            data-off={r.voucher?.short ? 'true' : undefined}
            disabled={busy}
            title={r.voucher?.short ? 'The bank balance is below the voucher amount' : undefined}
            onClick={() => (r.voucher?.short ? flash('Approve disabled: bank balance is below the voucher amount') : onAsk({ kind: 'approve', scope: 'one', record: r }))}
          >
            Approve
          </button>,
          <button key="reject" type="button" className={d.barBtn} data-kind="danger" disabled={busy} onClick={() => onAsk({ kind: 'reject', scope: 'one', record: r })}>
            Reject
          </button>,
        ]
      }
      if (links.length > 0) {
        bar.push(
          <button key="more" type="button" className={d.barBtn} data-kind="more" aria-label="More" onClick={() => setMenu(true)}>
            ⋯
          </button>,
        )
      }
      body = <RequestBody r={r} openFile={openFile} />
    } else {
      body = <div className={d.loading}>{refused ?? 'Loading…'}</div>
    }
  } else {
    // ── A combined approval ──
    title = `Combined · ${row.members.length}`
    const mine = live && !row.why && row.decision === null
    const vouchers = row.members.filter((m) => m.isVoucher)
    const others = row.members.filter((m) => !m.isVoucher)
    const split = mine && row.splittable
    const on = approving ?? new Set(vouchers.map((m) => m.id))
    const toggle = (m: ApprovalMember) =>
      setApproving(() => {
        const next = new Set(on)
        if (next.has(m.id)) next.delete(m.id)
        else next.add(m.id)
        return next
      })
    const byApproval = new Map((details ?? []).map((x) => [x.approvalId, x]))
    const status = row.decision ? heroStatus(row.decision, true) : !live ? heroStatus('partly', true) : heroStatus('pending', mine)
    const nApprove = vouchers.filter((m) => on.has(m.id)).length
    const nReject = vouchers.length - nApprove
    if (split) {
      bar = [
        <button
          key="decide"
          type="button"
          className={d.barBtn}
          data-kind={nApprove === 0 ? 'danger' : 'primary'}
          disabled={busy}
          onClick={() => onAsk({ kind: 'split', row, approve: vouchers.filter((m) => on.has(m.id)).map((m) => m.id), reject: vouchers.filter((m) => !on.has(m.id)).map((m) => m.id) })}
        >
          {nReject === 0 ? `Approve all ${nApprove}` : nApprove === 0 ? `Reject all ${nReject}` : `Approve ${nApprove}, reject ${nReject}`}
        </button>,
        ...(vouchers.length > 1
          ? [
              <button key="all" type="button" className={d.barBtn} disabled={busy} onClick={() => setApproving(nReject === 0 ? new Set() : new Set(vouchers.map((m) => m.id)))}>
                {nReject === 0 ? 'Tick all to reject' : 'Tick all to approve'}
              </button>,
            ]
          : []),
      ]
    } else if (mine) {
      bar = [
        <button key="approve" type="button" className={d.barBtn} data-kind="primary" disabled={busy} onClick={() => onAsk({ kind: 'approve', scope: 'group', row })}>
          Approve
        </button>,
        <button key="reject" type="button" className={d.barBtn} data-kind="danger" disabled={busy} onClick={() => onAsk({ kind: 'reject', scope: 'group', row })}>
          Reject
        </button>,
      ]
    }
    const memberLine = (m: ApprovalMember) => {
      const x = byApproval.get(m.id)
      const decidedChip = m.decision ? <Chip tone={m.decision === 'approved' ? 'ledger' : 'danger'}>{m.decision === 'approved' ? 'Approved' : 'Rejected'}</Chip> : null
      const pools = x ? [...new Set(x.sources.map((p) => poolLabel(p.pool)))].join(' + ') : ''
      return (
        <div key={m.id} className={s.member} data-off={split && !on.has(m.id) ? 'true' : undefined} data-plain={split ? undefined : 'true'}>
          {split ? (
            <button type="button" className={s.toggle} onClick={() => toggle(m)} aria-pressed={on.has(m.id)} aria-label={`${on.has(m.id) ? 'Approve' : 'Reject'} ${m.sub || m.label}`} disabled={busy}>
              <Chip tone={on.has(m.id) ? 'ledger' : 'danger'}>{on.has(m.id) ? 'Approve' : 'Reject'}</Chip>
            </button>
          ) : null}
          <span className={s.text}>
            <span className={s.name}>{x?.payeeName || m.label}</span>
            <span className={s.sub}>{[m.sub, x?.description && x.description !== m.label ? x.description : null, pools].filter(Boolean).join(' · ')}</span>
          </span>
          <span className={s.amount}>{m.amount === null ? '—' : rm(m.amount)}</span>
          <span className={s.extras}>
            {decidedChip}
            {(x?.attachments ?? []).map((f) => (
              <button key={f.id} type="button" className={s.fileChip} onClick={() => openFile(f.id)} title={f.fileName}>
                <HrIcon name="doc" size={12} />
                {f.fileName}
              </button>
            ))}
            {m.open ? (
              <Link href={portalHrefOf(m.open)} className={s.fileChip}>
                Open ↗
              </Link>
            ) : null}
          </span>
        </div>
      )
    }
    body = (
      <>
        <ApprovalHero
          kicker={`Combined · ${row.members.length}`}
          status={status}
          no={row.no}
          amount={row.hasAmount ? rm(row.amount) : '—'}
          to={row.title}
          note={live && row.decision === null ? (row.why ?? 'Waiting for your decision.') : `Sent by ${row.sentBy}${row.on ? ` · decided ${row.on}` : ''}`}
        />
        <div className={d.label}>
          <span className={d.labelRoman}>I.</span> Vouchers · {vouchers.length}
        </div>
        <div className={s.members}>
          {details === null && vouchers.length > 0 ? <div className={s.loading}>Loading the vouchers…</div> : null}
          {vouchers.length === 0 ? <div className={s.loading}>No vouchers in this request.</div> : vouchers.map(memberLine)}
        </div>
        {others.length > 0 ? (
          <>
            <div className={d.label}>
              <span className={d.labelRoman}>II.</span> Approved together
            </div>
            <div className={s.members}>{others.map(memberLine)}</div>
          </>
        ) : null}
        <div className={d.label}>
          <span className={d.labelRoman}>{others.length > 0 ? 'III.' : 'II.'}</span> Request
        </div>
        <div className={d.group}>
          <div className={d.line}>
            <span className={d.lineLabel}>Type</span>
            <span className={d.lineValue}>
              <span className={d.lineV}>{row.type}</span>
            </span>
          </div>
          <div className={d.line}>
            <span className={d.lineLabel}>Sent by</span>
            <span className={d.lineValue}>
              <span className={d.lineV}>{row.sentBy}</span>
            </span>
          </div>
          <div className={d.line}>
            <span className={d.lineLabel}>Holds</span>
            <span className={d.lineValue}>
              <span className={d.lineV}>{plural(row.members.length, 'request', 'requests')}</span>
            </span>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <FinDrawer open={open} onClose={onClose} label={title || 'Request'} title={title} headActions={headActions} bar={bar.length > 0 ? bar : null}>
        {body}
      </FinDrawer>
      <FinDialog open={menu} onClose={() => setMenu(false)} title={title || 'Request'}>
        <DialogMenu items={links} />
      </FinDialog>
    </>
  )
}
