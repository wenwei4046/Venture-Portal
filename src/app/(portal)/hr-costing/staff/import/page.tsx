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

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · STAFF · IMPORT
          </div>
          <h1 className="page-title">Import Staff from InfoTech</h1>
        </div>
      </div>

      <ImportStaffWizard />
    </div>
  )
}
