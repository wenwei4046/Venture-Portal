import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { exportXlsxResponse } from '@/lib/export/response'
import { officeToday } from '@/lib/office-time'
import { ventureRefLabel } from '@/lib/venture-pool'

// The Venture Pool's Export (2026-10-09, the user's Claude Design handoff):
// the whole pool ledger — every corporate / treasury journal line on an HV
// bank account, reversal pairs left out as on the page — oldest first, with
// In / Out and the running balance after each line.

export const dynamic = 'force-dynamic'

type Line = {
  id: string
  debit: number | null
  credit: number | null
  description: string | null
  journal_entries: { transaction_date: string; description: string | null; reference_type: string | null }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET(): Promise<Response> {
  await requirePermission('venture_pool')
  const supabase = await createClient()

  const { data: banks } = await supabase.from('bank_accounts').select('gl_account_code').eq('status', 'active')
  const codes = (banks ?? []).map((b) => b.gl_account_code as string).filter(Boolean)
  const lines =
    codes.length === 0
      ? []
      : ((await fetchAllRows((lo, hi) =>
          supabase
            .from('journal_lines')
            .select('id, debit, credit, description, journal_entries!inner(transaction_date, description, reference_type, segment, is_reversed)')
            .in('account_code', codes)
            .in('journal_entries.segment', ['corporate', 'treasury'])
            .eq('journal_entries.is_reversed', false)
            .order('id', { ascending: true })
            .range(lo, hi),
        )) as unknown as Line[])

  const ordered = [...lines].sort(
    (a, b) => a.journal_entries.transaction_date.localeCompare(b.journal_entries.transaction_date) || String(a.id).localeCompare(String(b.id)),
  )
  let balance = 0
  const rows = ordered.map((l) => {
    const dr = Number(l.debit ?? 0)
    const cr = Number(l.credit ?? 0)
    balance = r2(balance + dr - cr)
    return [
      l.journal_entries.transaction_date.slice(0, 10),
      ventureRefLabel(l.journal_entries.reference_type),
      dr > 0 ? 'in' : 'out',
      l.description ?? l.journal_entries.description ?? '',
      dr > 0 ? dr : null,
      cr > 0 ? cr : null,
      balance,
    ]
  })

  return exportXlsxResponse({
    filename: `venture-pool-ledger-${officeToday()}`,
    buffer: buildXlsxBuffer({
      sheetName: 'Venture Pool',
      headerRow: ['Date', 'Type', 'Direction', 'Description', 'In', 'Out', 'Balance'],
      rows,
      columnWidths: [12, 22, 10, 52, 16, 16, 18],
    }),
  })
}
