'use client'

import { noticeAge, type MktNotice } from '@/lib/marketing/shell'
import { noticeIcon } from '@/lib/mkt-app/model'
import { Shell } from './TaskScreen'
import s from '../mkt-app.module.css'

// Notifications, pushed from the bell (Marketing's own — `mkt_notices`): an icon, the notice, its line and age, a dot
// while unread. A tap reads it and opens what it is about.

export default function NoticesScreen({ notices, onOpen, onBack }: { notices: MktNotice[]; onOpen: (n: MktNotice) => void; onBack: () => void }) {
  const now = new Date()
  return (
    <Shell title="Notifications" onBack={onBack}>
      <div className={s.scroll}>
        <div className={s.notices}>
          {notices.map(n => (
            <button key={n.id} type="button" className={s.notice} data-unread={n.read ? 'false' : 'true'} onClick={() => onOpen(n)}>
              <span className={s.noticeIcon}>{noticeIcon(n)}</span>
              <span className={s.grow}>
                <span className={s.noticeTitle} style={{ display: 'block' }}>{n.title}</span>
                <span className={s.noticeMeta} style={{ display: 'block' }}>{[n.body, noticeAge(n.at, now)].filter(Boolean).join(' · ')}</span>
              </span>
              {n.read ? null : <span className={s.noticeDot} />}
            </button>
          ))}
          {notices.length ? null : <div className={s.emptyTall}>Nothing new.</div>}
        </div>
      </div>
    </Shell>
  )
}
