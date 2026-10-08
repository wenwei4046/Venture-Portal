'use client'

import { ACTIONS, CELL_LABEL, type Action, type Cell, type PermFunction } from '@/lib/permission-matrix'

/**
 * One cell of a permission matrix — the template's, the invite drawer's or a
 * person's (globals.css › `.perm-cell`). `·` · Own · Dept · All; hatched where
 * the function has no such action; a walnut ring where a person's own value
 * differs from their template's. A button only when it can be changed.
 */
export default function PermissionCell({
  fn,
  action,
  cell,
  onClick,
  small,
  changed,
}: {
  fn: PermFunction
  action: Action
  cell: Cell
  onClick?: () => void
  small?: boolean
  changed?: boolean
}) {
  if (!fn.actions.includes(action)) return <span className={`perm-cell na ${small ? 'small' : ''}`} aria-hidden />
  const cls = ['perm-cell', cell === 'none' ? '' : cell, small ? 'small' : '', changed ? 'changed' : ''].filter(Boolean).join(' ')
  const actionLabel = ACTIONS.find(a => a.key === action)!.label
  const label = `${fn.label} · ${actionLabel}: ${cell === 'none' ? 'not granted' : CELL_LABEL[cell]}${changed ? ' (changed for this person)' : ''}`
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={label} title={label}>
      {CELL_LABEL[cell]}
    </button>
  ) : (
    <span className={cls} role="img" aria-label={label} title={label}>
      {CELL_LABEL[cell]}
    </span>
  )
}
