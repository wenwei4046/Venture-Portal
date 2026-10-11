'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Facts, GridHead, GridRow, GridTable, HistoryEvent, SecLabel, btn, hv } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { Chevron } from '@/components/hrv/icons'
import { flash } from '@/components/hrv/toast'
import { revenuePath } from '@/lib/revenue'
import { dayLabel, historyOf, shortDay, waitingList, type SubDeptRequest } from '@/lib/commission/sales-group-requests'
import { TEMPLATE_ACCEPT, templateRefusal, type WaitingForm } from '@/lib/commission/waiting-form'
import type { SubDepartmentCapacity } from '@/lib/commission/capacity'
import { failWaitingApplicant, uploadWaitingFormTemplate } from '../../../waiting-actions'
import WaitingFormSettings from './WaitingFormSettings'
import s from './sales-groups.module.css'
import w from './waiting.module.css'

// Sales Groups › Waiting list (2026-10-10, the HR revamp): the applicants HR
// accepted in Member services, numbered in the order they were accepted.
// Above it, the form the Revenue team fills in (Upload form, Form settings);
// a row opens its drawer — the facts, the action history, and what HR does
// next: Transfer (People Management's employee form) or Fail (they didn't
// come when called, and the next one moves up). No place is held for anybody
// any more; the headcount limit is asked at Transfer.

const COLS = '56px minmax(0,1.5fr) minmax(0,1fr) 140px 140px 28px'

