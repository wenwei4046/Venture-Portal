'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import { previewPublished } from '@/lib/documentation/actions'
import { openMemoFile } from '@/lib/memos/actions'
import {
  memoFileExt, memoParas, memoWhen, previewSummary, receiptOf, type MemoPreview,
} from '@/lib/memos/model'
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
    if (!memo?.attachment) return
    // Readied in the press itself: a tab opened after the server answers is a pop-up to the browser.
    const win = mode === 'view' ? window.open('', '_blank') : null
    if (win) win.opener = null
    void openMemoFile(memo.id, mode).then(link => {
      if (!link.ok) {
        win?.close()
        flash(link.reason)
        return
      }
      if (win) win.location.href = link.url
      else {
        window.location.assign(link.url)
        flash(`Downloads ${link.fileName || memo.attachment?.name}`)
      }
    })
  }

  const paras = memo ? memoParas(memo.body) : []
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
          <article className={s.mpCard} aria-label={`${memo.title}, as it reads`}>
            <div className={s.mpFrom}>
              <span className={s.mpFromTile} aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
                </svg>
              </span>
              <span className={s.mpFromText}>
                <span className={s.mpSender}>{memo.sender}</span>
                <span className={s.mpWhen}>{memoWhen(memo.publishedAt)}</span>
              </span>
            </div>
            <h3 className={s.mpTitle}>{memo.title}</h3>
            {paras.map((p, i) => (
              <p key={i} className={s.mpPara}>{p}</p>
            ))}
            {memo.attachment ? (
              <div className={s.mpFile}>
                <span className={s.mpFileTile} aria-hidden="true">{memoFileExt(memo.attachment.name)}</span>
                <span className={s.mpFileName}>{memo.attachment.name}</span>
                <button type="button" className={s.smallBtn} onClick={() => openFile('view')}>View</button>
                <button type="button" className={s.smallBtn} onClick={() => openFile('download')}>Download</button>
              </div>
            ) : null}
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
          </article>
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
