'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import MemoCard, { openMemoFileIn } from '@/components/memos/MemoCard'
import { previewPublished } from '@/lib/documentation/actions'
import { openMemoFile } from '@/lib/memos/actions'
import { memoWhen, previewSummary, receiptOf, type MemoPreview } from '@/lib/memos/model'
import s from './documentation.module.css'

/**
 * Publish › Preview (2026-10-12 — the user: "其实在这个 publisher，就是因为我已经
 * 发过了这个 memo，我可以 preview，就 preview 这个 memo 是长怎样的"): a published
 * memo as its people read it — from, when, title, body, the file sent with it
 * (View / Download) and the Acknowledge they are asked for — and, on its second
 * tab, where each of them stands: Acknowledged, Opened, Delivered, or no login
 * yet (so it cannot reach them). Read at the press (`hr_memo_preview`,
 * Documentation · View); the file's link is made at its own press.
 */
export default function MemoPreviewDrawer({ memoId, onClose }: { memoId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<'memo' | 'people'>('memo')
  const [memo, setMemo] = useState<MemoPreview | null>(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    if (!memoId) return
    let live = true
    setTab('memo')
    setMemo(null)
    setFailed('')
    void previewPublished(memoId).then(res => {
      if (!live) return
      if (res.ok) setMemo(res.preview)
      else setFailed(res.reason)
    })
    return () => {
      live = false
    }
  }, [memoId])

  function openFile(mode: 'view' | 'download') {
    if (!memo) return
    void openMemoFileIn(m => openMemoFile(memo.id, m), mode).then(refused => {
      if (refused) flash(refused)
      else if (mode === 'download') flash(`Downloads ${memo.attachment?.name ?? 'the file'}`)
    })
  }

  return (
    <Drawer open={!!memoId} onClose={onClose} width={560} bare label={memo?.title ?? 'Preview'}>
      <div className={s.vwHead}>
        <div className={s.vwWho}>
          <div className={s.vwKicker}>Preview · {memo?.kind ?? 'Memo'}</div>
          <div className={s.vwTitle}>{memo?.title ?? (failed ? 'Could not open' : 'Opening…')}</div>
          {memo ? <div className={s.vwFile}>Published {memoWhen(memo.publishedAt)} · {memo.sender}</div> : null}
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={s.vwTabs} role="tablist" aria-label="Preview">
        <button type="button" role="tab" className={s.vwTab} aria-selected={tab === 'memo'} onClick={() => setTab('memo')}>
          As they see it
        </button>
        <button type="button" role="tab" className={s.vwTab} aria-selected={tab === 'people'} onClick={() => setTab('people')}>
          Who has it
          <span className={s.vwTabCount}>{memo?.people.length ?? 0}</span>
        </button>
      </div>
      {failed ? (
        <div className={s.vwPreview}><div className={s.vwNone}>{failed}</div></div>
      ) : !memo ? (
        <div className={s.vwPreview}><div className={s.vwNone}>Opening the memo…</div></div>
      ) : tab === 'memo' ? (
        <div className={s.vwPreview}>
          <MemoCard memo={memo} onFile={memo.attachment ? openFile : undefined}>
            {memo.withdrawnAt ? (
              <div className={s.mpGone}>Withdrawn {memoWhen(memo.withdrawnAt)} — nobody sees it any more.</div>
            ) : memo.requiresAck ? (
              <div className={s.mpAck}>
                <span className={s.mpAckBtn} aria-hidden="true">Acknowledge</span>
                <span className={s.mpAckNote}>
                  Each person taps Acknowledge once — in the portal, the HR app or the Revenue app; their name and time are recorded for HR.
                </span>
              </div>
            ) : null}
          </MemoCard>
        </div>
      ) : (
        <div className={s.vwAudit}>
          <div className={s.mpSummary}>{previewSummary(memo.people)}</div>
          {memo.people.map(p => {
            const r = receiptOf(p)
            return (
              <div key={p.staffId} className={s.mpPerson}>
                <span className={s.mpPersonName}>
                  {p.name}
                  {p.department ? <span className={s.mpPersonDept}> · {p.department}</span> : null}
                </span>
                {r.when ? <span className={s.mpPersonWhen}>{r.when}</span> : null}
                <span className={s.status} data-tone={r.tone}>
                  <span className={s.statusDot} />
                  {r.label}
                </span>
              </div>
            )
          })}
          {memo.people.length === 0 ? <div className={s.vwNone}>It reaches nobody any more.</div> : null}
        </div>
      )}
    </Drawer>
  )
}
