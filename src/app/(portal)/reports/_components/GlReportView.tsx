'use client'

// Shared renderer for the GL-driven statements (P&L / Balance Sheet / Cash
// Flow / Receipt & Payment), as the Finance revamp handoff draws them
// (2026-10-10, rptSection): the control row — the month "vs" a month to
// compare, or As at for a balance — over the reports' sheet, opened at L3. A
// balance neither compares nor drills; a month's items open onto their journal
// lines. (The left rail and its ledger table went with the Dept Manager's view,
// 2026-10-17.)

import type { ReportBlock } from '@/lib/gl-report-blocks'
import { sheetFromBlocks } from '@/lib/report-sheet'
import { toChoices } from '@/lib/report-range'
import { officeMonth } from '@/lib/office-time'
import { ReportSearchProvider } from './ReportSearchProvider'
import ReportToolbar from './ReportToolbar'
import SheetReport from './SheetReport'

export type { ReportBlock }

export interface GlReportViewProps {
  period: string // 'YYYY-MM'
  /** 'YYYY-MM' or '' — comparison is OPT-IN (default single-month view). */
  compare: string
  segment: string // '' = all
  segments: { value: string; label: string; dot?: string }[]
  blocks: ReportBlock[]
  /** When set, each figure carries its % of this base (the P&L's revenue,
   *  Receipt & Payment's receipts). */
  pctBase?: { current: number; previous: number }
  /** Column header labels, e.g. "Jun 2026" / "May 2026" or "As at 30 Jun". */
  currentLabel: string
  compareLabel: string
  /** The period control's name — "As at" on the Balance Sheet. */
  periodLabel?: string
}

export default function GlReportView({
  period,
  compare,
  segment,
  segments,
  blocks,
  pctBase,
  currentLabel,
  compareLabel,
  periodLabel = 'Period',
}: GlReportViewProps) {
  const asAt = periodLabel === 'As at'
  const cmp = !asAt && compare !== ''
  return (
    <ReportSearchProvider level={3}>
      <ReportToolbar
        mode={asAt ? 'asat' : 'single'}
        period={period}
        compare={cmp ? compare : ''}
        monthOptions={toChoices(officeMonth())}
        segment={segment}
        segments={segments}
      />
      <SheetReport
        columns={[
          { key: 'cur', label: currentLabel, tone: 'now' },
          ...(cmp ? [{ key: 'cmp', label: `${compareLabel} · compare` }] : []),
        ]}
        rows={sheetFromBlocks(blocks, cmp)}
        pctBase={pctBase ? (cmp ? [pctBase.current, pctBase.previous] : [pctBase.current]) : undefined}
        drill={!asAt}
        drillMonth={asAt ? undefined : period}
      />
    </ReportSearchProvider>
  )
}
