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
  rateMode: 'fixed' | 'variable' | null
  placedSince: string | null
  directLineCount?: number
  directLineLimit?: number | null
  expansionEarnedAt?: string | null
  expansionSourcePeriod?: string | null
}

export interface OrgDepartment {
  id: string
  name: string
  slug: string
  schemeId: string
  isHome: boolean
  people: OrgPerson[]
  ranks: OrgRank[]
}

export function membershipKey(schemeId: string, staffId: string): string {
  return `${schemeId}:${staffId}`
}
