import { redirect } from 'next/navigation'

/**
 * Roles moved into Hierarchy as its fourth tab (2026-10-08, the People
 * Management revamp) — a title, its department, its rung and its permission
 * template, beside the chart and the ladder they shape. Old links land there.
 */
export default function RolesPage() {
  redirect('/team/hierarchy?tab=roles')
}
