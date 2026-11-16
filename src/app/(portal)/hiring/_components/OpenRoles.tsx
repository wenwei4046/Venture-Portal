'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OpenRole } from '@/lib/hiring/insights'
import { StageChip, StatusChip } from './bits'
import s from './hiring.module.css'

/**
 * Hiring › Insights › Open roles (2026-11-16, the user: "我想看到 ongoing 正在招的人的 status，还有现阶段到底有什么职位在招人，
 * 能及时展开看 . 明明在listing 已经有了"): every request open today, whatever the period above it says — its owner, where
 * its candidates stand, how many are hired of its headcount, how long it has been open, its status. A row opens in place
 * onto its facts, each candidate at their stage and its newest step; View full goes to its page.
 */
export default function OpenRoles({ roles, asOf }: { roles: readonly OpenRole[]; asOf: string }) {
  const router = useRouter()
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string) =>
    setShown(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className={s.insSec} aria-label="Open roles">
      <div className={s.insSecHead}>
        <span className={s.insSecTitle}>
          Open roles <span className={s.orCount}>{roles.length}</span>
        </span>
        <span className={s.insSecNote}>As of {asOf}</span>
      </div>
      {roles.length ? (
        <div className={s.orTable}>
          <div className={`${s.orHead} ${s.orCols}`} aria-hidden="true">
            <span />
            <span>Position</span>
            <span>Owner (HR)</span>
            <span>Candidates</span>
            <span className={s.r}>Hired</span>
            <span className={s.r}>Open for</span>
            <span>Status</span>
          </div>
          <ul className={s.orList}>
            {roles.map(r => {
              const open = shown.has(r.id)
              const more = `open-role-${r.id}`
              return (
                <li key={r.id} className={s.orItem} data-open={open ? 'true' : undefined}>
                  <button type="button" className={`${s.orRow} ${s.orCols}`} aria-expanded={open} aria-controls={more} onClick={() => toggle(r.id)}>
                    <span className={s.orCaret} aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                    <span className={s.orPos}>
                      <span className={s.everyPos}>{r.position}</span>
                      <span className={s.everySub}>{r.where}</span>
                    </span>
                    <span className={`${s.orOwner} ${r.ownerSet ? s.cellOwner : s.waiting}`}>{r.owner}</span>
                    <span className={s.orStages}>
                      {r.stages.length ? r.stages.map(x => <StageChip key={x.stage} stage={x.stage} n={x.n} />) : <span className={s.orNone}>No candidates yet</span>}
                    </span>
                    <span className={`${s.orHired} ${s.r} ${s.monoCell}`} data-all={r.hiredAll ? 'true' : undefined}>
                      <span className={s.orCellLabel}>Hired </span>
                      {r.hired}
                    </span>
                    <span className={`${s.orDays} ${s.r} ${s.monoCell}`}>
                      <span className={s.orCellLabel}>Open </span>
                      {r.openFor}
                    </span>
                    <span className={s.orStatus}>
                      <StatusChip status={r.status} />
                    </span>
                  </button>
                  {open ? (
                    <div id={more} className={s.orMore} role="region" aria-label={`${r.id} · ${r.position}`}>
                      <div className={s.orFacts}>
                        {r.facts.map(f => (
                          <div key={f.label}>
                            <div className={s.orFactLabel}>{f.label}</div>
                            <div className={s.orFactValue}>{f.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className={s.secLabel}>Candidates · {r.candidates.length}</div>
                      {r.candidates.length ? (
                        <div className={s.orCands}>
                          {r.candidates.map(c => (
                            <div key={c.id} className={s.orCand} data-out={c.stage === 'rejected' ? 'true' : undefined}>
                              <span className={s.orCandName}>{c.name}</span>
                              <span>
                                <StageChip stage={c.stage} />
                              </span>
                              <span className={s.orCandMore}>
                                {c.why ? <span className={s.candWhy}>{c.why}</span> : null}
                                {c.meta ? <span className={s.candMeta}>{c.meta}</span> : null}
                                {c.info.map(i => (
                                  <span key={i.label} className={s.infoPill}>
                                    <span className={s.infoPillLabel}>{i.label} </span>
                                    {i.value}
                                  </span>
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={s.noCands}>No candidates yet</div>
                      )}
                      <div className={s.orFoot}>
                        {r.latest ? (
                          <span className={s.orLatest}>
                            <span className={s.secLabel}>Latest</span>
                            <span className={s.orLatestWhat}>{r.latest.what}</span>
                            <span className={s.orLatestWhen}>
                              {r.latest.when}
                              {r.latest.who ? ' · ' + r.latest.who : ''}
                            </span>
                            {r.latest.note ? <span className={s.orLatestNote}>{r.latest.note}</span> : null}
                          </span>
                        ) : (
                          <span className={s.grow} />
                        )}
                        <button type="button" className={s.btnPlain} onClick={() => router.push(`/hiring/requests/${encodeURIComponent(r.id)}`)}>
                          View full →
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className={s.insEmpty}>No open roles</div>
      )}
    </section>
  )
}
