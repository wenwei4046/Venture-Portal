import Link from 'next/link'
import { requireAction } from '@/lib/auth'
import ImportStaffWizard from './_components/ImportStaffWizard'

export default async function ImportStaffPage() {
  await requireAction('team', 'create')

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm hover:text-accent transition-colors"
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
