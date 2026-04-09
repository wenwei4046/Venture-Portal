'use server'

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export interface GenerateInvoicesResult {
  generated: number
  skipped: number
  errors: string[]
  period: string
  mode_counts: Record<string, number>
}

// ─── Generate monthly invoices for a period (Finance) ────────────────────────

export async function generateMonthlyInvoices(
  formData: FormData
): Promise<GenerateInvoicesResult> {
  await requireRole(['finance'])
  const supabase = await createClient()

  const rawPeriod = (formData.get('period_month') as string) ?? ''
  if (!rawPeriod) throw new Error('Period month is required')

  const period = dayjs(rawPeriod).startOf('month').format('YYYY-MM-DD')

  const { data, error } = await supabase.rpc('generate_monthly_invoices', {
    p_period_month: period,
  })

  if (error) {
    // Surface common errors in a friendly shape
    if (error.message.includes('No HR cost submission')) {
      throw new Error(
        `No HR cost submission for ${dayjs(period).format('MMM YYYY')}. Ask HR to submit via /hr-costing before generating invoices.`
      )
    }
    throw new Error(`Failed to generate invoices: ${error.message}`)
  }

  // The RPC returns a JSONB object; coerce to our typed shape.
  const result = data as unknown as GenerateInvoicesResult

  revalidatePath('/billing')
  revalidatePath('/statements')
  revalidatePath('/dashboard')

  return {
    generated: Number(result.generated ?? 0),
    skipped: Number(result.skipped ?? 0),
    errors: Array.isArray(result.errors) ? result.errors.map(String) : [],
    period: String(result.period ?? period),
    mode_counts: (result.mode_counts ?? {}) as Record<string, number>,
  }
}
