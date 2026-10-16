import React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountUser } from '@/lib/auth'
import { PdfDocument, PdfSectionHead, PdfTable, renderPdfBuffer } from '@/lib/export/pdf'
import { slipFile, slipLines, slipNote, slipSub, slipTitle } from '@/lib/me/pay'
import { meRecordOf, payslipsOf } from '@/lib/me/parse'
import { createClient } from '@/lib/supabase/server'
import { viewingAsSomebody } from '@/lib/view-as-person'

/**
 * GET /my-payslip/2026-09-01 — Me › Payslip › Download PDF (2026-10-17): one's own paid payslip, in the portal's PDF
 * house style. A read-only file download (CLAUDE.md › Coding Conventions): it reads under the caller's own session —
 * `my_payslips()` and `my_record()` answer for `auth.uid()`'s People record only (mig 20261017100000) — and writes
 * nothing. Never while viewing as somebody. The PDF library stays on the server.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

export async function GET(_request: Request, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  if (!/^\d{4}-\d{2}-01$/.test(month)) return deny(400, 'That month could not be read.')
  const user = await getAccountUser()
  if (!user?.is_active) return deny(401, 'Sign in first.')
  if (await viewingAsSomebody()) return deny(403, 'Your own payslip is not shown while viewing as somebody.')

  const supabase = (await createClient()) as unknown as SupabaseClient
  const [slips, record] = await Promise.all([supabase.rpc('my_payslips'), supabase.rpc('my_record')])
  if (slips.error) return deny(500, 'Your payslip could not be read. Please try again.')
  const slip = payslipsOf(slips.data).find(p => p.month === month)
  if (!slip) return deny(404, 'No paid payslip for that month.')
  const me = record.error ? null : meRecordOf(record.data)

  const lines = slipLines(slip)
  const doc = (
    <PdfDocument title={`Payslip · ${slipTitle(slip)}`} subtitle={[me?.name, me?.code, me?.department, slipSub(slip)].filter(Boolean).join(' · ')} periodLabel={slipTitle(slip)}>
      <PdfSectionHead label="Pay" />
      <PdfTable
        columns={[{ label: 'Item', width: 380 }, { label: 'Amount', width: 140, align: 'right' }]}
        // The PDF's built-in Helvetica has no U+2212: a deduction prints with the hyphen-minus.
        rows={lines.map(l => [l.label, l.value ? l.value.replace('−', '-') : null])}
        rowKinds={lines.map(l => (l.kind === 'band' ? 'section' : l.kind === 'total' || l.kind === 'net' ? 'total' : 'detail'))}
      />
      <PdfSectionHead label="Note" />
      <PdfTable columns={[{ label: '', width: 520 }]} rows={[[slipNote(slip)]]} rowKinds={['detail']} />
    </PdfDocument>
  )
  const body = await renderPdfBuffer(doc)
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${slipFile(slip)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
