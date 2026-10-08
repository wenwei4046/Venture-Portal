import { redirect } from 'next/navigation'

/**
 * Permissions moved into People Management as its second tab (2026-10-08, the
 * People Management revamp): permission templates — a function, an action on
 * it, and how far it reaches — that titles point at. Old links land there.
 */
export default function PermissionsPage() {
  redirect('/team/people?tab=permissions')
}
