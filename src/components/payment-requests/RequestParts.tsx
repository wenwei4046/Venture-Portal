'use client'

import { HrIcon } from '@/components/hrv/icons'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line, fd } from '@/components/finv/DrawerParts'
import { fileSize } from '@/components/finv/form-words'
import { officeDay } from '@/lib/office-time'
import { billBackWords, ownPart, payToWords, requestDay, rmOf, type PaymentRequest } from '@/lib/payment-requests/model'

// A payment request in a hub's drawer (2026-10-29, PR ② of docs/module-spec-payment-requests.md): the dark hero as a
// voucher's, then the request's numbered groups — what it was for, the receipts, who is paid, which pool pays. The
// requester's Claim page and Finance's Payment request draw it alike; Finance reads each split's Bill back too (answered
// in the Create PV window — the user: "我开pv 时就要确定是不是要开单了").

const LIGHT: Record<string, string> = { wait: 'wait', accent: 'accent' }

export function RequestHero({ kicker, chip, no, amount, to, note }: { kicker: string; chip: { text: string; tone: string }; no: string; amount: number; to: string; note: string }) {
  return (
    <div className={d.hero} data-light={LIGHT[chip.tone] ?? 'def'}>
      <div className={d.heroTop}>
        <span className={d.kicker}>{kicker}</span>
        <span className={d.heroChip}>
          <span className={d.heroDot} />
          {chip.text}
        </span>
      </div>
      <div className={d.heroNo}>{no}</div>
      <div className={d.heroAmount}>{rmOf(amount)}</div>
      <div className={d.heroTo}>{to}</div>
      <div className={d.heroNote}>
        <span className={d.heroNoteDot} />
        <span>{note}</span>
      </div>
    </div>
  )
}

/** A file or a voucher to open, drawn as the voucher drawer's attachments. */
export function OpenRow({ icon, name, meta, onOpen, disabled = false }: { icon: 'doc' | 'out'; name: string; meta: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={d.file} onClick={onOpen} disabled={disabled}>
      <span className={d.fileIcon}>
        <HrIcon name={icon} size={15} />
      </span>
      <span className={d.fileText}>
        <span className={d.fileName}>{name}</span>
        <span className={d.fileMeta}>{meta}</span>
      </span>
      <span className={d.fileChev} aria-hidden="true">
        ›
      </span>
    </button>
  )
}

const KIND_WORDS = { claim: 'Claim · I paid', direct_pay: 'Direct payment to a supplier' } as const

/** The request's own groups, I. to IV. */
export function RequestGroups({
  r,
  opening,
  fileError,
  onOpenFile,
  billBack = false,
}: {
  r: PaymentRequest
  /** The file being opened. */
  opening: string | null
  fileError: string | null
  onOpenFile: (fileId: string) => void
  /** Finance's: each split's Bill back said under it. */
  billBack?: boolean
}) {
  return (
    <>
      <Group n="I." title="What it was for" foot={{ l: 'Total', v: rmOf(r.total) }} empty={r.items.length === 0 ? 'No items yet.' : undefined}>
        {r.items.map((i) => (
          <Line key={i.id} label={i.description || '—'} value={rmOf(i.amount)} mono />
        ))}
      </Group>

      <div className={d.label}>
        <span className={d.labelRoman}>II.</span> Receipts
      </div>
      {r.files.length > 0 ? (
        <div className={d.files}>
          {r.files.map((f) => (
            <OpenRow
              key={f.id}
              icon="doc"
              name={f.name}
              meta={opening === f.id ? 'Opening…' : [f.size ? fileSize(f.size) : null, 'Opens in a new tab'].filter(Boolean).join(' · ')}
              onOpen={() => onOpenFile(f.id)}
              disabled={opening !== null}
            />
          ))}
        </div>
      ) : (
        <div className={d.group}>
          <div className={d.groupEmpty}>No receipts yet.</div>
        </div>
      )}
      {fileError ? (
        <div className={d.error} role="alert">
          {fileError}
        </div>
      ) : null}

      <Group n="III." title="Who is paid">
        <Line label="It is" value={KIND_WORDS[r.kind]} />
        <Line label="Pay to" value={r.kind === 'claim' ? r.requesterName : r.payeeName ?? '—'} />
        <Line label="Into" value={payToWords(r)} mono={!r.payToSalary || r.kind === 'direct_pay'} />
      </Group>

      <Group n="IV." title="Which pool pays" foot={r.shares.length > 0 ? { l: `${r.departmentName} pays`, v: rmOf(ownPart(r)) } : undefined}>
        <Line label="From" value={r.requesterName} sub={r.departmentName} />
        {r.requestNo ? <Line label="Request" value={r.requestNo} mono sub={r.submittedAt ? `Sent ${fd(requestDay(r))}` : undefined} /> : null}
        {r.approvedByName ? (
          <Line label="Approved by" value={r.approvedByName} sub={r.approvedAt ? fd(officeDay(r.approvedAt).format('YYYY-MM-DD')) : undefined} />
        ) : null}
        {r.shares.length === 0 ? <Line label="Pool" value={`${r.departmentName} — all of it`} /> : null}
        {r.shares.map((s) => (
          <Line
            key={s.id}
            label={s.party === 'company' ? s.companyName ?? 'Company' : s.departmentName ?? 'Department'}
            value={rmOf(s.amount)}
            mono
            sub={billBack ? `Bill back: ${billBackWords(s)}` : undefined}
          />
        ))}
      </Group>
    </>
  )
}
