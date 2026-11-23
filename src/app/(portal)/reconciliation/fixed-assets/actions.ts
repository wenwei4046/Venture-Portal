'use server'

import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { faDataOf, postRows, type StartRule } from '@/lib/fixed-assets'

// Fixed assets (2026-11-24 — the user: "这个我要自己能维护"): the classes and the register are Reconciliation · Edit,
// posting and undoing depreciation Reconciliation · Create — as a manual journal voucher. The database asks the same
// (mig 20261124100000).

const YM = /^\d{4}-\d{2}$/

export interface ClassInput {
  id?: string
  name: string
  lifeMonths: number
  residualPct: number
  startRule: StartRule
  assetAccount: string
  accumAccount: string
  expenseAccount: string
  isActive: boolean
}

export async function saveFaClass(input: ClassInput): Promise<void> {
  await requireActionOn('/reconciliation/fixed-assets', 'reconciliation', 'edit')
  if (!input.name.trim()) throw new Error('The class needs a name')
  if (!Number.isInteger(input.lifeMonths) || input.lifeMonths < 1) throw new Error('The life is a whole number of months')
  if (!(input.residualPct >= 0 && input.residualPct < 100)) throw new Error('The residual is 0 to under 100%')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fa_save_class' as never, {
    p: {
      id: input.id ?? null, name: input.name.trim(), life_months: input.lifeMonths, residual_pct: input.residualPct,
      start_rule: input.startRule, asset_account: input.assetAccount, accum_account: input.accumAccount,
      expense_account: input.expenseAccount, is_active: input.isActive,
    },
  } as never)
  if (error) throw new Error(error.message)
  revalidatePath('/reconciliation/fixed-assets')
}

export interface AssetInput {
  /** A kept asset's id; none for one not in the register yet. */
  id?: string
  name: string
  classId: string
  inServiceDate: string
  lifeMonths: number | null
  disposedOn: string | null
  notes: string | null
  lineIds: string[]
}

const assetPayload = (a: AssetInput) => ({
  id: a.id ?? null, name: a.name.trim(), class_id: a.classId, in_service_date: a.inServiceDate,
  life_months: a.lifeMonths, disposed_on: a.disposedOn || null, notes: a.notes, line_ids: a.lineIds,
})

export async function saveFaAsset(input: AssetInput): Promise<void> {
  await requireActionOn('/reconciliation/fixed-assets', 'reconciliation', 'edit')
  if (!input.name.trim()) throw new Error('The asset needs a name')
  if (input.lineIds.length === 0) throw new Error('An asset is made of at least one purchase line')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fa_save_asset' as never, { p: assetPayload(input) } as never)
  if (error) throw new Error(error.message)
  revalidatePath('/reconciliation/fixed-assets')
}

/**
 * Post the depreciation through a month: any asset not in the register yet is kept first, as the page shows it, then
 * every month not yet posted is — one entry a month (lib/fixed-assets › postRows).
 */
export async function postDepreciation(through: string): Promise<{ months: number }> {
  await requireActionOn('/reconciliation/fixed-assets', 'reconciliation', 'create')
  if (!YM.test(through) || through > officeMonth()) throw new Error('Pick a month up to this one')
  const supabase = await createClient()
  const read = async () => {
    const { data, error } = await supabase.rpc('fa_read' as never)
    if (error) throw new Error(error.message)
    return faDataOf(data)
  }
  let data = await read()
  const drafts = data.assets.filter((a) => a.draft)
  if (drafts.length > 0) {
    await requireActionOn('/reconciliation/fixed-assets', 'reconciliation', 'edit')
    for (const a of drafts) {
      const { error } = await supabase.rpc('fa_save_asset' as never, {
        p: assetPayload({ name: a.name, classId: a.classId, inServiceDate: a.inServiceDate, lifeMonths: null, disposedOn: null, notes: null, lineIds: a.lineIds }),
      } as never)
      if (error) throw new Error(error.message)
    }
    data = await read()
  }
  const rows = postRows(data, through)
  if (rows.length === 0) return { months: 0 }
  const { data: n, error } = await supabase.rpc('fa_post' as never, { p_rows: rows } as never)
  if (error) throw new Error(error.message)
  revalidatePath('/reconciliation/fixed-assets')
  return { months: Number(n ?? rows.length) }
}

/** Undo the posted depreciation from a month on — each entry reversed, so a changed class can be posted again. */
export async function undoDepreciation(from: string): Promise<{ entries: number }> {
  await requireActionOn('/reconciliation/fixed-assets', 'reconciliation', 'create')
  if (!YM.test(from)) throw new Error('Pick a month')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fa_undo_from' as never, { p_from: `${from}-01` } as never)
  if (error) throw new Error(error.message)
  revalidatePath('/reconciliation/fixed-assets')
  return { entries: Number(data ?? 0) }
}
