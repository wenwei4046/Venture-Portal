import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { FIRST_FY, fyEndOf, fyStartOf } from '@/lib/fiscal-year'
import { faDataOf } from '@/lib/fixed-assets'
import ReturnLink from '@/components/layout/ReturnLink'
import FixedAssetsView, { type AccountChoice } from './_components/FixedAssetsView'

// Fixed assets and their depreciation (2026-11-24 — the user: "能做一个折旧表在系统吗？" … "这个我要自己能维护"):
// the classes Finance keeps, the register made of the purchases on the accounts they depreciate, the schedule by
// financial year, and the month-end posting. The figures: lib/fixed-assets.

interface Props {
  searchParams: Promise<{ fy?: string; view?: string }>
}

export default async function FixedAssetsPage({ searchParams }: Props) {
  await requirePage('/reconciliation/fixed-assets')
  const user = await requirePermission('reconciliation')
  const canEdit = canDo(user, 'reconciliation', 'edit')
  const canPost = canDo(user, 'reconciliation', 'create')
  const supabase = await createClient()

  const [{ data: raw, error }, { data: coa }] = await Promise.all([
    supabase.rpc('fa_read' as never),
    supabase.from('chart_of_accounts').select('code, name, type, parent_code').eq('is_active', true).in('type', ['fixed_asset', 'expense', 'cost']),
  ])
  if (error) throw new Error(error.message)
  const data = faDataOf(raw)

  const params = await searchParams
  const now = officeMonth()
  const fy = /^\d{4}-\d{2}$/.test(params.fy ?? '') ? fyStartOf(params.fy!) : fyStartOf(now)
  // Every financial year from the first to this one.
  const years: string[] = []
  for (let y: string = FIRST_FY.from; y <= now; y = nextYear(y)) years.push(y)

  const rows = (coa ?? []) as Array<{ code: string; name: string; type: string; parent_code: string | null }>
  const headers = new Set(rows.map((r) => r.parent_code).filter(Boolean))
  const accounts: AccountChoice[] = rows
    .filter((r) => !headers.has(r.code))
    .map((r): AccountChoice => ({ code: r.code, name: r.name, kind: r.type === 'fixed_asset' ? 'fixed_asset' : 'expense' }))
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href="/reconciliation" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Reconciliation
        </ReturnLink>
      </div>
      <FixedAssetsView
        data={data}
        accounts={accounts}
        fy={{ from: fy, to: fyEndOf(fy) }}
        years={years.map((y) => ({ from: y, to: fyEndOf(y) }))}
        now={now}
        view={params.view === 'schedule' || params.view === 'classes' ? params.view : 'register'}
        canEdit={canEdit}
        canPost={canPost}
      />
    </div>
  )
}

function nextYear(fyFrom: string): string {
  const end = fyEndOf(fyFrom)
  const [y, m] = end.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
