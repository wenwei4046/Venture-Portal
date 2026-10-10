'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { hiringFileLink, setCandidateStage } from '@/lib/hiring/actions'
import { STAGE, STAGE_ORDER, candidateInfo, candidateMeta, initials } from '@/lib/hiring/view'
import type { HiringBoard, HiringCandidate, HiringRequest } from '@/lib/hiring/types'
import { STAGE_COLOURS, StageChip } from './bits'
import CandidateWindow from './CandidateWindow'
import CandidateFieldsWindow from './CandidateFieldsWindow'
import ResumeDrawer from './ResumeDrawer'
import { MoveToTalentWindow, PickTalentWindow } from './TalentWindows'
import s from './hiring.module.css'

/**
 * A request's Candidates card (README §11): "Candidates · N", + (New
 * candidate · Pick from Talent Bank) and ⋯ (Candidate fields); a row per
 * candidate in their stage's colour — initials, name and stage, source and
 * phone, the candidate fields as pills, the note on an orange rule; the
 * résumé button and ⋯: Edit details · Change status ▸ · Download résumé ·
 * Move to Talent Bank… / Open in Talent Bank.
 */
export default function Candidates({
  board,
  request: r,
  can,
  talentPage,
}: {
  board: HiringBoard
  request: HiringRequest
  can: { create: boolean; edit: boolean; approve: boolean }
  talentPage: boolean
}) {
  const router = useRouter()
  const [addMenu, setAddMenu] = useState(false)
  const [menu, setMenu] = useState<{ id: string; status: boolean } | null>(null)
  const [form, setForm] = useState<{ mode: 'add' } | { mode: 'edit'; candidate: HiringCandidate } | null>(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [cv, setCv] = useState<HiringCandidate | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [toBank, setToBank] = useState<HiringCandidate | null>(null)
  const [, start] = useTransition()

  const stage = (c: HiringCandidate, v: HiringCandidate['stage']) => {
    setMenu(null)
    if (v === c.stage) return
    start(async () => {
      const out = await setCandidateStage(c.id, v)
      flash(out.ok ? `${c.name} → ${STAGE[v].label}` : out.reason)
    })
  }
  const download = (c: HiringCandidate) => {
    setMenu(null)
    start(async () => {
      const out = await hiringFileLink('candidate', c.id, true)
      if (!out.ok) return flash(out.reason)
      window.location.assign(out.url)
    })
  }

  return (
    <section className={`${s.card} ${s.candsCard}`} aria-label="Candidates">
      <div className={s.candsHead}>
        <span className={s.secLabel}>Candidates · {r.candidates.length}</span>
        <span className={s.grow} />
        {can.create ? (
          <div className={s.rel}>
            <button type="button" className={`${s.sq} ${s.sqAdd}`} title="Add a candidate" aria-label="Add a candidate" aria-expanded={addMenu} onClick={() => setAddMenu(o => !o)}>
              +
            </button>
            {addMenu ? (
              <>
                <div className={s.menuCatch} onClick={() => setAddMenu(false)} aria-hidden="true" />
                <div className={s.menu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={s.menuItem}
                    onClick={() => {
                      setAddMenu(false)
                      setForm({ mode: 'add' })
                    }}
                  >
                    <span className={s.menuIconWide}>＋</span>New candidate
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={s.menuItem}
                    onClick={() => {
                      setAddMenu(false)
                      setPickOpen(true)
                    }}
                  >
                    <span className={s.menuIconWide}>⇣</span>Pick from Talent Bank
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        {can.edit ? (
          <button type="button" className={s.sq} title="Candidate fields" aria-label="Candidate fields" onClick={() => setFieldsOpen(true)}>
            ⋯
          </button>
        ) : null}
      </div>

      {r.candidates.map(c => {
        const col = STAGE_COLOURS[c.stage]
        const info = candidateInfo(c, board.candidateFields)
        const open = menu?.id === c.id
        return (
          <div key={c.id} className={s.cand} style={{ borderLeftColor: col.fg }}>
            <span className={s.candIni} style={{ background: col.bg, color: col.fg }} aria-hidden="true">
              {initials(c.name)}
            </span>
            <div className={s.candBody}>
              <div className={s.candTop}>
                <span className={s.candName}>{c.name}</span>
                <StageChip stage={c.stage} />
              </div>
              <div className={s.candMeta}>{candidateMeta(c)}</div>
              {info.length ? (
                <div className={s.infoPills}>
                  {info.map(i => (
                    <span key={i.label} className={s.infoPill}>
                      <span className={s.infoPillLabel}>{i.label}</span> {i.value}
                    </span>
                  ))}
                </div>
              ) : null}
              {c.note ? <div className={s.candNote}>{c.note}</div> : null}
            </div>
            <div className={s.candSide}>
              {c.resumeName ? (
                <button type="button" className={s.sq} title="View résumé" aria-label={`View ${c.name}'s résumé`} onClick={() => setCv(c)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 3v5h5M9 13h6M9 17h4" />
                  </svg>
                </button>
              ) : null}
              <button type="button" className={s.sq} title="More" aria-label={`More for ${c.name}`} aria-expanded={open} onClick={() => setMenu(open ? null : { id: c.id, status: false })}>
                ⋯
              </button>
              {open ? (
                <>
                  <div className={s.menuCatch} onClick={() => setMenu(null)} aria-hidden="true" />
                  <div className={s.menu} role="menu">
                    {can.edit ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={s.menuItem}
                        onClick={() => {
                          setMenu(null)
                          setForm({ mode: 'edit', candidate: c })
                        }}
                      >
                        <span className={s.menuIcon}>✎</span>Edit details
                      </button>
                    ) : null}
                    {can.edit ? (
                      <button type="button" role="menuitem" className={s.menuItem} aria-expanded={menu?.status} onClick={() => setMenu({ id: c.id, status: !menu?.status })}>
                        <span className={s.menuIcon}>◐</span>
                        <span className={s.grow}>Change status</span>
                        <span className={s.menuArrow}>{menu?.status ? '▾' : '▸'}</span>
                      </button>
                    ) : null}
                    {menu?.status ? (
                      <div className={s.statusList} style={{ animation: 'none' }}>
                        {STAGE_ORDER.map(v => (
                          <button key={v} type="button" role="menuitemradio" aria-checked={c.stage === v} className={s.statusItem} style={{ fontWeight: c.stage === v ? 600 : 400 }} onClick={() => stage(c, v)}>
                            <span className={s.statusDot} style={{ background: STAGE_COLOURS[v].fg }} aria-hidden="true" />
                            {STAGE[v].label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {c.resumeName ? (
                      <button type="button" role="menuitem" className={s.menuItem} onClick={() => download(c)}>
                        <span className={s.menuIcon}>↓</span>Download résumé
                      </button>
                    ) : null}
                    <span className={s.menuRule} aria-hidden="true" />
                    {!c.talentId && can.create ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={s.menuItem}
                        onClick={() => {
                          setMenu(null)
                          setToBank(c)
                        }}
                      >
                        <span className={s.menuIcon}>☆</span>Move to Talent Bank…
                      </button>
                    ) : null}
                    {c.talentId && talentPage ? (
                      <button type="button" role="menuitem" className={s.menuItem} data-tone="ledger" onClick={() => router.push(`/hiring/talent/${c.talentId}`)}>
                        <span className={s.menuIcon}>★</span>Open in Talent Bank
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )
      })}
      {r.candidates.length === 0 ? <div className={s.noCands}>No candidates yet. Add one or pick from the Talent Bank.</div> : null}

      <CandidateWindow
        board={board}
        request={r}
        state={form}
        onClose={() => setForm(null)}
        onFields={() => setFieldsOpen(true)}
      />
      <CandidateFieldsWindow board={board} open={fieldsOpen} onClose={() => setFieldsOpen(false)} />
      <ResumeDrawer request={r} candidate={cv} onClose={() => setCv(null)} />
      <PickTalentWindow board={board} request={r} open={pickOpen} onClose={() => setPickOpen(false)} />
      <MoveToTalentWindow board={board} request={r} candidate={toBank} onClose={() => setToBank(null)} />
    </section>
  )
}
