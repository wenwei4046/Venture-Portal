import { requireRole } from '@/lib/auth'
import CSVUpload from './_components/CSVUpload'

export default async function ReconciliationPage() {
  await requireRole(['principal', 'finance'])

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Bank Reconciliation</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Import bank statement CSV and compare against portal balances.
        </p>
      </div>

      <CSVUpload />
    </div>
  )
}
