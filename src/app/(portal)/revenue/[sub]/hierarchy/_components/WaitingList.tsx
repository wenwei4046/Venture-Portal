'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Facts, GridHead, GridRow, GridTable, HistoryEvent, SecLabel, btn, hv } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { Chevron } from '@/components/hrv/icons'
import { dayLabel, historyOf, shortDay, waitingList, type SubDeptRequest } from '@/lib/commission/sales-group-requests'
import s from './sales-groups.module.css'

// Sales Groups › Waiting list (2026-10-10, the HR revamp): the applicants HR
// accepted in Member services, numbered in the order they were accepted. A
// row opens its drawer — the facts and the action history. Transfer (into
// People Management's employee form) and Fail arrive with the waiting list's
// own flow; until then the drawer opens the request in Member services.

const COLS = '56px minmax(0,1.5fr) minmax(0,1fr) 140px 140px 28px'

export default function WaitingList({ rows, subDeptName }: { rows: SubDeptRequest[]; subDeptName: string }) {
  const list = waitingList(rows)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = list.find(r => r.id === openId) ?? null

  return (
    <section aria-label={`${subDeptName} waiting list`}>
      <GridTable label={`${subDeptName} waiting list`}>
        <GridHead cols={COLS} cells={['#', 'Applicant', 'Submitted by', 'Joining date', 'Accepted', '']} />
        {list.map(r => (
          <GridRow key={r.id} cols={COLS} onClick={() => setOpenId(r.id)} selected={openId === r.id} title={`Open ${r.newPerson ?? 'the applicant'}`}>
            <span role="cell" className={s.position}>#{r.position}</span>
            <div role="cell" className={s.twoLine}>
              <div className={s.strong}>{r.newPerson ?? '—'}</div>
              <div className={s.sub}>
                {[r.requestNo, r.contact].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <span role="cell" className={s.cell10}>{r.submittedBy ?? '—'}</span>
            <span role="cell" className={`${s.cell10} ${hv.mono}`} style={{ fontSize: 12 }}>{dayLabel(r.start)}</span>
            <span role="cell" className={s.cell10} style={{ fontSize: 12, color: 'rgb(var(--hv-body-2))' }}>{dayLabel(r.acceptedAt)}</span>
            <span role="cell" className={hv.chev} aria-hidden="true">
              <Chevron right />
            </span>
          </GridRow>
        ))}
        {list.length === 0 ? <div className={s.listEmpty}>Nobody is on {subDeptName}&apos;s waiting list.</div> : null}
      </GridTable>
      <div className={s.hint}>Applicants accepted in Member services, in the order they were accepted.</div>

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        width={400}
        eyebrow={open ? `#${open.position} of ${list.length} on ${subDeptName}'s waiting list` : ''}
        eyebrowStyle={{ color: 'rgb(var(--hv-orange-text))' }}
        title={open?.newPerson ?? ''}
        sub={open?.requestNo ? <span className={hv.mono} style={{ fontSize: 11, color: 'rgb(var(--hv-brown))' }}>{open.requestNo}</span> : undefined}
        footer={
          open ? (
            <>
              <button type="button" className={btn('outline')} onClick={() => setOpenId(null)}>
                Close
              </button>
              <Link href={`/member-admin?request=${open.id}`} className={btn('dark')}>
                Open in Member services
              </Link>
            </>
          ) : null
        }
      >
        {open ? (
          <>
            <Facts
              rows={[
                { l: 'Mobile number', v: open.contact ?? '—' },
                { l: 'Joining date', v: dayLabel(open.start) },
                { l: 'Department', v: `Revenue · ${subDeptName}` },
                { l: 'Submitted by', v: open.submittedBy ?? '—' },
                { l: 'Signed by', v: open.signature ?? '—' },
                { l: 'Accepted', v: open.acceptedAt ? `${dayLabel(open.acceptedAt)} · Member services` : '—' },
              ]}
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>Action history</SecLabel>
            <div>
              {historyOf(open.events).map((e, i) => (
                <HistoryEvent key={i} what={e.what} when={shortDay(e.at)} who={e.by ?? undefined} note={e.note ?? undefined} />
              ))}
            </div>
          </>
        ) : null}
      </Drawer>
    </section>
  )
}
