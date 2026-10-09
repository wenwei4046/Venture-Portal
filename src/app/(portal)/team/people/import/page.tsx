import Link from 'next/link'
import { requireAction } from '@/lib/auth'
import { sees } from '@/lib/sensitive'
import ImportStaffWizard from './_components/ImportStaffWizard'

export default async function ImportStaffPage() {
  const viewer = await requireAction('team', 'create')
  // The file carries NRICs, account numbers and pay, and the import writes
  // them as they are (2026-10-09, PR4): all three ticks, or no import.
  const allowed = sees(viewer, 'nric') && sees(viewer, 'bank') && sees(viewer, 'salary')

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

      {allowed ? (
        <ImportStaffWizard />
      ) : (
        <p className="sheet-warning mt-0">
          The InfoTech file carries every person&rsquo;s NRIC, bank account and pay, and the import writes them as they
          are — it needs Salary amounts, NRIC / IC and Bank accounts all ticked for your title.
        </p>
      )}
    </div>
  )
}
