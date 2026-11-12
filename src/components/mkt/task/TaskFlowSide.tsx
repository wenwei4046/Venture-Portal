'use client'

import { useState } from 'react'
import { activityShown, type FlowLog, type NextView } from '@/lib/marketing/task-flow-view'
import TaskFlowAvatar from './TaskFlowAvatar'
import s from './taskflow.module.css'

// The right column (260–320px — Task Flow.dc.html): Next up (who, when they are told, the message), and Activity — the
// latest three, "Show all {n}".

export default function TaskFlowSide({ next, log }: { next: NextView; log: readonly FlowLog[] }) {
  const [all, setAll] = useState(false)
  const shown = activityShown(log, all)
  return (
    <div className={s.side}>
      <span className={s.label}>Next up</span>
      <div className={s.nextBox} data-testid="tf-next">
        <div className={s.nextTop}>
          <TaskFlowAvatar init={next.init} hue={next.hue} size={26} />
          <div className={s.nextText}>
            <span className={s.nextTitle}>{next.title}</span>
            <span className={s.nextSub}>{next.sub}</span>
          </div>
        </div>
        <div className={s.nextWhen}><span aria-hidden="true">🔔</span><span>{next.when}</span></div>
      </div>
      <div className={s.actHead}>
        <span className={`${s.label} ${s.grow}`}>Activity</span>
        {log.length > 3 ? (
          <button type="button" className={s.actToggle} onClick={() => setAll(a => !a)}>{all ? 'Show less' : `Show all ${log.length}`}</button>
        ) : null}
      </div>
      <div className={s.actList}>
        {shown.length ? shown.map((l, i) => (
          <div key={`${l.at}${i}`} className={s.actRow}>
            <span className={s.actIcon} aria-hidden="true">{l.icon}</span>
            <span className={s.actText}>{l.text}</span>
            <span className={s.actTime}>{l.time}</span>
          </div>
        )) : <div className={s.actNone}>Nothing yet</div>}
      </div>
    </div>
  )
}