export default function WaitingList({
  rows,
  subDeptName,
  subSlug,
  form: initialForm,
  capacity,
  canTransfer,
  subOptions,
}: {
  rows: SubDeptRequest[]
  subDeptName: string
  subSlug: string
  /** The form as saved, or why it could not be read. */
  form: { ok: true; form: WaitingForm } | { ok: false; reason: string }
  /** This sub-department's places, when they could be read. */
  capacity: SubDepartmentCapacity | null
  /** People › Create: Transfer files an employee. */
  canTransfer: boolean
  /** The department's sub-departments, for the built-in "Preferred sub-department". */
  subOptions: string[]
}) {
  const router = useRouter()
  const list = waitingList(rows)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = list.find(r => r.id === openId) ?? null

  // The page's answer is the truth; a save here shows at once, until the
  // page's next answer catches up.
  const [seen, setSeen] = useState(initialForm)
  const [form, setForm] = useState(initialForm.ok ? initialForm.form : null)
  if (seen !== initialForm) {
    setSeen(initialForm)
    setForm(initialForm.ok ? initialForm.form : null)
  }
  const formMissing = initialForm.ok ? null : initialForm.reason

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [confirmFail, setConfirmFail] = useState(false)
  const [failing, setFailing] = useState(false)
  const [failError, setFailError] = useState<string | null>(null)

  const full = capacity !== null && capacity.free !== null && capacity.free <= 0
  const fullWords = full && capacity ? `${subDeptName} is full — ${capacity.occupied + capacity.reserved} of ${capacity.capacity} places are taken.` : null
  const rulesCapacity = `${revenuePath(subSlug, 'rules')}?tab=capacity`

  function openRow(id: string | null) {
    setOpenId(id)
    setConfirmFail(false)
    setFailError(null)
  }

  async function upload(file: File | undefined) {
    if (!file || uploading) return
    const refused = templateRefusal(file)
    if (refused) {
      flash(refused)
      return
    }
    setUploading(true)
    const data = new FormData()
    data.set('file', file)
    const done = await uploadWaitingFormTemplate(data)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!done.ok) {
      flash(done.reason)
      return
    }
    setForm(done.form)
    flash(`Form uploaded — the waiting-list application is now ${done.form.templateName}`)
  }

  async function fail() {
    if (!open || failing) return
    setFailing(true)
    setFailError(null)
    const done = await failWaitingApplicant(open.id)
    setFailing(false)
    if (!done.ok) {
      setFailError(done.reason)
      return
    }
    flash(`${open.newPerson ?? 'The applicant'} removed from the waiting list — the next in line moves up`)
    openRow(null)
  }

  const uploaded = form?.templatePath ? form.templateName : null

  return (
    <section aria-label={`${subDeptName} waiting list`}>
      <div className={w.toolbar}>
        <label
          className={w.upload}
          data-uploaded={uploaded ? 'true' : undefined}
          data-busy={uploading ? 'true' : undefined}
          title={formMissing ?? (uploaded ? 'Click to replace — Revenue members download this file' : 'Upload the application form Revenue members download')}
        >
          {uploading ? 'Uploading…' : uploaded ? `Form: ${uploaded}` : 'Upload form'}
          <input
            ref={fileRef}
            type="file"
            accept={TEMPLATE_ACCEPT}
            disabled={uploading || form === null}
            onChange={e => void upload(e.target.files?.[0])}
          />
        </label>
        <button type="button" className={w.settings} onClick={() => setSettingsOpen(true)} disabled={form === null} title={formMissing ?? undefined}>
          Form settings
        </button>
      </div>

      <GridTable label={`${subDeptName} waiting list`}>
        <GridHead cols={COLS} cells={['#', 'Applicant', 'Submitted by', 'Joining date', 'Accepted', '']} />
        {list.map(r => (
          <GridRow key={r.id} cols={COLS} onClick={() => openRow(r.id)} selected={openId === r.id} title={`Open ${r.newPerson ?? 'the applicant'}`}>
            <span role="cell" className={s.position}>#{r.position}</span>
            <div role="cell" className={s.twoLine}>
              <div className={s.strong}>{r.newPerson ?? '—'}</div>
              <div className={s.sub}>
                {[r.requestNo, r.contact].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <span role="cell" className={s.cell10}>{r.submittedBy ?? '—'}</span>
            <span role="cell" className={`${s.cell10} ${hv.mono}`} style={{ fontSize: 12 }}>{dayLabel(r.start)}</span>
            <span role="cell" className={s.cell10} style={{ fontSize: 12, color: 'rgb(var(--hv-body-2))' }}>{dayLabel(r.acceptedAt)}</span>
            <span role="cell" className={hv.chev} aria-hidden="true">
              <Chevron right />
            </span>
          </GridRow>
        ))}
        {list.length === 0 ? <div className={s.listEmpty}>Nobody is on {subDeptName}&apos;s waiting list.</div> : null}
      </GridTable>
      <div className={s.hint}>Applicants accepted in Member services, in the order they were accepted.</div>

      <Drawer
        open={open !== null}
        onClose={() => openRow(null)}
        width={400}
        head={
          open ? (
            <>
              {/* Round 2 (README 18.5): no "#1 of 2 on Fair's waiting list" above the name. */}
              <div className={hv.drawerTitle} style={{ marginTop: 0 }}>
                {open.newPerson ?? '—'}
              </div>
              {open.requestNo ? <div className={w.candNo}>{open.requestNo}</div> : null}
            </>
          ) : null
        }
        footer={
          open ? (
            confirmFail ? (
              <>
                <span className={w.confirm}>Take {open.newPerson ?? 'them'} off the waiting list?</span>
                <button type="button" className={btn('outline')} onClick={() => setConfirmFail(false)} disabled={failing}>
                  Keep
                </button>
                <button type="button" className={btn('dangerSolid')} onClick={fail} disabled={failing}>
                  {failing ? 'Failing…' : 'Fail'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`${btn('danger')} ${w.fail}`}
                  title="They didn't come when called — removes them from the waiting list"
                  onClick={() => setConfirmFail(true)}
                >
                  Fail
                </button>
                <button type="button" className={btn('outline')} onClick={() => openRow(null)}>
                  Close
                </button>
                <button
                  type="button"
                  className={`${btn('primary')} ${w.transfer}`}
                  title={!canTransfer ? 'Transferring needs People › Create' : fullWords ?? 'Transfer to employee'}
                  disabled={!canTransfer || full}
                  onClick={() => router.push(`/team/people/new?waiting=${open.id}`)}
                >
                  Transfer
                </button>
              </>
            )
          ) : null
        }
      >
        {open ? (
          <>
            <Facts
              rows={[
                { l: 'Mobile number', v: open.contact ?? '—' },
                { l: 'Joining date', v: dayLabel(open.start) },
                { l: 'Department', v: `Revenue · ${subDeptName}` },
                { l: 'Submitted by', v: open.submittedBy ?? '—' },
                { l: 'Signed by', v: open.signature ?? '—' },
                { l: 'Accepted', v: open.acceptedAt ? `${dayLabel(open.acceptedAt)} · Member services` : '—' },
              ]}
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>Action history</SecLabel>
            <div>
              {historyOf(open.events).map((e, i) => (
                <HistoryEvent key={i} what={e.what} when={shortDay(e.at)} who={e.by ?? undefined} note={e.note ?? undefined} />
              ))}
            </div>
            <div className={w.transferNote}>
              Transferring opens a new employee record in Revenue with the department and these details already filled. Only the
              employee details — NRIC, bank account — are left.
            </div>
            {failError ? (
              <p className={w.failError} role="alert">
                {failError}
              </p>
            ) : null}
            {fullWords ? (
              <p className={w.full} role="note">
                {fullWords} <Link href={rulesCapacity}>Raise the limit on Rules › Capacity</Link> to transfer anybody.
              </p>
            ) : null}
          </>
        ) : null}
      </Drawer>

      {settingsOpen && form ? (
        <WaitingFormSettings
          form={form}
          subName={subDeptName}
          subOptions={subOptions}
          onClose={() => setSettingsOpen(false)}
          onSaved={setForm}
        />
      ) : null}
    </section>
  )
}
