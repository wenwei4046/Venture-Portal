// Profile › Admin › Departments in the Finance phone app (2026-10-15, part E3b
// — a page the design does not draw, in its style): Settings › Departments as
// the desktop reads it — the departments as the headline, how many are cost
// centers, how many bill their own-share salary back; each department its own
// screen with its segment, pool, billing mode, mode and bill-back, and the
// desktop's steps on it. Pure.

import type { DepartmentMode } from '@/lib/department-mode'
import { hasMode } from '@/lib/department-mode'
import { billingModeLabel } from '@/lib/invoice-labels'
import type { HubCardItem } from '@/components/finv/Hub'
import { plural } from './page-model'

export interface DeptInput {
  id: string
  name: string
  is_internal: boolean
  segment_key: string | null
  pool_gl_code: string | null
  billing_mode_key: string | null
  own_share_billback: boolean
}

export interface DeptLine {
  id: string
  name: string
  internal: boolean
  /** Provisioned: its own segment, P&L, pool and billing mode. */
  full: boolean
  segment: string
  /** "3120 · Marketing pool", or '—'. */
  pool: string
  billing: string
  /** Cost center / centralized, where the department has a mode. */
  mode: DepartmentMode | null
  /** May bill its own-share salary back (a full department, not the internal one). */
  billsBack: boolean
  billback: boolean
  /** What it is, in words. */
  kind: string
}

export type DeptCard = 'all' | 'billback'
export const DEPT_CARDS: readonly DeptCard[] = ['all', 'billback']

export interface DepartmentsModel {
  hero: { value: string; label: string }
  chip: string | null
  cards: HubCardItem[]
  depts: DeptLine[]
}

/** The desktop's own slug for a segment key ("Revenue Department" → revenue_department). */
export function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 31)
}

/** A segment key the database takes: 3–31 of a–z, 0–9, _ — a letter first. */
export const SEGMENT_KEY = /^[a-z][a-z0-9_]{2,30}$/

/** What a typed segment key becomes (the desktop field's own rule). */
export const segmentKeyOf = (typed: string) => typed.toLowerCase().replace(/[^a-z0-9_]/g, '_')

export const modeWords = (m: DepartmentMode | null) => (m ? (m.costModel === 'cost_center' ? 'Cost center' : 'Centralized') : '—')

export function departmentsModel(rows: readonly DeptInput[], modes: readonly DepartmentMode[], poolNames: Readonly<Record<string, string>>): DepartmentsModel {
  const modeById = new Map(modes.map((m) => [m.id, m]))
  const depts: DeptLine[] = rows.map((d) => {
    const full = d.segment_key !== null
    const m = modeById.get(d.id)
    return {
      id: d.id,
      name: d.name,
      internal: d.is_internal,
      full,
      segment: full ? (d.segment_key as string) : 'Venture (light)',
      pool: d.pool_gl_code ? `${d.pool_gl_code}${poolNames[d.pool_gl_code] ? ` · ${poolNames[d.pool_gl_code]}` : ''}` : '—',
      billing: billingModeLabel(d.billing_mode_key),
      mode: m && hasMode(m) ? m : null,
      billsBack: full && !d.is_internal,
      billback: d.own_share_billback,
      kind: d.is_internal ? 'Internal' : full ? 'Full department' : 'Light · books under Venture',
    }
  })
  const real = depts.filter((d) => !d.internal)
  const costCenters = modes.filter((m) => !m.isInternal && m.costModel === 'cost_center').length
  const eligible = depts.filter((d) => d.billsBack)
  const billBack = real.filter((d) => d.billback).length
  return {
    hero: { value: String(real.length), label: `Departments · ${plural(costCenters, 'cost center', 'cost centers')}` },
    chip: `${billBack} bill back salary`,
    cards: [
      {
        key: 'all',
        tone: 'all',
        icon: 'org',
        label: 'Departments',
        sub: `${plural(depts.filter((d) => d.full && !d.internal).length, 'full', 'full')} · ${plural(depts.filter((d) => !d.full && !d.internal).length, 'light', 'light')}`,
        value: plural(depts.length, 'department', 'departments'),
      },
      {
        key: 'billback',
        tone: 'payroll',
        icon: 'payroll',
        label: 'Bill back salary',
        sub: `Of ${plural(eligible.length, 'full department', 'full departments')}`,
        value: plural(billBack, 'department', 'departments'),
      },
    ],
    depts,
  }
}
