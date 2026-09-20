export interface OrgRank {
  id: string
  rankKey: string
  titleId: string
  label: string
  productRate: number
  canRecruit: boolean
  sortOrder: number
}

/** One person's membership in one scheme. A company identity may occur in several. */
export interface OrgPerson {
  staffId: string
  name: string
  code: string | null
  titleName: string | null
  titleId: string | null
  levelRank: number | null
  levelName: string | null
  uplineStaffId: string | null
  rankId: string | null
  rankLabel: string | null
  productRate: number | null
  rankPayLabel?: string
  isGroupPackage?: boolean
  canRecruit: boolean
  /**
   * This sub-department is where they are BASED: the roster describes this
   * membership, so their title comes from People and their line is the
   * company one. Per person — the same chart draws both kinds (2026-09-20).
   */
  basedHere: boolean
  rateMode: 'fixed' | 'variable' | null
  placedSince: string | null
  directLineCount?: number
  directLineLimit?: number | null
  expansionEarnedAt?: string | null
  expansionSourcePeriod?: string | null
}

/**
 * A department head this sub-department reports to (2026-09-11). Drawn in a
 * row above every team; never a member, never an upline.
 */
export interface OrgDirector {
  staffId: string
  name: string
  code: string | null
  titleName: string | null
}

export interface OrgDepartment {
  id: string
  name: string
  slug: string
  schemeId: string
  isHome: boolean
  people: OrgPerson[]
  ranks: OrgRank[]
  /** Who the sub-department reports to, A→Z. Absent or empty: nobody yet. */
  directors?: OrgDirector[]
}

export function membershipKey(schemeId: string, staffId: string): string {
  return `${schemeId}:${staffId}`
}

/** A director's card on one department's frame. The same person may direct several. */
export function directorKey(schemeId: string, staffId: string): string {
  return `director:${schemeId}:${staffId}`
}
