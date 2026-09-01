import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import ActivityLog from '../../_components/ActivityLog'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * A login account that is not attached to anybody on the roster.
 *
 * Every person on the roster is read at /team/people/[id]; this page exists
 * only for the other direction — the four accounts that predate the Team
 * module and belong to no staff row. Once Invite User attaches them, nothing
 * links here any more.
 */
export default async function AccountDetailPage({ params }: PageProps) {
  await requireRole(['principal'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: account }, { data: person }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at, departments (name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name')
      .eq('user_id', id)
      .maybeSingle(),
  ])

  if (!account) notFound()

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const deptName: string | null = (account as any).departments?.name ?? null

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to People
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TEAM · ACCOUNT
          </div>
          <h1 className="page-title">{account.name}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            <span className="font-mono text-sm text-muted mr-2 not-italic">{account.email}</span>
            <em className="mr-2">{account.role}</em>
            {account.is_active ? null : <em className="text-danger">disabled</em>}
          </p>
        </div>
      </div>

      <div className="border border-hairline rounded-card bg-surface p-5 max-w-2xl">
        <dl className="space-y-3">
          <Field label="Email" value={account.email} mono />
          <Field label="Role" value={account.role} />
          <Field label="Department" value={deptName} />
          <Field label="Status" value={account.is_active ? 'Active' : 'Disabled'} />
          <Field
            label="Person"
            value={person ? person.employee_name : null}
            empty="Not attached to anybody on the roster"
          />
        </dl>
      </div>

      <ActivityLog userId={account.id} />
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  empty,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  empty?: string
}) {
  const isEmpty = value == null || value === ''
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 items-baseline">
      <dt className="font-sans text-xs uppercase tracking-wide text-graphite">{label}</dt>
      <dd
        className={[
          mono && !isEmpty ? 'font-mono tabular text-sm' : 'font-serif text-sm',
          isEmpty ? 'text-muted italic' : 'text-ink',
        ].join(' ')}
      >
        {isEmpty ? (empty ?? '—') : value}
      </dd>
    </div>
  )
}
