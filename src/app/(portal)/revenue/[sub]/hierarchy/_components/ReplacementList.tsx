'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Chip, Facts, GridHead, GridRow, GridTable, SecLabel, btn, hv } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { Chevron } from '@/components/hrv/icons'
import {
  SOURCE_WORDS,
  arrangementOf,
  dayLabel,
  historyOf,
  replacementList,
  replacementTitle,
  shortDay,
  statusOf,
  type SubDeptRequest,
} from '@/lib/commission/sales-group-requests'
import s from './sales-groups.module.css'

// Sales Groups › Replacement list (2026-10-10, the HR revamp): every
// replacement of the sub-department and where it stands. A row opens its
// drawer — the facts and the history — and Review opens it in Member
// services, where replacements are approved.

const COLS = 'minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1fr) 130px 170px 28px'

export default function ReplacementList({ rows, subDeptName }: { rows: SubDeptRequest[]; subDeptName: string }) {
  const list = replacementList(rows)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = list.find(r => r.id === openId) ?? null

  return (
    <section aria-label={`${subDeptName} replacement list`}>
      <GridTable label={`${subDeptName} replacement list`}>
        <GridHead cols={COLS} cells={['Replacement', 'Arrangement', 'Submitted by', 'Effective', 'Status', '']} />
        {list.map(r => {
          const st = statusOf(r.status)
          return (
            <GridRow key={r.id} cols={COLS} onClick={() => setOpenId(r.id)} selected={openId === r.id} title={`Open ${replacementTitle(r)}`}>
              <div role="cell" className={s.twoLine}>
                <div className={s.strong}>{replacementTitle(r)}</div>
                <div className={s.sub}>{r.requestNo ?? '—'}</div>
              </div>
              <span role="cell" className={s.cell10} style={{ fontSize: 12.5 }}>{arrangementOf(r)}</span>
              <span role="cell" className={s.cell10}>{r.submittedBy ?? '—'}</span>
              <span role="cell" className={`${s.cell10} ${hv.mono}`} style={{ fontSize: 12 }}>{dayLabel(r.effective)}</span>
              <span role="cell" className={s.cell10}>
                <Chip tone={st.tone}>{st.name}</Chip>
              </span>
              <span role="cell" className={hv.chev} aria-hidden="true">
                <Chevron right />
              </span>
            </GridRow>
          )
        })}
        {list.length === 0 ? <div className={s.listEmpty}>No replacements for {subDeptName}.</div> : null}
      </GridTable>
      <div className={s.hint}>Replacements are approved in Member services; this list shows each one and where it stands.</div>

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        width={420}
        head={
          open ? (
            <div>
              <div className={s.drawerTitle}>{replacementTitle(open)}</div>
              <div className={s.drawerMeta}>
                {open.requestNo ? <span className={hv.mono} style={{ fontSize: 11, color: 'rgb(var(--hv-brown))' }}>{open.requestNo}</span> : null}
                <Chip tone={statusOf(open.status).tone} style={{ fontSize: 10.5 }}>{statusOf(open.status).name}</Chip>
              </div>
            </div>
          ) : null
        }
        footer={
          open ? (
            <>
              <button type="button" className={btn('outline')} onClick={() => setOpenId(null)}>
                Close
              </button>
              <Link href={`/member-admin?request=${open.id}`} className={btn('dark')}>
                Review
              </Link>
            </>
          ) : null
        }
      >
        {open ? (
          <>
            <Facts
              rows={[
                { l: 'Original member', v: open.original ?? '—' },
                { l: 'Arrangement', v: arrangementOf(open) },
                {
                  l: 'Proposed replacement',
                  v: open.replacementSource === 'vacancy' || !open.newPerson ? SOURCE_WORDS.vacancy : open.newPerson,
                },
                { l: 'Effective date', v: dayLabel(open.effective) },
                ...(open.reason ? [{ l: 'Reason', v: open.reason }] : []),
                { l: 'Submitted by', v: open.submittedBy ?? '—' },
              ]}
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>History</SecLabel>
            <div>
              {historyOf(open.events).map((e, i) => (
                <div key={i} className={hv.trail}>
                  <div className={s.trailTop}>
                    <span className={s.strong}>{e.what}</span>
                    <span className={hv.mono} style={{ fontSize: 11, color: 'rgb(var(--hv-brown))' }}>{shortDay(e.at)}</span>
                  </div>
                  {e.by ? <div className={s.trailWho}>{e.by}</div> : null}
                  {e.note ? <div className={s.trailNote}>{e.note}</div> : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Drawer>
    </section>
  )
}
