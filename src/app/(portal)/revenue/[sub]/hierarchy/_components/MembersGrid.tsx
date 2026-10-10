'use client'

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { GridHead, btn, hv } from '@/components/hrv/kit'
import { Window, useEscape } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { compareByLadder } from '@/lib/ladder'
import { headsLabel } from '@/lib/department-heads'
import { rankPayLabelOf } from '@/lib/commission/ranks'
import { earnedFloor } from '@/lib/commission/titles'
import {
  RATE_MODE_LABEL,
  pendingChanges,
  rankChoiceLabel,
  saveBarText,
  shownValues,
  changedFields,
  withEdit,
  withholdingChoices,
  withholdingLabel,
  type MemberEdits,
  type MemberField,
  type MemberValues,
} from '@/lib/commission/members-grid'
import { addDirector, addMember, removeDirector, saveStaffTax, setStaffRank, type RankOutcome } from '../../../hierarchy-actions'
import PersonContextMenu from './PersonContextMenu'
import type { PopAnchor } from './MovePopover'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import type { EmployeeDepartmentDestination } from '../../../_lib/employee-destinations'
import type { DirectorRow, MemberCandidate, RankRow, SalespersonRow, TitleRow } from '../../../_components/config/types'
import s from './sales-groups.module.css'

// Sales Groups › Members (2026-10-10, the HR revamp, variant A): who the
// sub-department reports to as chips, + Add member, and the members as a grid
// whose Rank, Rate mode and Withholding are edited where they stand — a
// changed cell turns peach, and one bar saves every change. Each row still
// saves the way the Team table did: `setStaffRank` writes a new
// effective-dated position (the rank and the rate mode ride together), and
// Withholding is the person's payroll fact (`saveStaffTax`). A person's
// memberships — add to another sub-department, the title held here, remove —
// are their right-click menu, the chart's own.

const COLS = 'minmax(0,1.3fr) minmax(0,1.5fr) 150px 170px minmax(0,1.2fr) 100px'

