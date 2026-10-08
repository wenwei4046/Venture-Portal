import { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { officeDay, officeTime } from '@/lib/office-time'

/**
 * Check if a date falls within a locked period.
 * Throws an error if locked — call this at the top of Server Actions
 * that create financial transactions.
 *
 * A date column (`2026-03-15`) is its own month. A moment — `new Date()`,
 * "now" — is placed on the OFFICE's calendar: the server keeps UTC, and on
 * the 1st, until 08:00 in the office, UTC is still in last month, so the
 * check asked about the wrong month's lock (2026-10-08).
 */
export async function assertPeriodOpen(
  supabase: SupabaseClient,
  date: string | Date
): Promise<void> {
  const day = typeof date === 'string' ? officeDay(date) : officeTime(date)
  const periodMonth = day.startOf('month').format('YYYY-MM-DD')

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
