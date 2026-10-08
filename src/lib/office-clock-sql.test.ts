import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The database's "today" is the office's (2026-10-09).
//
// The database keeps UTC and the office is UTC+8: a function that asked
// CURRENT_DATE, to_char(now(), …) or date_trunc('month', now()) for a day or a
// month answered in UTC, so from 00:00 to 08:00 in the office "today" was
// yesterday and on the 1st "this month" was last month — period locks,
// voucher and invoice numbers, dept-pool months, the dashboard. Migration
// 20261009000000 moved all 36 such functions onto
// (now() AT TIME ZONE 'Asia/Kuala_Lumpur'). A migration written after it may
// not bring the UTC calendar back.

// Vitest runs from the repository root.
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')
const SINCE = '20261009000000'

/** The SQL without its comments — a comment may name what it replaced. */
function code(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
}

const UTC_CALENDAR: Array<[string, RegExp]> = [
  ['CURRENT_DATE', /\bcurrent_date\b/i],
  ["to_char(now(), …)", /to_char\(\s*now\(\)\s*,/i],
  ["date_trunc('month', now())", /date_trunc\(\s*'month'\s*,\s*now\(\)\s*\)/i],
]

function utcCalendarUses(sql: string): string[] {
  const body = code(sql)
  return UTC_CALENDAR.filter(([, re]) => re.test(body)).map(([name]) => name)
}

describe('migrations ask the office for the day, not UTC', () => {
  it('finds the UTC calendar where it hides, and not in comments', () => {
    expect(utcCalendarUses("v_today DATE := CURRENT_DATE;")).toEqual(['CURRENT_DATE'])
    expect(utcCalendarUses("SELECT 'HV-PV-' || to_char(NOW(),'YYYYMM')")).toEqual(['to_char(now(), …)'])
    expect(utcCalendarUses("date_trunc('month', now())::date")).toEqual(["date_trunc('month', now())"])
    expect(utcCalendarUses("-- was CURRENT_DATE\nv_today := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;")).toEqual([])
    expect(utcCalendarUses("expires_at <= now() AND created_at > now() - interval '30 days'")).toEqual([])
  })

  it(`no migration after ${SINCE} reads the UTC calendar`, () => {
    const offenders = readdirSync(MIGRATIONS)
      .filter((file) => file.endsWith('.sql') && file.slice(0, 14) > SINCE)
      .flatMap((file) =>
        utcCalendarUses(readFileSync(join(MIGRATIONS, file), 'utf8')).map(
          (use) => `${file}: ${use} — use (now() AT TIME ZONE 'Asia/Kuala_Lumpur')`,
        ),
      )
    expect(offenders).toEqual([])
  })
})
