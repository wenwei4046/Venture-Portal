import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
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
  await requirePermission('team_invite')
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
      <Link href="/team/people" className="inline-block mb-3 text-sm hover:text-accent transition-colors">
        ← Back to People
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · ACCOUNT
          </div>
          <h1 className="page-title">{account.name}</h1>
          <p className="text-sm mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono">{account.email}</span>
            <span className="chip">{account.role}</span>
            {account.is_active ? null : (
              <span className="chip danger">
                <span className="dot" aria-hidden />
                disabled
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="border border-hairline rounded-card bg-surface p-5 max-w-2xl">
        <dl className="space-y-3">
          <Field label="Email" value={account.email} mono />
          <Field label="Role" value={account.role} />
          <Field label="Department" value={deptName} />
          <Field label="Status">
            {account.is_active ? (
              <span className="chip ledger">
                <span className="dot" aria-hidden />
                Active
              </span>
            ) : (
              <span className="chip danger">
                <span className="dot" aria-hidden />
                Disabled
              </span>
            )}
          </Field>
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

/** On the sheet every grey is black, so an empty answer is told apart from a
 *  value by fading it rather than by a lighter colour. */
function Field({
  label,
  value,
  mono,
  empty,
  children,
}: {
  label: string
  value?: string | null
  mono?: boolean
  empty?: string
  /** A value that is a state rather than text — rendered as given. */
  children?: React.ReactNode
}) {
  const isEmpty = children == null && (value == null || value === '')
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 items-baseline">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em]">{label}</dt>
      <dd
        className={
          children != null
            ? undefined
            : isEmpty
              ? 'text-sm text-ink/60'
              : mono
                ? 'font-mono tabular text-[12.5px]'
                : 'text-sm'
        }
      >
        {children ?? (isEmpty ? (empty ?? '—') : value)}
      </dd>
    </div>
  )
}
