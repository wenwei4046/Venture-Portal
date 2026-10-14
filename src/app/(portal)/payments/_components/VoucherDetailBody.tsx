'use client'

import { officeTime } from '@/lib/office-time'
import { HrIcon } from '@/components/hrv/icons'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { useFinSurface } from '@/components/finv/surface'
import type { VoucherDetail } from '../_lib/voucher-detail'
import type { VoucherPageExtras } from '../_lib/voucher-page'

// One voucher, drawn (2026-10-14, the Finance revamp v2 — the hub's drawer,
// D05; moved out of VoucherDrawer on 2026-10-15 so the Finance phone app's
// voucher screen, M04, draws the very same): the dark hero, the numbered
// groups, the files and the trail. On the phone the screen IS the voucher's
// page, so it also lays out what the computer's full page adds (`extras`):
// whom a salary voucher pays and into which account (•••• without the Bank
// tick), the statutory contributions it covers, and the audit log.

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

/** "214 KB" — a file's size. */
export function sizeOf(bytes: number | null): string {
  if (bytes == null) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
/** "06 Oct 2026 · 09:12" on the office's clock. */
export const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')

/** The dark hero: kicker and status, the number, the amount, who is paid, the status sentence. */
export function VoucherHero({
  credit,
  status,
  account,
  no,
  amount,
  payee,
}: {
  credit: boolean
  status: string
  account: string | null
  no: string | null
  amount: number
  payee: string
}) {
  return (
    <div className={d.hero} data-light={LIGHT[status] ?? 'def'}>
      <div className={d.heroTop}>
        <span className={d.kicker}>
          {credit ? 'Official receipt' : 'Payment voucher'}
          {account ? ` · ${account}` : ''}
        </span>
        <span className={d.heroChip}>
          <span className={d.heroDot} />
          {status === 'paid' && credit ? 'Received' : (STATUS_WORDS[status] ?? status)}
        </span>
      </div>
      <div className={d.heroNo}>{no ?? 'Draft'}</div>
      <div className={d.heroAmount}>
        {credit ? '+' : ''}
        {rm(amount)}
      </div>
      <div className={d.heroTo}>
        {credit ? 'Received from' : 'Pay to'} {payee}
      </div>
      <div className={d.heroNote}>
        <span className={d.heroNoteDot} />
        <span>{credit && status === 'paid' ? 'Received.' : NOTE[status] ?? ''}</span>
      </div>
    </div>
  )
}

export function VoucherDetailBody({
  v,
  error,
  busy,
  openFile,
  addFiles,
  extras = null,
}: {
  v: VoucherDetail
  error: string | null
  busy: boolean
  openFile: (fileId: string) => void
  addFiles: () => void
  /** The full page's parts, on a screen that is the voucher's page (the phone app). */
  extras?: VoucherPageExtras | null
}) {
  const people = extras?.people ?? null
  // The phone draws a file's glyph a size up (M04: 16px in a 34px tile).
  const phone = useFinSurface() !== null
  let n = 4
  const roman = () => `${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n++] ?? n}.`
  return (
    <>
      <VoucherHero credit={v.credit} status={v.status} account={v.account} no={v.no} amount={v.amount} payee={v.payee} />

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
        foot={v.sources.length > 0 ? { l: 'Total', v: rm(v.sources.reduce((t, r) => t + r.amount, 0)) } : undefined}
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
      {people && people.length > 0 ? (
        <Group n={roman()} title="People on this voucher" foot={people.length > 1 ? { l: 'Total', v: rm(people.reduce((t, p) => t + p.amount, 0)) } : undefined}>
          {people.map((p, i) => (
            <Line
              key={i}
              label={p.name}
              value={rm(p.amount)}
              sub={[p.payment, p.account ? `${p.account.bank ?? ''} · ${p.account.number ?? ''}` : 'Not recorded'].filter(Boolean).join(' · ')}
              mono
            />
          ))}
        </Group>
      ) : v.people.length > 0 ? (
        <Group n={roman()} title="People on this voucher" foot={v.people.length > 1 ? { l: 'Total', v: rm(v.people.reduce((t, p) => t + p.amount, 0)) } : undefined}>
          {v.people.map((p, i) => (
            <Line key={i} label={p.name} value={rm(p.amount)} sub={p.department ?? undefined} mono />
          ))}
        </Group>
      ) : null}
      {extras && extras.statutory.length > 0 ? (
        <Group n={roman()} title="Statutory contributions" foot={{ l: 'Total contribution', v: rm(extras.statutory.reduce((t, r) => t + r.amount, 0)) }}>
          {extras.statutory.map((r, i) => (
            <Line key={i} label={r.name} value={rm(r.amount)} sub={`${r.scheme} · ${r.department}`} mono />
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
                  <HrIcon name="doc" size={phone ? 16 : 15} />
                </span>
                <span className={d.fileText}>
                  <span className={d.fileName}>{f.name}</span>
                  <span className={d.fileMeta}>{sizeOf(f.size)}</span>
                </span>
                <span className={d.fileChev} aria-hidden="true">
                  ›
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

      {extras ? (
        <>
          <div className={d.label}>Audit log · {extras.audit.length} {extras.audit.length === 1 ? 'event' : 'events'}</div>
          <div className={d.audit}>
            {extras.audit.length === 0 ? (
              <div className={d.groupEmpty}>No change on record.</div>
            ) : (
              extras.audit.map((a, i) => (
                <div key={i} className={d.auditRow}>
                  <span className={d.auditWhat}>{a.what}</span>
                  <span className={d.auditMeta}>
                    {a.who} · {a.at}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </>
  )
}
