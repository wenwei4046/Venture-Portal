'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { levelLabel, roleBands, type RolePerson, type RoleRung, type RoleTitle } from '@/lib/hierarchy-roles'
import s from './hierarchy.module.css'

/**
 * Hierarchy › People & roles as the handoff draws it (2026-10-10): a band per
 * title — its level, how many hold it, its permission template — over the
 * people holding it (who they report to, their department, the template).
 * The title is edited from its band (Edit), as Roles' rows once were; a new
 * one starts from the head's + New title.
 */
export default function PeopleRoles({
  titles,
  rungs,
  people,
  canManage,
  onEdit,
}: {
  titles: RoleTitle[]
  rungs: RoleRung[]
  people: RolePerson[]
  /** Team · Manage: titles are written by whoever manages the team. */
  canManage: boolean
  onEdit: (titleId: string) => void
}) {
  const bands = roleBands(titles, rungs, people)
  return (
    <div className={s.roles} role="table" aria-label="People and roles">
      <div className={s.rolesHead} role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Reports to</span>
        <span role="columnheader">Department</span>
        <span role="columnheader">Permission template</span>
      </div>
      {bands.map(({ title, rank, people: holders }) => (
        <Fragment key={title.id}>
          <div className={s.band} role="row" data-inactive={title.isActive ? undefined : 'true'}>
            <span className={s.bandName}>{title.name}</span>
            <span className={s.bandMeta}>
              {levelLabel(rank)} · {holders.length} {holders.length === 1 ? 'person' : 'people'}
              {title.isActive ? '' : ' · inactive'}
              {title.isDepartmentHead ? ' · heads its department' : ''}
            </span>
            <span className={s.bandSpacer} />
            {canManage ? (
              <button type="button" className={s.bandLink} onClick={() => onEdit(title.id)} aria-label={`Edit ${title.name}`}>
                Edit
              </button>
            ) : null}
            {title.templateId ? (
              <Link className={s.bandLink} href={`/team/people?tab=permissions&template=${title.templateId}`}>
                Template: {title.templateName ?? 'unnamed'}
              </Link>
            ) : (
              <span className={s.bandQuiet}>No template</span>
            )}
          </div>
          {holders.map(p => (
            <div key={p.id} className={s.rolesRow} role="row">
              <span className={s.rolesName}>{p.name}</span>
              <span>{p.manager ?? '—'}</span>
              <span className={s.rolesQuiet}>{p.department ?? '—'}</span>
              <span className={s.rolesQuiet}>{title.templateName ?? '—'}</span>
            </div>
          ))}
        </Fragment>
      ))}
      {bands.length === 0 ? <div className={s.rolesEmpty}>No titles yet.</div> : null}
    </div>
  )
}
