/**
 * Where a month's salary preview reads its people from (2026-11-10).
 *
 * A computed run lists everybody it paid, so its statements say who is in the
 * month. But the FIRST salesperson closed in a month opens a run of its own —
 * `comm_month_run_for_releases` makes an empty `draft` to hang the close's
 * released bills on — and that run holds no statement. Read as "the run",
 * nobody was in it: on 10 Nov, closing YUNY in October Fair blanked every
 * Salary calculation on the month (*Payroll inputs are not set for this
 * person.*). A run with no statements says nothing about who is in the month,
 * so the preview reads it as it reads no run at all: each person's payroll
 * inputs, as before the close.
 */
export type PayPreviewSource = 'run' | 'before_run' | 'none'

export function payPreviewSource(
  run: { id: string } | null,
  statementCount: number,
  allowWithoutRun: boolean,
): PayPreviewSource {
  if (run && statementCount > 0) return 'run'
  return allowWithoutRun ? 'before_run' : run ? 'run' : 'none'
}
