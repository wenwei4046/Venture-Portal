'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { amendFundSource, amendFundSourceFrom } from '../../../actions'
import { amendFormData, draftOfForm, type AmendTerms } from '@/lib/fund-amend'

interface Props {
  id: string
  fromLabel: string
  ratePct: string
  lockInMonths: string
  repaymentDate: string
  compound: boolean
  notes: string
  /** Default 生效月 for the from-month mode (next month, 'YYYY-MM'). */
  nextMonth: string
  /** 'YYYY-MM' the current terms took effect, when they were changed before. */
  termsFrom?: string | null
  /** Treasury · Approve: the change applies now. Without it (Treasury · Edit) a from-month change is filed for the Principal. */
  direct?: boolean
}

// Two ways to change an active fund source (user 2026-09-21):
//   整条重算   the old amend — every month from day one reads the new terms
//              (a keying-error fix)
//   从某月起生效 months before the chosen one keep their old terms; from that
//              month the new rate / remaining months apply, re-based on the
//              principal still owed then (lib/treasury-terms)
export default function AmendFundSourceForm({
  id,
  fromLabel,
  ratePct,
  lockInMonths,
  repaymentDate,
  compound,
  notes,
  nextMonth,
  termsFrom,
  direct = true,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'from' | 'whole'>('from')
  const fromMode = mode === 'from'
  // 从某月起改成无固定期限 (user 2026-09-22): no monthly principal from X,
  // repayments in any size; the flat interest stays on the principal owed at X.
  const [noFixedTerm, setNoFixedTerm] = useState(false)
  // What the interest from X is on (2026-10-23 / 24): the principal owed at X, the original principal, or the base the terms before used — one of them.
  const [interestBasis, setInterestBasis] = useState<'owed' | 'original' | 'kept'>('owed')

  const field =
    'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-ink focus:outline-none focus:border-accent-border'
  // What the form opened with: only what is changed from it is sent (lib/fund-amend, 2026-10-16).
  const was: AmendTerms = { ratePct, months: lockInMonths, start: repaymentDate, compound, text: notes, termsFrom: termsFrom ?? null, nextMonth }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null)
          const sent = amendFormData('in', id, was, draftOfForm('in', fd, mode, was))
          const r = fromMode ? await amendFundSourceFrom(sent) : await amendFundSource(sent)
          if (r?.error) setError(r.error)
        })
      }
      className="bg-surface border border-hairline rounded-md p-8 max-w-2xl"
    >
      <input type="hidden" name="fund_source_id" value={id} />

      <div className="mb-6 border border-accent-border rounded-md bg-accent-bg p-4">
        <div className="font-serif italic text-accent text-sm">修改资金来源条款 · Amend fund source</div>
        <p className="font-serif text-sm text-graphite mt-1">
          来源:<span className="text-ink">{fromLabel}</span>。
          {direct ? '你是最高审批人,改动立即生效。' : '提交后等 Principal 在 Approvals 核准,核准后才生效;之前条件不变。'}
          {termsFrom ? <> 现行条件自 <span className="font-mono text-ink">{termsFrom}</span> 起生效。</> : null}
        </p>
      </div>

      <fieldset className="mb-6">
        <legend className="block text-sm font-sans font-medium text-graphite mb-2">生效方式</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`border rounded-md p-3 cursor-pointer ${fromMode ? 'border-accent bg-accent-bg/40' : 'border-hairline'}`}>
            <span className="flex items-center gap-2 text-sm font-sans text-ink">
              <input type="radio" name="mode" checked={fromMode} onChange={() => setMode('from')} className="accent-[var(--accent)]" />
              从某月起生效
            </span>
            <span className="block font-serif italic text-muted text-xs mt-1 ml-5">之前的月份照旧条件,生效月起用新的;利息按生效月初剩余本金算（也可以勾选按原本金算）。</span>
          </label>
          {/* The whole deal again is the Principal's own (a keying-error fix); a filed change is a from-month one. */}
          {direct ? (
            <label className={`border rounded-md p-3 cursor-pointer ${!fromMode ? 'border-accent bg-accent-bg/40' : 'border-hairline'}`}>
              <span className="flex items-center gap-2 text-sm font-sans text-ink">
                <input type="radio" name="mode" checked={!fromMode} onChange={() => setMode('whole')} className="accent-[var(--accent)]" />
                整条重算
              </span>
              <span className="block font-serif italic text-muted text-xs mt-1 ml-5">改错用 —— 从第一天起整条照新条件重算。</span>
            </label>
          ) : null}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        {fromMode ? (
          <div>
            <label htmlFor="effective_from" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              生效月 · Effective from
            </label>
            <input id="effective_from" name="effective_from" type="month" defaultValue={nextMonth} required className={field} />
            <p className="font-serif italic text-muted text-xs mt-1.5">要晚过现行条件的生效月;选过去的月份会按新条件重算那几个月的应付,已记录的还款不变。</p>
          </div>
        ) : null}
        <div>
          <label htmlFor="cost_rate_percent" className="block text-sm font-sans font-medium text-graphite mb-1.5">
            利率 · Rate (%/月)
          </label>
          <input id="cost_rate_percent" name="cost_rate_percent" type="number" step="0.001" min="0" defaultValue={ratePct} className={field} />
        </div>
        {fromMode ? (
          <div>
            <label htmlFor="remaining_months" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              剩余期数 · Remaining months <span className="text-muted font-normal">— 留空 = 到期月不变</span>
            </label>
            <input id="remaining_months" name="remaining_months" type="number" step="1" min="1" max="120" className={field} disabled={noFixedTerm} />
            <p className="font-serif italic text-muted text-xs mt-1.5">从生效月起数。每月本金 = 生效月初剩余本金 ÷ 剩余期数。</p>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input id="no_fixed_term" name="no_fixed_term" type="checkbox" checked={noFixedTerm} onChange={(e) => setNoFixedTerm(e.target.checked)} className="h-4 w-4 mt-0.5 accent-[var(--accent)]" />
              <span className="text-sm font-sans text-graphite">
                改成无固定期限
                <span className="block font-serif italic text-muted text-xs mt-0.5">生效月起没有每月应还本金，想还多少还多少；利息照生效月初剩余本金 × 利率算，不随本金减少。</span>
              </span>
            </label>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input id="interest_on_original" name="interest_on_original" type="checkbox" checked={interestBasis === 'original'} onChange={(e) => setInterestBasis(e.target.checked ? 'original' : 'owed')} className="h-4 w-4 mt-0.5 accent-[var(--accent)]" />
              <span className="text-sm font-sans text-graphite">
                利息按原本金算
                <span className="block font-serif italic text-muted text-xs mt-0.5">生效月起的利息 = 原本金 × 新利率，不按生效月初剩余本金算；每月本金照旧 = 剩余本金 ÷ 剩余期数。</span>
              </span>
            </label>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input id="interest_keeps_base" name="interest_keeps_base" type="checkbox" checked={interestBasis === 'kept'} onChange={(e) => setInterestBasis(e.target.checked ? 'kept' : 'owed')} className="h-4 w-4 mt-0.5 accent-[var(--accent)]" />
              <span className="text-sm font-sans text-graphite">
                利息照之前的本金算
                <span className="block font-serif italic text-muted text-xs mt-0.5">生效月起的利息 = 之前算利息用的本金 × 新利率，不按生效月初剩余本金算，之后还了本金也不变（例如 1 月起按 51,000 算，10 月改无固定期限后照样按 51,000）。</span>
              </span>
            </label>
          </div>
        ) : (
          <div>
            <label htmlFor="lock_in_months" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              期数 · Periods (月) <span className="text-muted font-normal">— 留空 = 无固定期限</span>
            </label>
            <input id="lock_in_months" name="lock_in_months" type="number" step="1" min="1" max="120" defaultValue={lockInMonths} className={field} />
          </div>
        )}
        {fromMode ? null : (
          <div>
            <label htmlFor="repayment_date" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              还款起始日 · Repayment start
            </label>
            <input id="repayment_date" name="repayment_date" type="date" defaultValue={repaymentDate} className={field} />
            <p className="font-serif italic text-muted text-xs mt-1.5">利滚利从这个月开始滚。</p>
          </div>
        )}
        <div className="flex items-center gap-2 pt-7">
          <input id="compound_interest" name="compound_interest" type="checkbox" defaultChecked={compound} className="h-4 w-4 accent-[var(--accent)]" />
          <label htmlFor="compound_interest" className="text-sm font-sans text-graphite">利滚利 · Compound interest</label>
        </div>
      </div>

      <div className="mb-6">
        {fromMode ? (
          <>
            <label htmlFor="reason" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              原因 · Reason
            </label>
            <input id="reason" name="reason" type="text" className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border" placeholder="例如:重新谈利率 / 延长期数" />
          </>
        ) : (
          <>
            <label htmlFor="notes" className="block text-sm font-sans font-medium text-graphite mb-1.5">
              备注 · Notes
            </label>
            <textarea id="notes" name="notes" rows={2} defaultValue={notes} className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border" />
          </>
        )}
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-6 text-sm font-sans">{error}</div>
      ) : null}

      <div className="flex items-center gap-4 pt-4 border-t border-hairline">
        <button
          type="submit" disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? (direct ? '保存中…' : '提交中…') : !direct ? '提交给 Principal 核准 · Submit' : fromMode ? '从生效月起套用 · Apply' : '保存修改 · Save'}
        </button>
        <Link href={`/fund-in/${id}`} className="text-sm text-graphite hover:text-ink font-sans transition-colors">Cancel</Link>
      </div>
    </form>
  )
}
