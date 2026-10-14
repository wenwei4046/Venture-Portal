import { redirect } from 'next/navigation'
import { requirePage } from '@/lib/auth'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * The old Edit page's address (2026-10-14): a person is edited where their
 * record stands now — the full page opens with its fields out — so a link or a
 * bookmark to it lands there. Whether they may edit is the page's to say.
 */
export default async function EditStaffPage({ params }: PageProps) {
  await requirePage('/team/people/[id]/edit')
  const { id } = await params
  redirect(`/team/people/${id}?edit=1`)
}
