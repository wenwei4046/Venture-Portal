'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import { HrIcon } from '@/components/hrv/icons'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { openVoucherDrawer, type DrawerRefusal } from '../drawer-actions'
import type { VoucherDetail } from '../_lib/voucher-detail'
import { useVoucherSteps } from './voucher-steps'

// A voucher in the hub's drawer (2026-10-14, the Finance revamp v2 — D05 of
// `.design/fin-r2/handoff`): the dark hero, the numbered groups, the files and
// the trail, and at its foot what this reader may do in the state it is in
// (voucher-steps.tsx — the system's own steps, each confirmed where it cannot
// be undone). The groups and their lines are the kit's (DrawerParts).

export { fd }
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

/** The status as the hero's chip says it. */
export const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  paid: 'Paid',
  voided: 'Voided',
}
/** The chip's light on the dark hero. */
export const LIGHT: Record<string, string> = { draft: 'def', pending_approval: 'wait', approved: 'accent', paid: 'ledger', voided: 'danger' }
const NOTE: Record<string, string> = {
  draft: 'Still a draft — not submitted yet.',
  pending_approval: 'Waiting for Principal approval. You can still edit or void it until then.',
  approved: 'Approved — ready to pay.',
  paid: 'Paid.',
  voided: 'Voided.',
}
const REFUSED: Record<DrawerRefusal, string> = {
  closed: 'This voucher does not open for you here.',
  not_found: 'This voucher is not there any more.',
  payroll: 'A salary voucher opens only with Payroll payouts.',
}

