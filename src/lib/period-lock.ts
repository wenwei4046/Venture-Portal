import { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'

/**
 * Check if a date falls within a locked period.
 * Throws an error if locked — call this at the top of Server Actions
 * that create financial transactions.
 */
export async function assertPeriodOpen(
  supabase: SupabaseClient,
  date: string | Date
): Promise<void> {
  const periodMonth = dayjs(date).startOf('month').format('YYYY-MM-DD')

  const { data } = await supabase
    .from('period_locks')
    .select('id')
    .eq('period_month', periodMonth)
    .eq('is_locked', true)
    .maybeSingle()

  if (data) {
    throw new Error(
      `Period ${dayjs(periodMonth).format('MMM YYYY')} is closed. Contact Principal to reopen.`
    )
  }
}
