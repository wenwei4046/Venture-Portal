import { redirect } from 'next/navigation'

interface PageProps {
  searchParams: Promise<{ staff?: string }>
}

/**
 * Invite user is a drawer on People Management since 2026-10-08 (the People
 * Management revamp). This address stays as a deep link: it opens the drawer,
 * with the person picked when `?staff=` names one.
 */
export default async function InviteUserPage({ searchParams }: PageProps) {
  const { staff } = await searchParams
  redirect(`/team/people?invite=${encodeURIComponent(staff || 'new')}`)
}
