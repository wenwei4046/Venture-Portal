'use client'

import type { ReactNode } from 'react'
import type { AgentDraft } from '@/lib/leads/ai'
import { Bi } from './bits'
import s from './lead.module.css'

/** An AI draft as the Inbox and Try it show it: the text, the cards it used, and whether a person should take over. */
export default function DraftBox({ draft, actions }: { draft: AgentDraft; actions: ReactNode }) {
  return (
    <div className={s.aiBox} style={{ margin: 0 }}>
      <div className={s.aiHead}>✦ <Bi en="AI draft" zh="AI 草稿" /></div>
      <div className={s.aiText}>{draft.reply}</div>
      {draft.used.length ? (
        <div className={s.tabs}>
          <span className={s.hint}><Bi en="From" zh="来源" />:</span>
          {draft.used.map(u => <span key={u.id} className={s.brand} data-tone="olive">{u.title}</span>)}
        </div>
      ) : <span className={s.hint}><Bi en="No Data Center card used." zh="没有引用资料。" /></span>}
      {draft.handoff || draft.note ? (
        <div className={s.aiWarn}>
          {draft.handoff ? <strong><Bi en="A person should take over. " zh="建议由客服接手。" /></strong> : null}{draft.note}
        </div>
      ) : null}
      <div className={s.actions}>{actions}</div>
    </div>
  )
}