/** "214 KB" — a file's size. */
export function sizeOf(bytes: number | null): string {
  if (bytes == null) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
/** "06 Oct 2026 · 09:12" on the office's clock. */
export const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')

export function VoucherDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter()
  const [detail, setDetail] = useState<VoucherDetail | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [shownId, setShownId] = useState<string | null>(id)

  const load = useCallback((voucherId: string) => {
    void openVoucherDrawer(voucherId).then(
      (res) => {
        if (res.ok) {
          setDetail(res.detail)
          setRefused(null)
        } else {
          setDetail(null)
          setRefused(REFUSED[res.reason])
        }
      },
      () => {
        setDetail(null)
        setRefused('This voucher could not be read just now. Try again.')
      },
    )
  }, [])

  useEffect(() => {
    if (!id) return
    setShownId(id)
    setDetail(null)
    setRefused(null)
    load(id)
  }, [id, load])

  const v = detail
  const { steps, busy, error, dialogs, openFile, addFiles } = useVoucherSteps(v, {
    onDone: () => {
      onChanged()
      if (v) load(v.id)
    },
    onFilesChanged: () => {
      if (v) load(v.id)
      router.refresh()
    },
  })
  const title = v ? (v.no ?? 'Draft') : ''
  const st = v?.status ?? ''

  const bar: ReactNode[] = steps.map((s) =>
    s.href ? (
      <Link key={s.key} href={s.href} className={d.barBtn}>
        {s.label}
      </Link>
    ) : (
      <button
        key={s.key}
        type="button"
        className={d.barBtn}
        data-kind={s.kind === 'secondary' ? undefined : s.kind}
        disabled={busy && s.kind !== 'more'}
        aria-label={s.kind === 'more' ? 'More' : undefined}
        onClick={s.onClick}
      >
        {s.label}
      </button>
    ),
  )

  return (
    <>
      <FinDrawer
        open={!!id}
        onClose={onClose}
        label={title || 'Voucher'}
        title={title || (shownId ? ' ' : '')}
        headActions={
          v ? (
            <>
              {v.credit ? null : (
                <Link href={`/payments/${v.id}`} className={d.headBtn}>
                  View full page ↗
                </Link>
              )}
              <a href={`/payments/voucher-doc?id=${v.id}`} target="_blank" rel="noopener noreferrer" className={d.headBtn}>
                Print
              </a>
            </>
          ) : null
        }
        bar={bar.length > 0 ? bar : null}
      >
        {!v ? (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        ) : (
          <>
            <div className={d.hero} data-light={LIGHT[st] ?? 'def'}>
              <div className={d.heroTop}>
                <span className={d.kicker}>
                  {v.credit ? 'Official receipt' : 'Payment voucher'}
                  {v.account ? ` · ${v.account}` : ''}
                </span>
                <span className={d.heroChip}>
                  <span className={d.heroDot} />
                  {st === 'paid' && v.credit ? 'Received' : (STATUS_WORDS[st] ?? st)}
                </span>
              </div>
              <div className={d.heroNo}>{v.no ?? 'Draft'}</div>
              <div className={d.heroAmount}>
                {v.credit ? '+' : ''}
                {rm(v.amount)}
              </div>
              <div className={d.heroTo}>
                {v.credit ? 'Received from' : 'Pay to'} {v.payee}
              </div>
              <div className={d.heroNote}>
                <span className={d.heroNoteDot} />
                <span>{v.credit && st === 'paid' ? 'Received.' : NOTE[st] ?? ''}</span>
              </div>
            </div>

            {error ? <div className={d.error} role="alert">{error}</div> : null}

            <Group n="I." title={v.credit ? 'Received from' : 'Pay to'}>
              <Line label={v.credit ? 'Payer' : 'Payee'} value={v.payee} sub={v.payeeCompany ?? undefined} />
              <Line label="Description" value={v.description || '—'} />
              {v.method ? <Line label="Method" value={v.method} /> : null}
              {v.notes ? <Line label="Notes" value={v.notes} /> : null}
            </Group>
            <Group n="II." title="When & where">
              <Line label={v.credit ? 'Received date' : 'Payment date'} value={fd(v.paymentDate)} mono />
              {v.bank ? <Line label={v.credit ? 'Into bank' : 'From bank'} value={v.bank.name} sub={v.bank.number ?? undefined} /> : null}
            </Group>
            <Group
              n="III."
              title={v.credit ? 'Credited to' : 'Deducted from'}
              foot={v.sources.length > 0 ? { l: 'Total', v: rm(v.sources.reduce((n, r) => n + r.amount, 0)) } : undefined}
              empty={v.sources.length === 0 ? 'No pool on record.' : undefined}
            >
              {v.sources.map((r, i) => (
                <Line key={i} label={r.pool} value={rm(r.amount)} sub={r.account} mono />
              ))}
            </Group>
            <Group n="IV." title="Booking">
              <Line label="Account" value={v.account ?? '—'} sub={v.accountCodes ?? undefined} />
              <Line label="Pool" value={v.pool ?? '—'} />
              {v.settledInvoices.length > 0 ? (
                <Line
                  label="Settles invoice"
                  value={v.settledInvoices.length === 1 ? v.settledInvoices[0] : `${v.settledInvoices[0]} + ${v.settledInvoices.length - 1} more`}
                  mono
                />
              ) : null}
            </Group>
            {v.people.length > 0 ? (
              <Group n="V." title="People on this voucher" foot={v.people.length > 1 ? { l: 'Total', v: rm(v.people.reduce((n, p) => n + p.amount, 0)) } : undefined}>
                {v.people.map((p, i) => (
                  <Line key={i} label={p.name} value={rm(p.amount)} sub={p.department ?? undefined} mono />
                ))}
              </Group>
            ) : null}

            {v.files.length > 0 || v.takesFiles ? (
              <>
                <div className={d.label}>
                  Attachments · {v.files.length} {v.files.length === 1 ? 'file' : 'files'}
                </div>
                <div className={d.files}>
                  {v.files.map((f) => (
                    <button key={f.id} type="button" className={d.file} onClick={() => openFile(f.id)}>
                      <span className={d.fileIcon}>
                        <HrIcon name="doc" size={15} />
                      </span>
                      <span className={d.fileText}>
                        <span className={d.fileName}>{f.name}</span>
                        <span className={d.fileMeta}>{sizeOf(f.size)}</span>
                      </span>
                    </button>
                  ))}
                  {v.takesFiles && v.can.edit ? (
                    <button type="button" className={d.add} disabled={busy} onClick={addFiles}>
                      + {v.filesOpen ? 'Add attachments' : 'Add a late attachment'}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className={d.label}>Trail</div>
            <div className={d.trail}>
              {v.trail.map((s, i) => (
                <div key={i} className={d.step} data-state={s.state}>
                  <div className={d.stepRail}>
                    <span className={d.stepDot} />
                    <span className={d.stepLine} data-on={v.trail[i + 1] && v.trail[i + 1].state !== 'todo' ? 'true' : undefined} />
                  </div>
                  <div className={d.stepText}>
                    <div className={d.stepLabel}>{s.label}</div>
                    <div className={d.stepBy}>{[s.by, s.at ? stamp(s.at) : null, s.note].filter(Boolean).join(' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </FinDrawer>
      {dialogs}
    </>
  )
}

