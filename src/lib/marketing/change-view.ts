// CHANGE VIEW (2026-11-11 — the user: "在 marketing 左侧功能表加 change view 功能，因为有些时候我会开一个权限让 marketing 可以看到
// crm 的成效和回复情况（跨团队），因此当我在 hr permission 那边有开放此权限的人，他的画面都会有这个 change view 的部分").
// The cross-team permission is the matrix's CRM · View, ticked for the person in People › Permissions (or on their
// title's template). The database already reads such a login as the CRM's Boss (`crm_my_role()`: CRM · View, an
// active People record, no CRM title → 'boss') — Overview, Reports, Team activity, reply times — and without
// CRM · Manage they change nothing there. This module only says which views a Marketing login may change between:
// Marketing's own and the CRM. Pure — safe for the client, the server and tests.

import { canDo, type ActionHolder } from '@/lib/permission-actions'

export type ChangeViewKey = 'marketing' | 'crm'

export interface ChangeViewRow {
  key: ChangeViewKey
  label: string
  emoji: string
  href: string
}

/** Where the CRM opens: the Revenue app's Profile › CRM (on a computer, the CRM's desktop). */
export const CRM_HREF = '/member?page=account&view=crm'

const MARKETING: ChangeViewRow = { key: 'marketing', label: 'Marketing', emoji: '📣', href: '/marketing' }
const CRM: ChangeViewRow = { key: 'crm', label: 'CRM', emoji: '💬', href: CRM_HREF }

export interface ChangeViewHolder extends ActionHolder {
  /** Ultimate full access switches every view from the top bar already. */
  canSwitchView?: boolean
  /** Viewing as a person draws their portal read-only — never a door out of it. */
  viewingAs?: unknown
  tabs?: readonly string[]
}

/**
 * The views a Marketing login may change between — empty when there is nothing to change to (no cross-team
 * permission), or when the account has the portal's own view switch (the Principal's kind).
 */
export function changeViews(holder: ChangeViewHolder | null | undefined): ChangeViewRow[] {
  if (!holder || holder.canSwitchView || holder.viewingAs) return []
  if (!canDo(holder, 'crm', 'view', 'own')) return []
  return [MARKETING, CRM]
}
