// One bank-month reconciliation session: matched pairs, unmatched statement
// lines vs unmatched book lines (manual pairing — 对不上就问我), ignored rows.

import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ReconReview from './_components/ReconReview'
import { readReconSession } from '../_lib/recon-read'

export const dynamic = 'force-dynamic'

export default async function ReconSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  await requirePage('/reconciliation/[sessionId]')
  await requirePermission('reconciliation')
  const { sessionId } = await params
  const supabase = (await createClient()) as unknown as SupabaseClient

  // The session, its lines, groups and the books — as the Finance phone app reads them (`_lib/recon-read`).
  const read = await readReconSession(supabase, sessionId)
  if (!read) notFound()
  const { session, bank, statementLines, groups, contraGroups, statementContraGroups, unmatchedBook, bookInfo, glClosing } = read

  return (
    <div>
      <Link
        href="/reconciliation"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Bank Reconciliation
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · RECONCILIATION · {dayjs(session.period_month).format('MMMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">{bank.bank_name}</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {session.source_filename ?? ''} · statement vs GL {bank.gl_account_code}
          </p>
        </div>
        <Link
          href={`/reconciliation/${sessionId}/report`}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          Reconciliation Report →
        </Link>
      </div>

      <ReconReview
        sessionId={sessionId}
        periodMonth={session.period_month}
        statementLines={statementLines}
        groups={groups}
        contraGroups={contraGroups}
        statementContraGroups={statementContraGroups}
        unmatchedBook={unmatchedBook}
        bookInfo={bookInfo}
        statementOpening={session.statement_opening}
        statementClosing={session.statement_closing}
        glClosing={glClosing}
      />
    </div>
  )
}
