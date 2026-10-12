'use client'

import type { ReactNode } from 'react'
import { memoFileExt, memoParas, memoWhen, type MemoFile } from '@/lib/memos/model'
import s from './memo-card.module.css'

/**
 * A memo as its people read it (2026-10-12): who it is from and when, its
 * title, each paragraph, the file sent with it (View / Download) and, below,
 * whatever the place it is shown in asks — the Acknowledge of the memo's own
 * person (the portal's memo bell), or HR's note of what everybody is asked
 * (Publish › Preview). On the kit's `--hv-*` tokens: it is drawn inside the kit's
 * drawers, which carry them.
 */
export default function MemoCard({ memo, onFile, children }: {
  memo: { title: string; body: string; sender: string; publishedAt: string; attachment: MemoFile | null }
  /** The file's View / Download — none, and the file shows without its buttons. */
  onFile?: (mode: 'view' | 'download') => void
  children?: ReactNode
}) {
  const paras = memoParas(memo.body)
  return (
    <article className={s.card} aria-label={`${memo.title}, as it reads`}>
      <div className={s.from}>
        <span className={s.fromTile} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
          </svg>
        </span>
        <span className={s.fromText}>
          <span className={s.sender}>{memo.sender}</span>
          <span className={s.when}>{memoWhen(memo.publishedAt)}</span>
        </span>
      </div>
      <h3 className={s.title}>{memo.title}</h3>
      {paras.map((p, i) => (
        <p key={i} className={s.para}>{p}</p>
      ))}
      {memo.attachment ? (
        <div className={s.file}>
          <span className={s.fileTile} aria-hidden="true">{memoFileExt(memo.attachment.name)}</span>
          <span className={s.fileName}>{memo.attachment.name}</span>
          {onFile ? (
            <>
              <button type="button" className={s.fileBtn} onClick={() => onFile('view')}>View</button>
              <button type="button" className={s.fileBtn} onClick={() => onFile('download')}>Download</button>
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </article>
  )
}

/**
 * Open a memo's file from a press (2026-10-12): a tab readied in the press itself — one opened after the
 * server answers is a pop-up to the browser — then sent to the short link, or a download in place. Returns
 * the refusal, if any, for the caller to say.
 */
export async function openMemoFileIn(
  open: (mode: 'view' | 'download') => Promise<{ ok: true; url: string; fileName: string } | { ok: false; reason: string }>,
  mode: 'view' | 'download',
): Promise<string | null> {
  const win = mode === 'view' ? window.open('', '_blank') : null
  if (win) win.opener = null
  const link = await open(mode)
  if (!link.ok) {
    win?.close()
    return link.reason
  }
  if (win) win.location.href = link.url
  else window.location.assign(link.url)
  return null
}
