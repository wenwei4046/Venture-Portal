'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Facts, GridHead, GridRow, GridTable, HistoryEvent, SecLabel, btn, hv } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { Chevron } from '@/components/hrv/icons'
import { flash } from '@/components/hrv/toast'
import { revenuePath } from '@/lib/revenue'
import { addedHere, dayLabel, historyOf, joiningDayLabel, shortDay, waitingList, type SignedForm, type SubDeptRequest } from '@/lib/commission/sales-group-requests'
import { isAnyTime } from '@/lib/member/waiting-start'
import type { WaitingForm } from '@/lib/commission/waiting-form'
import { waitingEditChanges, waitingEditRefusal, type SubmitterGroup, type WaitingEditDraft } from '@/lib/commission/waiting-add'
import type { SubDepartmentCapacity } from '@/lib/commission/capacity'
import { editWaitingApplicant, failWaitingApplicant } from '../../../waiting-actions'
import MemberFormTools from './MemberFormTools'
import AddToWaitingList from './AddToWaitingList'
import SignedFormPanel from './SignedFormPanel'
import WaitingEditForm from './WaitingEditForm'
import s from './sales-groups.module.css'
import w from './waiting.module.css'

/** The applicant as Edit starts them: what the drawer shows, as the fields hold it. */
function editDraftOf(r: SubDeptRequest): WaitingEditDraft {
  return { name: r.newPerson ?? '', contact: r.contact ?? '', start: r.start ?? '', submittedBy: r.submittedById ?? '' }
}

/** A saved edit closes when the page's fresh rows are in — or after this, whatever happened to them. */
const FRESH_WAIT_MS = 6000

// Sales Groups › Waiting list (2026-10-10, the HR revamp): the applicants HR
// accepted in Member services, numbered in the order they were accepted.
// Above it, the form the Revenue team fills in (Upload form, Form settings);
// a row opens its drawer — the facts, the action history, and what HR does
// next: Transfer (People Management's employee form) or Fail (they didn't
// come when called, and the next one moves up). No place is held for anybody
// any more; the headcount limit is asked at Transfer.
//
// "+" (2026-10-11, the user) first in the row puts somebody straight onto the
// list — at the end, as if accepted today. Such a row was never sent by a
// member: its drawer says who added it instead of who signed.
//
// The drawer holds the applicant's SIGNED FORM (2026-10-20, the user: "view
// for the letter they submit, then can be upload as well"): View, and — for
// Member services · Edit, as "+" — Upload, or Replace (`SignedFormPanel`).
//
// …and EDIT (2026-10-20, the user: "要能够按 Edit：这个 Edit 本身是让 HR 可以去改
// 资料的"), beside the × for whoever may use "+": the name, mobile number,
// joining date and who brought them in, where the facts stood. Save sends only
// what changed (`member_waiting_edit`) and closes once the fresh rows are in.

const COLS = '56px minmax(0,1.5fr) minmax(0,1fr) 140px 140px 28px'

