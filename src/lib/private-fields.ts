import 'server-only'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import { shown, type SensitiveHolder } from '@/lib/sensitive'

// The way to the columns lib/private-columns.ts lists (2026-10-09, PR4): the
// database's readers, which hand a value to a holder of the tick and •••• to
// anybody else — and then the page's own view of the viewer once more, for
// the view-as switch the database cannot see.

export interface StaffPrivate {
  nric: string | null
  bank_account_no: string | null
  bank_account_no_2: string | null
}

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
interface RpcClient {
  rpc: (fn: string, args?: Record<string, unknown>) => Rows<unknown> & {
    order: (column: string) => { range: (from: number, to: number) => Rows<unknown> }
  }
}

function client(supabase: unknown): RpcClient {
  return supabase as RpcClient
}

/**
 * The NRIC and account numbers of these people (null: everybody the viewer
 * may read — the roster), as the viewer may see them. Rows the viewer may not
 * read at all are simply absent, exactly as their staff rows are.
 */
export async function readStaffPrivate(
  supabase: unknown,
  viewer: SensitiveHolder,
  ids: readonly string[] | null,
): Promise<Map<string, StaffPrivate>> {
  type Row = StaffPrivate & { id: string }
  const rows =
    ids === null
      ? await fetchAllRows<Row>(
          (from, to) => client(supabase).rpc('staff_private_fields', { p_staff_ids: null }).order('id').range(from, to) as Rows<Row>,
          'staff_private_fields',
        )
      : await fetchByKeys<Row, string>(
          [...new Set(ids)],
          chunk => client(supabase).rpc('staff_private_fields', { p_staff_ids: chunk }) as Rows<Row>,
          'staff_private_fields',
        )
  return new Map(
    rows.map(r => [
      r.id,
      {
        nric: shown(viewer, 'nric', r.nric),
        bank_account_no: shown(viewer, 'bank', r.bank_account_no),
        bank_account_no_2: shown(viewer, 'bank', r.bank_account_no_2),
      },
    ]),
  )
}

/** Directors' NRIC, as the viewer may see it. */
export async function readDirectorNric(
  supabase: unknown,
  viewer: SensitiveHolder,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  type Row = { id: string; nric: string | null }
  const rows = await fetchByKeys<Row, string>(
    [...new Set(ids)],
    chunk => client(supabase).rpc('director_private_fields', { p_director_ids: chunk }) as Rows<Row>,
    'director_private_fields',
  )
  return new Map(rows.map(r => [r.id, shown(viewer, 'nric', r.nric)]))
}

/** The account number each salary-PV line pays into, as the viewer may see it. */
export async function readPayrollLineAccounts(
  supabase: unknown,
  viewer: SensitiveHolder,
  lineIds: readonly string[],
): Promise<Map<string, string | null>> {
  type Row = { id: string; bank_account_no: string | null }
  const rows = await fetchByKeys<Row, string>(
    [...new Set(lineIds)],
    chunk => client(supabase).rpc('payroll_line_accounts', { p_line_ids: chunk }) as Rows<Row>,
    'payroll_line_accounts',
  )
  return new Map(rows.map(r => [r.id, shown(viewer, 'bank', r.bank_account_no)]))
}

/** `rows` with each one's account number put back from `accounts` (by line id). */
export function withLineAccounts<T extends { id: string }>(
  rows: readonly T[],
  accounts: ReadonlyMap<string, string | null>,
): Array<T & { bank_account_no: string | null }> {
  return rows.map(r => ({ ...r, bank_account_no: accounts.get(r.id) ?? null }))
}
