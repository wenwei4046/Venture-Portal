'use client'

import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import { HrIcon } from '@/components/hrv/icons'
import { flash } from '@/components/hrv/toast'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { DialogButton, DialogConfirm, DialogForm, DialogMenu, Field, FinDialog, Hint, type DialogMenuItem } from '@/components/finv/Dialog'
import {
  approveVoucher,
  getAttachmentSignedUrl,
  returnVoucherToDraft,
  reversePaidPayment,
  submitForApproval,
  uploadVoucherAttachment,
  voidPaidReceipt,
  voidVoucher,
} from '../actions'
import { openVoucherDrawer, type DrawerRefusal } from '../drawer-actions'
import type { VoucherDetail } from '../_lib/voucher-detail'

// A voucher in the hub's drawer (2026-10-14, the Finance revamp v2 — D05 of
// `.design/fin-r2/handoff`): the dark hero, the numbered groups, the files and
// the trail, and at its foot what this reader may do in the state it is in —
// the system's own steps (an approval pays at once, so there is no separate
// "Mark as paid"), each confirmed where it cannot be undone.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "06 Oct 2026" — a date as the design writes it. */
export function fd(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, day] = iso.slice(0, 10).split('-').map(Number)
  return `${String(day).padStart(2, '0')} ${MON[m - 1]} ${y}`
}
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`

const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  paid: 'Paid',
  voided: 'Voided',
}
const LIGHT: Record<string, string> = { draft: 'def', pending_approval: 'wait', approved: 'accent', paid: 'ledger', voided: 'danger' }
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
function sizeOf(bytes: number | null): string {
  if (bytes == null) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
/** "14 Oct · 09:12" on the office's clock. */
const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')

type Confirm = 'void' | 'reverse' | 'approve' | 'more' | null

export function VoucherDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const router = useRouter()
  const [detail, setDetail] = useState<VoucherDetail | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [notes, setNotes] = useState('')
  const [busy, startBusy] = useTransition()
  const [shownId, setShownId] = useState<string | null>(id)

  const load = useCallback((voucherId: string) => {
    setError(null)
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
    setConfirm(null)
    load(id)
  }, [id, load])

  const run = (action: (fd: FormData) => Promise<unknown>, done: string, extra?: Record<string, string>) => {
    if (!detail) return
    setError(null)
    const form = new FormData()
    form.set('id', detail.id)
    for (const [k, v] of Object.entries(extra ?? {})) form.set(k, v)
    startBusy(async () => {
      try {
        await action(form)
        setConfirm(null)
        setNotes('')
        flash(done)
        onChanged()
        load(detail.id)
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
        setConfirm(null)
        setError(e instanceof Error ? e.message : 'That did not go through.')
      }
    })
  }

  const openFile = async (fileId: string) => {
    try {
      const { url } = await getAttachmentSignedUrl(fileId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('That file could not be opened just now.')
    }
  }
  const addFiles = () => {
    if (!detail) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv'
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return
      const form = new FormData()
      form.set('voucher_id', detail.id)
      for (const f of files) form.append('files', f)
      setError(null)
      startBusy(async () => {
        try {
          const { count } = await uploadVoucherAttachment(form)
          flash(`${count} ${count === 1 ? 'file' : 'files'} added`)
          load(detail.id)
          router.refresh()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'The files could not be added.')
        }
      })
    }
    input.click()
  }

  const v = detail
  const title = v ? (v.no ?? 'Draft') : ''
  const st = v?.status ?? ''

  // ── The bar: what this reader may do now ──
  const more: DialogMenuItem[] = []
  const bar: ReactNode[] = []
  if (v) {
    if (st === 'draft') {
      if (v.can.create) bar.push(<button key="submit" type="button" className={d.barBtn} data-kind="primary" disabled={busy} onClick={() => run(submitForApproval, 'Submitted — waiting for Principal')}>Submit for approval</button>)
      if (v.can.edit) bar.push(<Link key="edit" href={`/payments/${v.id}/edit`} className={d.barBtn}>Edit</Link>)
      if (v.can.void) more.push({ key: 'void', label: 'Void voucher', danger: true, onClick: () => setConfirm('void') })
    } else if (st === 'pending_approval') {
      if (v.can.approve) bar.push(<button key="approve" type="button" className={d.barBtn} data-kind="primary" disabled={busy} onClick={() => setConfirm('approve')}>Approve</button>)
      if (v.can.edit) {
        bar.push(<Link key="edit" href={`/payments/${v.id}/edit`} className={d.barBtn}>Edit</Link>)
        const back = <button key="back" type="button" className={d.barBtn} disabled={busy} onClick={() => run(returnVoucherToDraft, 'Returned to draft')}>Return to draft</button>
        if (v.can.approve) more.push({ key: 'back', label: 'Return to draft', onClick: () => run(returnVoucherToDraft, 'Returned to draft') })
        else bar.push(back)
      }
      if (v.can.void) more.push({ key: 'void', label: 'Void voucher', danger: true, onClick: () => setConfirm('void') })
    } else if (st === 'paid' && v.can.void && (v.credit || v.reversible)) {
      bar.push(
        <button key="reverse" type="button" className={d.barBtn} data-kind="danger" disabled={busy} onClick={() => setConfirm('reverse')}>
          {v.credit ? 'Void receipt' : 'Reverse payment'}
        </button>,
      )
    }
    if (more.length > 0) bar.push(<button key="more" type="button" className={d.barBtn} data-kind="more" aria-label="More" onClick={() => setConfirm('more')}>⋯</button>)
  }

  const short = v?.noCash ? false : v?.bankBalance != null && v.bankBalance < v.amount

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
                    <button key={f.id} type="button" className={d.file} onClick={() => void openFile(f.id)}>
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
                    <div className={d.stepBy}>
                      {[s.by, s.at ? stamp(s.at) : null, s.note].filter(Boolean).join(' ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </FinDrawer>

      {v ? (
        <>
          <FinDialog open={confirm === 'more'} onClose={() => setConfirm(null)} title={title}>
            <DialogMenu items={more.map((m) => ({ ...m, onClick: () => { setConfirm(null); m.onClick() } }))} />
          </FinDialog>
          <FinDialog open={confirm === 'void'} onClose={() => setConfirm(null)} title={`Void ${title}?`} locked={busy}>
            <DialogConfirm
              text="The voucher stays in the list as voided. This cannot be undone."
              confirmLabel="Void voucher"
              danger
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run(voidVoucher, `${title} voided`)}
            />
          </FinDialog>
          <FinDialog open={confirm === 'reverse'} onClose={() => setConfirm(null)} title={v.credit ? 'Void this receipt?' : 'Reverse this payment?'} locked={busy}>
            <DialogConfirm
              text={
                v.credit
                  ? 'The bank, pool and GL entries are reversed, and its invoices go back to unpaid.'
                  : 'The money goes back to the bank, the GL and pool entries are reversed, and the voucher becomes void.'
              }
              confirmLabel={v.credit ? 'Void receipt' : 'Reverse payment'}
              danger
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => run(v.credit ? voidPaidReceipt : reversePaidPayment, v.credit ? `${title} voided` : 'Payment reversed')}
            />
          </FinDialog>
          <FinDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} title={`Approve ${title}?`} locked={busy}>
            <DialogForm
              onSubmit={() => !short && run(approveVoucher, `${title} approved and paid`, { notes })}
              buttons={
                <>
                  <DialogButton onClick={() => setConfirm(null)}>Cancel</DialogButton>
                  <DialogButton kind="primary" type="submit" disabled={busy || short} off={short}>
                    {short ? 'Insufficient balance' : busy ? 'Approving…' : 'Approve & pay'}
                  </DialogButton>
                </>
              }
            >
              {v.noCash ? null : v.bankBalance != null && v.bank ? (
                <Hint danger={short}>
                  {v.bank.name} balance {rm(v.bankBalance)}
                  {short ? ` — not enough for ${rm(v.amount)}` : ''}
                </Hint>
              ) : null}
              <Hint>Approving pays this voucher at once — the bank, the pool and the ledger move in the same step. This cannot be undone.</Hint>
              <Field label="Notes" htmlFor="approve-notes">
                <textarea
                  id="approve-notes"
                  className={d.notes}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional — for the audit trail"
                />
              </Field>
            </DialogForm>
          </FinDialog>
        </>
      ) : null}
    </>
  )
}

function Group({
  n,
  title,
  foot,
  empty,
  children,
}: {
  n: string
  title: string
  foot?: { l: string; v: string }
  empty?: string
  children?: ReactNode
}) {
  return (
    <>
      <div className={d.label}>
        <span className={d.labelRoman}>{n}</span> {title}
      </div>
      <div className={d.group}>
        {children}
        {foot ? (
          <div className={d.foot}>
            <span className={d.footL}>{foot.l}</span>
            <span className={d.footV}>{foot.v}</span>
          </div>
        ) : null}
        {empty ? <div className={d.groupEmpty}>{empty}</div> : null}
      </div>
    </>
  )
}

function Line({ label, value, sub, mono = false }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className={d.line}>
      <span className={d.lineLabel}>{label}</span>
      <span className={d.lineValue}>
        <span className={d.lineV} data-mono={mono ? 'true' : undefined}>
          {value}
        </span>
        {sub ? <span className={d.lineSub}>{sub}</span> : null}
      </span>
    </div>
  )
}
