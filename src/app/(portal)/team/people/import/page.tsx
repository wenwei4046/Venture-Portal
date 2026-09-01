import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import ImportStaffWizard from './_components/ImportStaffWizard'

export default async function ImportStaffPage() {
  await requirePermission('team')

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · IMPORT
          </div>
          <h1 className="page-title">Import Staff from InfoTech</h1>
        </div>
      </div>

      <ImportStaffWizard />
    </div>
  )
}
