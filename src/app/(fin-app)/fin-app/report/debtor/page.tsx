import { requirePage } from '@/lib/auth'
import { ComingHub } from '@/components/fin-app/ComingScreen'

/** A hub's place in the Finance app's report tab, asked as its portal page is — drawn in a later part. */
export default async function Page() {
  await requirePage('/reports/debtor-aging')
  return <ComingHub hub="debtor" tab="report" />
}
