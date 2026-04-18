import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import ImportStaffWizard from './_components/ImportStaffWizard'

export default async function ImportStaffPage() {
  await requireRole(['principal', 'hr'])

  return (
    <div>
      <Link
        href="/hr-costing/staff"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff
      </Link>

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">Import Staff from InfoTech</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Upload the <em>Active, Newly Joined &amp; Resigned Employees List</em> xlsx export.
          Active + newly joined employees are imported; resigned rows are ignored.
        </p>
      </div>

      <ImportStaffWizard />
    </div>
  )
}
