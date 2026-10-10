'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { btn, hv } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { levelLabel, type RoleRung, type RoleTitle } from '@/lib/hierarchy-roles'
import { createTitle, deleteTitle, updateTitle } from '../title-actions'
import s from './hierarchy.module.css'

export interface DepartmentOption {
  id: string
  name: string
}

/**
 * A title, edited or made (Hierarchy › People & roles, 2026-10-10): its name,
 * the department it sits under, the rung it stands on, whether it is offered
 * to the next hire, whether it heads its department. What it may do is its
 * permission template, set under People › Permissions. Deleting one is the
 * Principal's, and only while nobody holds it.
 */
export default function TitleWindow({
  title,
  people,
  rungs,
  departments,
  canDelete,
  onClose,
}: {
  /** null = a new title. */
  title: RoleTitle | null
  /** How many hold it. */
  people: number
  rungs: RoleRung[]
  departments: DepartmentOption[]
  canDelete: boolean
  onClose: () => void
}) {
  const [name, setName] = useState(title?.name ?? '')
  const [departmentId, setDepartmentId] = useState(title?.departmentId ?? '')
  const [levelId, setLevelId] = useState(title?.levelId ?? '')
  const [isActive, setIsActive] = useState(title?.isActive ?? true)
  const [isHead, setIsHead] = useState(title?.isDepartmentHead ?? false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    if (pending) return
    setRefusal(null)
    const input = { id: title?.id, name, departmentId: departmentId || null, levelId: levelId || null, isActive, isDepartmentHead: isHead }
    startTransition(async () => {
      const result = title ? await updateTitle(input) : await createTitle(input)
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      flash(title ? `${name.trim()} saved` : `${name.trim()} created`)
      onClose()
    })
  }

  function remove() {
    if (pending || !title) return
    setRefusal(null)
    startTransition(async () => {
      const result = await deleteTitle(title.id)
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      flash(`${title.name} deleted`)
      onClose()
    })
  }

  const ladder = [...rungs].sort((a, b) => b.rank - a.rank)

  return (
    <Window
      open
      onClose={onClose}
      width={466}
      scrim={0.22}
      z={32}
      label={title ? `Edit ${title.name}` : 'New title'}
      style={{ border: '1px solid rgb(var(--hv-hairline))', borderRadius: 14, boxShadow: '0 16px 48px rgb(43 31 23 / 0.2)', padding: 22 }}
    >
      <div className={s.tw}>
        <div>
          <h2 className={s.twTitle}>{title ? `Edit ${title.name}` : 'New title'}</h2>
          <div className={s.twSub}>
            {title
              ? `${people} ${people === 1 ? 'person holds' : 'people hold'} it. What it may do is its permission template.`
              : 'What somebody is called, under which department, on which level.'}
          </div>
        </div>
        <label className={s.twField}>
          <span className={s.twLabel}>Name *</span>
          <input className={hv.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Team Leader" />
        </label>
        <label className={s.twField}>
          <span className={s.twLabel}>Department</span>
          <select className={hv.select} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">No department</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.twField}>
          <span className={s.twLabel}>Level</span>
          <select className={hv.select} value={levelId} onChange={e => setLevelId(e.target.value)}>
            <option value="">Not on the ladder</option>
            {ladder.map(r => (
              <option key={r.id} value={r.id}>
                {levelLabel(r.rank)} · {r.name}
              </option>
            ))}
          </select>
        </label>
        {title ? (
          <label className={s.twCheck}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span>
              Active
              <span className={s.twHint}> — an inactive title stays with whoever holds it, and is not offered to the next hire.</span>
            </span>
          </label>
        ) : null}
        <label className={s.twCheck}>
          <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} />
          <span>
            Heads its department
            <span className={s.twHint}>
              {' '}
              — stands above the commission ladder with no rank; everybody in a commission department may report to it, and no
              override climbs past it (the Revenue Director).
            </span>
          </span>
        </label>
        {title ? (
          <div className={s.twTemplate}>
            <span className={s.twLabel}>Permission template · </span>
            {title.templateId ? (
              <Link href={`/team/people?tab=permissions&template=${title.templateId}`}>{title.templateName ?? 'unnamed'} →</Link>
            ) : (
              'none yet — set under People › Permissions'
            )}
          </div>
        ) : null}
        {refusal ? (
          <div className={s.twRefusal} role="alert">
            {refusal}
          </div>
        ) : null}
        <div className={s.twFoot}>
          {title && canDelete ? (
            <button
              type="button"
              className={`${btn('danger')} ${s.twDelete}`}
              onClick={remove}
              disabled={pending || people > 0}
              title={people > 0 ? 'Move whoever holds it first, or deactivate it instead' : undefined}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className={btn('outline')} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn('primary')} onClick={save} disabled={pending}>
            {pending ? 'Saving…' : title ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Window>
  )
}
