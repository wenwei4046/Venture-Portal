'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Chip, HvPage, PageHead, SecLabel } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { hiringFileLink, removeHiringTalent, saveHiringTalent } from '@/lib/hiring/actions'
import { extLabel } from '@/lib/hiring/files'
import { dayLabel, departmentNames, talentStatus } from '@/lib/hiring/view'
import type { HiringBoard, HiringFile, HiringFileType, HiringTalent } from '@/lib/hiring/types'
import { WaitingFiles, sendWaiting, waitingProblem, type Waiting } from './HiringFiles'
import s from './hiring.module.css'

type Nav = { dept?: string; pos?: string }

/**
 * Hiring › Talent Bank (README §13, portal-35): good candidates kept on file —
 * a 260px tree (search, All talent, each department and the positions under
 * it), the people as a table (right-click to remove), + Add talent (520px
 * drawer) and a person's 460px panel; Full page → opens their own page.
 */
export default function TalentBankView({ board, can }: { board: HiringBoard; can: { create: boolean; edit: boolean } }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [nav, setNav] = useState<Nav>({})
  const [openDepts, setOpenDepts] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [, start] = useTransition()

  const depts = useMemo(() => {
    const names = departmentNames(board)
    return [...names, ...board.talents.map(t => t.department).filter(d => d && !names.includes(d))].filter((d, i, a) => a.indexOf(d) === i)
  }, [board])
  const qOk = (t: HiringTalent) => !q.trim() || `${t.name} ${t.position} ${t.notes}`.toLowerCase().includes(q.trim().toLowerCase())
  const list = board.talents.filter(t => (!nav.dept || t.department === nav.dept) && (!nav.pos || t.position === nav.pos) && qOk(t))
  const picked = board.talents.find(t => t.id === sel) ?? null

  const remove = (t: HiringTalent) =>
    start(async () => {
      const out = await removeHiringTalent(t.id)
      if (!out.ok) return flash(out.reason)
      setSel(null)
      setMenu(null)
      setArmed(false)
      flash(out.warning ?? `${t.name} removed from the Talent Bank`)
    })
  const view = (f: HiringFile) =>
    start(async () => {
      const out = await hiringFileLink('file', f.id)
      if (!out.ok) return flash(out.reason)
      window.open(out.url, '_blank', 'noopener')
    })

  const head = nav.pos ?? nav.dept ?? 'All talent'
  const sub = (nav.pos ? `${nav.dept} · ` : '') + list.length + (list.length === 1 ? ' person' : ' people')

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Talent Bank" title="Talent Bank" subtitle="Good candidates kept on file, ready to invite when a role opens." />
      <div className={s.talGrid}>
        <section className={s.tree} aria-label="Departments">
          <input className={`${s.input} ${s.treeSearch}`} value={q} placeholder="Search name or notes" aria-label="Search name or notes" onChange={e => setQ(e.target.value)} />
          <button type="button" className={s.treeRow} aria-current={!nav.dept} onClick={() => setNav({})}>
            <span className={s.treeName}>All talent</span>
            <span className={s.treeN}>{board.talents.filter(qOk).length}</span>
          </button>
          {depts.map(d => {
            const mine = board.talents.filter(t => t.department === d && qOk(t))
            const open = !!openDepts[d] || nav.dept === d
            const positions = [...new Set(mine.map(t => t.position))]
            // A Fragment, not a div: the department row and its positions sit in the tree's own 4px rhythm, as the
            // prototype's do — and an opened department with nobody in it still draws its (empty) block.
            return (
              <Fragment key={d}>
                <button
                  type="button"
                  className={s.treeRow}
                  aria-current={nav.dept === d && !nav.pos}
                  aria-expanded={open}
                  onClick={() => {
                    setNav({ dept: d })
                    setOpenDepts(o => ({ ...o, [d]: !(nav.dept === d && !nav.pos) || !open }))
                  }}
                >
                  <span className={s.treeCaret} data-open={open ? 'true' : undefined} aria-hidden="true">
                    ▸
                  </span>
                  <span className={s.treeName}>{d}</span>
                  <span className={s.treeN}>{mine.length}</span>
                </button>
                {open ? (
                  <div className={s.treeKids}>
                    {positions.map(p => (
                      <button key={p} type="button" className={s.treeKid} aria-current={nav.dept === d && nav.pos === p} onClick={() => setNav({ dept: d, pos: p })}>
                        <span className={s.treeKidName}>{p}</span>
                        <span className={s.treeN}>{mine.filter(t => t.position === p).length}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </Fragment>
            )
          })}
        </section>

        <div className={s.talMain}>
          <div className={s.talHeadRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={s.talHead}>{head}</div>
              <div className={s.talSub}>{sub}</div>
            </div>
            {can.create ? (
              <button type="button" className={s.btnOrange} onClick={() => setAdding(true)}>
                + Add talent
              </button>
            ) : null}
          </div>
          <div className={`${s.table} ${s.talTable}`} role="table" aria-label="Talent">
            <div className={`${s.thead} ${s.talThead} ${s.talCols}`} role="row">
              {['Name', 'Good fit for', 'Notes', 'Saved', 'Status'].map(h => (
                <span key={h} role="columnheader">
                  {h}
                </span>
              ))}
            </div>
            {list.map(t => {
              const st = talentStatus(board, t)
              return (
                <div key={t.id} className={s.rowWrap}>
                  <div
                    role="row"
                    tabIndex={0}
                    className={`${s.row} ${s.talRow} ${s.talCols}`}
                    aria-current={sel === t.id}
                    onClick={() => {
                      setSel(t.id)
                      setMenu(null)
                      setArmed(false)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setSel(t.id)
                    }}
                    onContextMenu={e => {
                      e.preventDefault()
                      setMenu(t.id)
                    }}
                  >
                    <span>
                      <span className={s.talName}>{t.name}</span>
                      <span className={s.talSmall}>{t.fromRequest ? 'From ' + t.fromRequest : 'Added directly'}</span>
                    </span>
                    <span>
                      <span style={{ display: 'block' }}>{t.position}</span>
                      <span className={s.talSmall}>{t.department}</span>
                    </span>
                    <span className={s.talNote}>{t.notes.split('\n')[0]}</span>
                    <span className={s.talWhen}>{dayLabel(t.savedAt)}</span>
                    <span>
                      <Chip tone={st.tone} style={{ fontSize: 10.5 }}>
                        {st.label}
                      </Chip>
                    </span>
                  </div>
                  {menu === t.id ? (
                    <>
                      <div className={s.ctxCatch} onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} aria-hidden="true" />
                      <div className={`${s.ctx} ${s.talCtx}`} role="menu" aria-label={`${t.name} actions`}>
                        <button type="button" role="menuitem" className={s.ctxItem} data-tone="ink" onClick={() => { setMenu(null); setSel(t.id); setArmed(false) }}>
                          Open
                        </button>
                        {can.edit ? (
                          <button type="button" role="menuitem" className={s.ctxItem} data-tone="danger" onClick={() => remove(t)}>
                            Remove from Talent Bank
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              )
            })}
            {list.length ? null : <div className={s.listEmpty}>Nobody here yet.</div>}
          </div>
          <div className={s.listFoot} style={{ marginTop: 0 }}>
            Right-click a row to remove it.
          </div>
        </div>
      </div>

      <AddTalentDrawer open={adding} depts={depts} types={board.fileTypes} canAddType={can.edit} onClose={() => setAdding(false)} />

      <Drawer
        open={!!picked}
        onClose={() => setSel(null)}
        width={460}
        headStyle={{ padding: '18px 22px' }}
        headGrow
        bodyStyle={{ padding: '18px 22px' }}
        head={
          picked ? (
            <div>
              <div className={s.isKicker}>{picked.no}</div>
              <div className={s.isTitle}>{picked.name}</div>
              <div style={{ marginTop: 8 }}>
                <Chip tone={talentStatus(board, picked).tone} style={{ fontSize: 10.5 }}>
                  {talentStatus(board, picked).label}
                </Chip>
              </div>
            </div>
          ) : null
        }
        footer={
          picked ? (
            <div className={s.tsFoot}>
              {can.edit ? (
                <button
                  type="button"
                  className={`${s.btnDanger} ${s.actWhite} ${s.armBtn}`}
                  data-armed={armed ? 'true' : undefined}
                  onClick={() => (armed ? remove(picked) : setArmed(true))}
                >
                  {armed ? 'Confirm remove' : 'Remove'}
                </button>
              ) : null}
              <button type="button" className={s.btnPlain} onClick={() => setSel(null)}>
                Close
              </button>
              <button type="button" className={s.btnOrange} style={{ padding: '8px 18px' }} onClick={() => router.push(`/hiring/talent/${picked.id}`)}>
                Full page →
              </button>
            </div>
          ) : null
        }
      >
        {picked ? (
          <div className={s.tsBody}>
            <div className={s.facts}>
              {[
                ['Good fit for', picked.position, true],
                ['Department', picked.department, true],
                ['Phone', picked.phone || '—', false],
                ['Email', picked.email || '—', false],
                ['Saved from', picked.fromRequest || 'Added directly', false],
                ['Saved', dayLabel(picked.savedAt), false],
              ].map(([l, v, strong]) => (
                <Pair key={String(l)} label={String(l)} value={String(v)} strong={!!strong} />
              ))}
            </div>
            <div>
              <SecLabel style={{ marginBottom: 6 }}>HR notes</SecLabel>
              <div className={s.tsNotes}>{picked.notes || 'No notes yet.'}</div>
            </div>
            {picked.files.length ? (
              <div className={s.hfGroup} role="group" aria-label="Files">
                {picked.files.map(f => (
                  <div key={f.id} className={s.tsFile}>
                    <span className={s.extTile}>{extLabel(f.name)}</span>
                    <span className={s.hfMain}>
                      <span className={s.hfName}>{f.name}</span>
                      <span className={s.hfKind}>{f.type}</span>
                    </span>
                    <button type="button" className={s.btnGhost} aria-label={`View ${f.name}`} onClick={() => view(f)}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.tsFile}>
                <span className={s.extTile}>—</span>
                <span className={s.tsFileName}>No files</span>
              </div>
            )}
            <div>
              <SecLabel style={{ marginBottom: 6 }}>Latest</SecLabel>
              <div className={s.tsLatest}>{latestOf(picked)}</div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </HvPage>
  )
}

function latestOf(t: HiringTalent): string {
  const e = t.events.at(-1)
  return e ? [e.what, dayLabel(e.at), e.note].filter(Boolean).join(' · ') : '—'
}

function Pair({ label, value, strong }: { label: string; value: string; strong: boolean }) {
  return (
    <>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue} data-strong={strong ? 'true' : undefined}>
        {value}
      </span>
    </>
  )
}

/** + Add talent (README §13 — the 520px drawer): a name and what they fit are needed; the rest helps — their files too, each with its type. */
function AddTalentDrawer({
  open,
  depts,
  types,
  canAddType,
  onClose,
}: {
  open: boolean
  depts: string[]
  types: readonly HiringFileType[]
  canAddType: boolean
  onClose: () => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', position: '', department: depts[0] ?? '', notes: '' })
  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    setErr('')
  }
  const close = () => {
    setForm({ name: '', phone: '', email: '', position: '', department: depts[0] ?? '', notes: '' })
    setWaiting([])
    setErr('')
    onClose()
  }
  const save = () => {
    if (!form.name.trim() || !form.position.trim()) return setErr('Add a name and the position they fit.')
    const problem = waitingProblem(waiting)
    if (problem) return setErr(problem)
    start(async () => {
      const sent = await sendWaiting(waiting, types)
      if (!sent.ok) return setErr(sent.reason)
      const data = new FormData()
      for (const [k, v] of Object.entries(form)) data.set(k, v)
      data.set('files', JSON.stringify(sent.files))
      const out = await saveHiringTalent(data)
      if (!out.ok) return setErr(out.reason)
      flash(`${form.name.trim()} added to the Talent Bank`)
      close()
    })
  }
  return (
    <Drawer
      open={open}
      onClose={close}
      width={520}
      headStyle={{ padding: '18px 22px' }}
      headGrow
      bodyStyle={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}
      head={
        <div>
          <div className={s.drawerTitle}>Add to Talent Bank</div>
          <div className={s.drawerSub}>Someone worth calling back when a role opens.</div>
        </div>
      }
    >
      <div className={s.addGrid}>
        <input className={s.input} value={form.name} placeholder="Name" aria-label="Name" onChange={set('name')} />
        <input className={s.input} value={form.phone} placeholder="Phone" aria-label="Phone" onChange={set('phone')} />
        <input className={s.input} value={form.email} placeholder="Email" aria-label="Email" onChange={set('email')} />
        <input className={s.input} value={form.position} placeholder="Good fit for (position)" aria-label="Good fit for (position)" onChange={set('position')} />
        <Select bare className={s.select} value={form.department} aria-label="Department" onChange={set('department')}>
          {depts.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>
      <div className={s.hfGroup} role="group" aria-label="Files">
        <WaitingFiles types={types} kept={[]} waiting={waiting} canAddType={canAddType} onChange={next => { setWaiting(next); setErr('') }} />
      </div>
      <textarea className={s.textarea} rows={3} value={form.notes} placeholder="Why keep them — strengths, what to check next time" aria-label="Why keep them" onChange={set('notes')} />
      <div className={s.addFoot}>
        <span className={`${s.err} ${s.grow}`}>{err}</span>
        <button type="button" className={s.btnGhost} onClick={close}>
          Cancel
        </button>
        <button type="button" className={s.btnOrange} onClick={save} disabled={pending}>
          Save talent
        </button>
      </div>
    </Drawer>
  )
}