export default function WaitingList({
  rows,
  subDeptName,
  subSlug,
  form: initialForm,
  capacity,
  canTransfer,
  subOptions,
  subDepartmentId = '',
  submitters = [],
  canAdd = false,
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
  /** This sub-department's id — the list "+" adds to. */
  subDepartmentId?: string
  /** "Submitted by": the Revenue team, this sub-department first. */
  submitters?: SubmitterGroup[]
  /** Member services · Edit: "+" is drawn, and a signed form is uploaded in the drawer. */
  canAdd?: boolean
}) {
  const router = useRouter()
  const list = waitingList(rows)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = list.find(r => r.id === openId) ?? null

  // Edit (2026-10-20): the draft while editing; a saved one waits for the page's fresh rows before it closes,
  // so the drawer never reads its old values back in between.
  const [draft, setDraft] = useState<WaitingEditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [awaitingFresh, setAwaitingFresh] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // A signed form uploaded here shows at once, until the page's next answer (which names it) catches up.
  const [seenRows, setSeenRows] = useState(rows)
  const [uploaded, setUploaded] = useState<Record<string, SignedForm>>({})
  if (seenRows !== rows) {
    setSeenRows(rows)
    setUploaded({})
    if (awaitingFresh) {
      setAwaitingFresh(false)
      setSaving(false)
      setDraft(null)
    }
  }
  const signedForm = open ? (uploaded[open.id] ?? open.signedForm ?? null) : null

  useEffect(() => {
    if (!awaitingFresh) return
    const late = window.setTimeout(() => {
      setAwaitingFresh(false)
      setSaving(false)
      setDraft(null)
    }, FRESH_WAIT_MS)
    return () => window.clearTimeout(late)
  }, [awaitingFresh])

  const [confirmFail, setConfirmFail] = useState(false)
  const [failing, setFailing] = useState(false)
  const [failError, setFailError] = useState<string | null>(null)

  const full = capacity !== null && capacity.free !== null && capacity.free <= 0
  const fullWords = full && capacity ? `${subDeptName} is full — ${capacity.occupied + capacity.reserved} of ${capacity.capacity} places are taken.` : null
  const rulesCapacity = `${revenuePath(subSlug, 'rules')}?tab=capacity`
  const editing = draft !== null && open !== null
  const changes = editing ? waitingEditChanges(editDraftOf(open), draft) : {}
  const changeCount = Object.keys(changes).length

  function openRow(id: string | null) {
    setOpenId(id)
    setConfirmFail(false)
    setFailError(null)
    setDraft(null)
    setSaving(false)
    setAwaitingFresh(false)
    setEditError(null)
  }

  function startEdit() {
    if (!open) return
    setConfirmFail(false)
    setFailError(null)
    setEditError(null)
    setDraft(editDraftOf(open))
  }

  async function save() {
    if (!open || !draft || saving) return
    const refused = waitingEditRefusal(changes)
    if (refused) {
      setEditError(refused)
      return
    }
    setSaving(true)
    setEditError(null)
    const done = await editWaitingApplicant(open.id, changes)
    if (!done.ok) {
      setSaving(false)
      setEditError(done.reason)
      return
    }
    flash(`${(changes.name ?? open.newPerson ?? 'The applicant').trim()} — details saved`)
    setAwaitingFresh(true)
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

  return (
    <section aria-label={`${subDeptName} waiting list`}>
      <MemberFormTools
        kind="waiting"
        form={initialForm}
        subName={subDeptName}
        subOptions={subOptions}
        lead={
          canAdd && subDepartmentId ? (
            <AddToWaitingList
              subDepartmentId={subDepartmentId}
              subDeptName={subDeptName}
              submitters={submitters}
              form={initialForm.ok ? initialForm.form : null}
            />
          ) : null
        }
      />

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
            <span role="cell" className={isAnyTime(r.start) ? s.cell10 : `${s.cell10} ${hv.mono}`} style={{ fontSize: 12 }}>{joiningDayLabel(r.start)}</span>
            <span role="cell" className={s.cell10} style={{ fontSize: 12, color: 'rgb(var(--hv-body-2))' }}>{dayLabel(r.acceptedAt)}</span>
            <span role="cell" className={hv.chev} aria-hidden="true">
              <Chevron right />
            </span>
          </GridRow>
        ))}
        {list.length === 0 ? <div className={s.listEmpty}>Nobody is on {subDeptName}&apos;s waiting list.</div> : null}
      </GridTable>

      <Drawer
        open={open !== null}
        onClose={() => openRow(null)}
        width={400}
        headGrow
        head={
          open ? (
            <div className={w.drawerHead}>
              <div className={w.drawerHeadText}>
                {/* Round 2 (README 18.5): no "#1 of 2 on Fair's waiting list" above the name. */}
                <div className={hv.drawerTitle} style={{ marginTop: 0 }}>
                  {open.newPerson ?? '—'}
                </div>
                {open.requestNo ? <div className={w.candNo}>{open.requestNo}</div> : null}
              </div>
              {canAdd && !editing ? (
                <button type="button" className={`${btn('outline')} ${w.editButton}`} onClick={startEdit} title="Change their details">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.8 2.7a1.6 1.6 0 0 1 2.3 2.3l-7.6 7.6-3 .7.7-3 7.6-7.6Z" />
                  </svg>
                  Edit
                </button>
              ) : null}
            </div>
          ) : null
        }
        footer={
          open ? (
            editing ? (
              <>
                <span className={w.editFoot}>{changeCount ? `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : 'No changes yet'}</span>
                <button type="button" className={btn('outline')} onClick={() => setDraft(null)} disabled={saving}>
                  Cancel
                </button>
                <button type="button" className={btn('primary')} onClick={save} disabled={saving || changeCount === 0}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : confirmFail ? (
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
        {open && editing ? (
          <>
            <WaitingEditForm
              draft={draft}
              was={editDraftOf(open)}
              wasSubmitter={open.submittedBy}
              submitters={submitters}
              subDeptName={subDeptName}
              disabled={saving}
              onChange={patch => {
                setDraft(d => (d ? { ...d, ...patch } : d))
                setEditError(null)
              }}
            />
            {editError ? (
              <p className={w.failError} role="alert">
                {editError}
              </p>
            ) : null}
          </>
        ) : open ? (
          <>
            <Facts
              rows={
                addedHere(open)
                  ? [
                      { l: 'Mobile number', v: open.contact ?? '—' },
                      { l: 'Joining date', v: joiningDayLabel(open.start) },
                      { l: 'Department', v: `Revenue · ${subDeptName}` },
                      { l: 'Submitted by', v: open.submittedBy ?? '—' },
                      { l: 'Added by', v: open.events.find(e => e.to === 'waiting')?.by ?? 'HR' },
                      { l: 'Accepted', v: open.acceptedAt ? `${dayLabel(open.acceptedAt)} · added here` : '—' },
                    ]
                  : [
                      { l: 'Mobile number', v: open.contact ?? '—' },
                      { l: 'Joining date', v: joiningDayLabel(open.start) },
                      { l: 'Department', v: `Revenue · ${subDeptName}` },
                      { l: 'Submitted by', v: open.submittedBy ?? '—' },
                      { l: 'Signed by', v: open.signature ?? '—' },
                      { l: 'Accepted', v: open.acceptedAt ? `${dayLabel(open.acceptedAt)} · Member services` : '—' },
                    ]
              }
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>Signed form</SecLabel>
            <SignedFormPanel
              key={open.id}
              requestId={open.id}
              applicant={open.newPerson ?? 'The applicant'}
              form={signedForm}
              canUpload={canAdd}
              onUploaded={form => setUploaded(all => ({ ...all, [open.id]: form }))}
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
    </section>
  )
}