export default function MembersGrid({
  people,
  ranks,
  titles,
  candidates,
  directors,
  directorCandidates,
  subDepartmentId,
  schemeId,
  subDeptName,
  membershipDestinations = [],
  employeeDepartments = [],
  canManageEmployment = false,
  employmentToday = '',
  canEdit,
}: {
  people: SalespersonRow[]
  ranks: RankRow[]
  titles: TitleRow[]
  candidates: MemberCandidate[]
  directors: DirectorRow[]
  directorCandidates: DirectorRow[]
  subDepartmentId: string
  schemeId: string
  subDeptName: string
  membershipDestinations?: MembershipDestination[]
  employeeDepartments?: EmployeeDepartmentDestination[]
  canManageEmployment?: boolean
  employmentToday?: string
  /** Revenue · Edit — what every write here asks. */
  canEdit: boolean
}) {
  const [edits, setEdits] = useState<MemberEdits>({})
  const [notes, setNotes] = useState<Array<{ ok: boolean; text: string }>>([])
  const [saving, startSaving] = useTransition()
  const [menu, setMenu] = useState<{ person: SalespersonRow; anchor: PopAnchor } | null>(null)
  const [adding, setAdding] = useState(false)

  // The ladder top down, the same title together, names A→Z — the People
  // roster's order (user, 2026-09-05).
  const ordered = useMemo(
    () =>
      [...people].sort((a, b) =>
        compareByLadder(
          { name: a.employee_name, title: a.title_name, levelRank: a.title_level_rank },
          { name: b.employee_name, title: b.title_name, levelRank: b.title_level_rank },
        ),
      ),
    [people],
  )
  const nameOf = useMemo(() => new Map(people.map(p => [p.staff_id, p.employee_name])), [people])
  const top = headsLabel(directors.map(d => d.employee_name))
  // The rungs as titles.ts reasons about them: the floor a title earns lifts a
  // scheme-target month above the placed rank (the Team table said so too).
  const rungs = useMemo(
    () =>
      ranks.map(r => ({
        id: r.id,
        titleId: r.title_id,
        canRecruit: r.can_recruit,
        sortOrder: r.sort_order,
        personalSalesThreshold: r.personal_sales_threshold,
        productRate: Number(r.product_rate),
      })),
    [ranks],
  )
  const choiceOf = (id: string) => {
    const r = ranks.find(x => x.id === id)
    return r ? rankChoiceLabel(r, rankPayLabelOf(r)) : '—'
  }
  const { rows: changes, cells } = pendingChanges(ordered, edits)

  function edit(p: SalespersonRow, field: MemberField, value: string) {
    setEdits(prev => withEdit(prev, p, field, value))
  }

  function save() {
    if (saving || changes.length === 0) return
    const batch = changes
    startSaving(async () => {
      const said: Array<{ ok: boolean; text: string }> = []
      const stillDirty: MemberEdits = {}
      let saved = 0
      for (const c of batch) {
        const p = people.find(x => x.staff_id === c.staffId)
        if (!p) continue
        const failed: MemberField[] = []
        if (c.fields.includes('rank') || c.fields.includes('mode')) {
          const fd = new FormData()
          fd.set('staff_id', c.staffId)
          fd.set('scheme_id', schemeId)
          fd.set('rank_id', c.values.rank)
          fd.set('rate_mode', c.values.mode)
          const res: RankOutcome = await setStaffRank(fd)
          if (!res.ok) failed.push(...c.fields.filter(f => f !== 'wh'))
          if (res.note) said.push({ ok: res.ok, text: `${c.name}: ${res.note}` })
        }
        if (c.fields.includes('wh')) {
          const fd = new FormData()
          fd.set('staff_id', c.staffId)
          if (c.values.wh !== '') {
            fd.set('withholding', 'on')
            fd.set('withholding_rate', c.values.wh)
          }
          const res = await saveStaffTax(fd)
          if (!res.ok) {
            failed.push('wh')
            said.push({ ok: false, text: `${c.name}: ${res.note ?? 'Could not save the tax setting'}` })
          }
        }
        saved += c.fields.length - failed.length
        if (failed.length) {
          stillDirty[c.staffId] = Object.fromEntries(failed.map(f => [f, c.values[f]])) as Partial<MemberValues>
        }
      }
      setEdits(stillDirty)
      setNotes(said)
      if (saved > 0) flash(`Saved ${saved} change${saved === 1 ? '' : 's'} — a new effective-dated position`)
    })
  }

  return (
    <section aria-label={`${subDeptName} members`}>
      <ReportsTo
        directors={directors}
        candidates={directorCandidates}
        subDepartmentId={subDepartmentId}
        subDeptName={subDeptName}
        canEdit={canEdit}
        onNote={n => setNotes(n ? [n] : [])}
        onAddMember={() => setAdding(true)}
        canAddMember={canEdit && candidates.length > 0}
        noCandidatesReason={candidates.length === 0 ? `Everybody in the department is already in ${subDeptName}.` : undefined}
      />

      {notes.length ? (
        <div className={s.notes} role={notes.some(n => !n.ok) ? 'alert' : 'status'}>
          {notes.map((n, i) => (
            <p key={i} data-ok={n.ok ? 'true' : 'false'}>
              {n.text}
            </p>
          ))}
        </div>
      ) : null}

      {people.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>No members yet.</p>
          <p>Add the first member of {subDeptName} with + Add member, or give somebody a ladder title on People Management.</p>
        </div>
      ) : (
        <div className={s.membersScroll}>
          <div className={`${hv.gt} ${s.membersFrame}`} data-bar={changes.length > 0 ? 'true' : undefined} role="table" aria-label={`${subDeptName} members`}>
            <GridHead
              cols={COLS}
              cells={['Name', 'Title', 'Rank', 'Rate mode', 'Earns under', { label: 'Withholding', style: { textAlign: 'right' } }]}
            />
            {ordered.map((p, i) => {
              const v = shownValues(p, edits)
              const dirty = new Set(changedFields(p, edits))
              const upline = p.upline_staff_id ? (nameOf.get(p.upline_staff_id) ?? 'somebody not on this chart') : top ? `${top} (top)` : 'Top of a tree'
              const level = p.title_level_rank !== null ? ` · L${p.title_level_rank}` : ''
              const placed = p.rank_id ? rungs.find(r => r.id === p.rank_id) : undefined
              const earned = p.rate_mode === 'fixed' ? undefined : earnedFloor(rungs, p.title_id)
              const liftedTo = earned && placed && earned.sortOrder > placed.sortOrder ? earned : undefined
              return (
                <div
                  key={p.staff_id}
                  role="row"
                  className={hv.gtRow}
                  data-zebra={i % 2 ? 'true' : undefined}
                  style={{ gridTemplateColumns: COLS }}
                  onContextMenu={e => {
                    e.preventDefault()
                    if (!canEdit) return
                    setMenu({ person: p, anchor: { left: e.clientX, top: e.clientY, bottom: e.clientY } })
                  }}
                >
                  <span role="cell" className={s.nameCell} title={p.employee_name}>
                    <b>{p.employee_name}</b> {p.employee_code ? <span className={s.code}>{p.employee_code}</span> : null}
                    {p.direct_line_limit != null ? (
                      <span className={s.subLine}>
                        {p.direct_line_count ?? 0}/{p.direct_line_limit} directs{p.expansion_earned_at ? ' · SDL earned' : ''}
                      </span>
                    ) : null}
                  </span>
                  <span role="cell" className={s.textCell} title={`${p.title_name ?? 'No title yet'}${level}`}>
                    {p.title_name ?? '—'}
                    {level}
                  </span>
                  <span role="cell" className={s.cellPad}>
                    <CellSelect
                      label={`${p.employee_name} rank`}
                      value={v.rank}
                      dirty={dirty.has('rank')}
                      disabled={!canEdit || saving}
                      width={120}
                      onChange={value => edit(p, 'rank', value)}
                      options={[
                        ...(v.rank ? [] : [{ value: '', label: '—' }]),
                        ...ranks.map(r => ({ value: r.id, label: choiceOf(r.id) })),
                      ]}
                    />
                    {liftedTo && !dirty.has('rank') ? <span className={s.subLine}>paid from {choiceOf(liftedTo.id)} — earned by title</span> : null}
                  </span>
                  <span role="cell" className={s.cellPad}>
                    <CellSelect
                      label={`${p.employee_name} rate mode`}
                      value={v.mode}
                      dirty={dirty.has('mode')}
                      disabled={!canEdit || saving}
                      width={140}
                      onChange={value => edit(p, 'mode', value)}
                      options={(['', 'fixed', 'variable'] as const).map(m => ({ value: m, label: RATE_MODE_LABEL[m] }))}
                    />
                  </span>
                  <span role="cell" className={s.textCell} title={upline}>
                    {upline}
                  </span>
                  <span role="cell" className={s.cellPad} style={{ textAlign: 'right' }}>
                    <CellSelect
                      label={`${p.employee_name} withholding`}
                      value={v.wh}
                      dirty={dirty.has('wh')}
                      disabled={!canEdit || saving}
                      width={52}
                      caret={false}
                      align="right"
                      onChange={value => edit(p, 'wh', value)}
                      options={withholdingChoices(p).map(w => ({ value: w, label: withholdingLabel(w) }))}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {changes.length > 0 ? (
        <div className={s.saveBar} role="region" aria-label="Unsaved changes">
          <span className={s.saveBarText}>
            <b>{saveBarText(changes, cells)}</b>
          </span>
          <span className={s.saveBarActions}>
            <button type="button" className={s.discard} onClick={() => setEdits({})} disabled={saving}>
              Discard
            </button>
            <button type="button" className={s.saveChanges} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : `Save ${cells} change${cells === 1 ? '' : 's'}`}
            </button>
          </span>
        </div>
      ) : null}

      <div className={s.hint}>
        {canEdit
          ? `Change Rank, Rate mode or Withholding on a row; changed cells turn peach until you save. Right-click a person for their memberships. ${people.length} ${people.length === 1 ? 'person' : 'people'}.`
          : `${people.length} ${people.length === 1 ? 'person' : 'people'}.`}
      </div>

      {menu ? (
        <PersonContextMenu
          key={menu.person.staff_id}
          anchor={menu.anchor}
          person={{ staffId: menu.person.staff_id, name: menu.person.employee_name, titleId: menu.person.title_id }}
          currentDepartment={{ schemeId, name: subDeptName, isHome: menu.person.based_here }}
          destinations={membershipDestinations}
          employeeDepartments={employeeDepartments}
          canManageEmployment={canManageEmployment}
          employmentToday={employmentToday}
          onClose={() => setMenu(null)}
          onAdded={note => {
            setMenu(null)
            setNotes([{ ok: true, text: note }])
          }}
        />
      ) : null}

      <AddMemberWindow
        open={adding}
        onClose={() => setAdding(false)}
        candidates={candidates}
        titles={titles}
        ranks={ranks}
        schemeId={schemeId}
        subDeptName={subDeptName}
        onDone={n => {
          setNotes(n ? [n] : [])
        }}
      />
    </section>
  )
}

/** A select drawn as the prototype's box: a peach wash and an orange rim once changed. */
function CellSelect({
  label,
  value,
  options,
  dirty,
  disabled,
  width,
  caret = true,
  align = 'left',
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  dirty: boolean
  disabled: boolean
  width: number
  caret?: boolean
  align?: 'left' | 'right'
  onChange: (value: string) => void
}) {
  return (
    <span className={s.cellWrap} style={{ width } as CSSProperties}>
      <select
        className={s.cellSelect}
        data-dirty={dirty ? 'true' : 'false'}
        data-caret={caret ? 'true' : 'false'}
        style={{ textAlign: align, textAlignLast: align }}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {caret ? (
        <span className={s.cellCaret} aria-hidden="true">
          ▾
        </span>
      ) : null}
    </span>
  )
}

/** "REPORTS TO  Kris Revenue Director ×  Peter …  + Add director ……… + Add member". */
function ReportsTo({
  directors,
  candidates,
  subDepartmentId,
  subDeptName,
  canEdit,
  onNote,
  onAddMember,
  canAddMember,
  noCandidatesReason,
}: {
  directors: DirectorRow[]
  candidates: DirectorRow[]
  subDepartmentId: string
  subDeptName: string
  canEdit: boolean
  onNote: (n: { ok: boolean; text: string } | null) => void
  onAddMember: () => void
  canAddMember: boolean
  noCandidatesReason?: string
}) {
  const [pending, start] = useTransition()
  const [picking, setPicking] = useState(false)
  const pickRef = useRef<HTMLDivElement>(null)
  useEscape(picking, () => setPicking(false))

  function run(action: typeof addDirector, staffId: string, done: string) {
    const fd = new FormData()
    fd.set('sub_department_id', subDepartmentId)
    fd.set('staff_id', staffId)
    start(async () => {
      const res = await action(fd)
      if (!res.ok) {
        onNote({ ok: false, text: res.note ?? 'Could not change who it reports to.' })
        return
      }
      onNote(null)
      flash(done)
    })
  }

  return (
    <div className={s.reportsTo}>
      <span className={s.reportsLabel}>Reports to</span>
      {directors.length === 0 ? <span className={s.nobody}>Nobody directs {subDeptName} yet.</span> : null}
      {directors.map(d => (
        <span key={d.staff_id} className={s.directorChip}>
          <b>{d.employee_name}</b>
          <span className={s.directorTitle}>{d.title_name ?? 'Revenue Director'}</span>
          {canEdit ? (
            <button
              type="button"
              className={s.directorRemove}
              title="Remove"
              aria-label={`${subDeptName} no longer reports to ${d.employee_name}`}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`${subDeptName} no longer reports to ${d.employee_name}?`)) return
                run(removeDirector, d.staff_id, `${d.employee_name} removed from Reports to`)
              }}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        <div className={s.pickWrap} ref={pickRef}>
          <button
            type="button"
            className={s.addDirector}
            aria-haspopup="menu"
            aria-expanded={picking}
            disabled={pending}
            title={candidates.length === 0 ? (directors.length > 0 ? 'Every head of the department already directs it.' : 'Nobody in the department holds a title that heads it — tick “Heads the department” on the title under Hierarchy.') : undefined}
            onClick={() => setPicking(p => !p)}
          >
            + Add director
          </button>
          {picking ? (
            <div className={s.pickMenu} role="menu" aria-label="Add a director">
              {candidates.length === 0 ? (
                <p className={s.pickEmpty}>
                  {directors.length > 0 ? 'Every head of the department already directs it.' : 'Nobody in the department heads it yet.'}
                </p>
              ) : (
                candidates.map(c => (
                  <button
                    key={c.staff_id}
                    type="button"
                    role="menuitem"
                    className={s.pickItem}
                    onClick={() => {
                      setPicking(false)
                      run(addDirector, c.staff_id, `${subDeptName} now reports to ${c.employee_name}`)
                    }}
                  >
                    <b>{c.employee_name}</b>
                    {c.title_name ? <span>{c.title_name}</span> : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <span style={{ flex: 1 }} />
      {canEdit ? (
        <button type="button" className={`${hv.btn} ${hv.primary}`} onClick={onAddMember} disabled={!canAddMember} title={canAddMember ? undefined : noCandidatesReason}>
          + Add member
        </button>
      ) : null}
    </div>
  )
}

/** + Add member: somebody in the department, and the title they hold here. */
function AddMemberWindow({
  open,
  onClose,
  candidates,
  titles,
  ranks,
  schemeId,
  subDeptName,
  onDone,
}: {
  open: boolean
  onClose: () => void
  candidates: MemberCandidate[]
  titles: TitleRow[]
  ranks: RankRow[]
  schemeId: string
  subDeptName: string
  onDone: (n: { ok: boolean; text: string } | null) => void
}) {
  const [staffId, setStaffId] = useState('')
  const [titleId, setTitleId] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  // Only a title with a rung on THIS ladder: a membership needs a rank to be paid from.
  const onLadder = new Set(ranks.map(r => r.title_id))
  const holdable = titles.filter(t => onLadder.has(t.id) && !t.isDepartmentHead)

  function close() {
    setStaffId('')
    setTitleId('')
    setError('')
    onClose()
  }

  function add() {
    if (!staffId || !titleId || pending) return
    const fd = new FormData()
    fd.set('staff_id', staffId)
    fd.set('scheme_id', schemeId)
    fd.set('title_id', titleId)
    start(async () => {
      const res = await addMember(fd)
      if (!res.ok) {
        setError(res.note ?? 'Could not add this person.')
        return
      }
      const who = candidates.find(c => c.staff_id === staffId)?.employee_name ?? 'They'
      close()
      onDone(res.note ? { ok: true, text: res.note } : null)
      flash(`${who} joined ${subDeptName}`)
    })
  }

  return (
    <Window open={open} onClose={close} width={420} label={`Add a member to ${subDeptName}`}>
      <div className={s.addHead}>
        <div className={s.addTitle}>Add a member</div>
        <div className={s.addSub}>Somebody in the department, and the title they hold in {subDeptName}.</div>
      </div>
      <div className={s.addBody}>
        <label className={s.addField}>
          <span>Person</span>
          <select className={hv.select} value={staffId} onChange={e => setStaffId(e.target.value)} aria-label="Person to add">
            <option value="">— pick somebody —</option>
            {candidates.map(c => (
              <option key={c.staff_id} value={c.staff_id}>
                {c.employee_name}
                {c.company_title_name ? ` · ${c.company_title_name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={s.addField}>
          <span>Title in {subDeptName}</span>
          <select className={hv.select} value={titleId} onChange={e => setTitleId(e.target.value)} aria-label={`Title held in ${subDeptName}`}>
            <option value="">— pick a title —</option>
            {holdable.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {holdable.length === 0 ? <p className={s.addNote}>No title has a rung on this ladder yet — set the Title ladder under Rules first.</p> : null}
        {error ? (
          <p className={s.addError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className={s.addFoot}>
        <button type="button" className={btn('outline')} onClick={close}>
          Cancel
        </button>
        <button type="button" className={btn('primary')} onClick={add} disabled={!staffId || !titleId || pending}>
          {pending ? 'Adding…' : 'Add member'}
        </button>
      </div>
    </Window>
  )
}
