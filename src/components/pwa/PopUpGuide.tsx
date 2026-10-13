'use client'

import { useState } from 'react'
import { sendTestNotice } from './push-client'
import s from './push-ask.module.css'

/**
 * Make them pop up (2026-10-14 — the user: "make sure jump up", beside a WhatsApp notice popping over the screen).
 * Android gives an installed web app's notifications Default importance — a sound and the shade, never a pop-up —
 * and no web page may change that: only the person can, once per phone, in the app's notification settings. So
 * the card says how, and *Send a test* shows a customer's message as it will arrive (public/sw.js), to be pressed
 * and held for its settings. On an iPhone they show as banners already, so the card is for Android only.
 */
export default function PopUpGuide({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState<'idle' | 'sent' | 'failed'>('idle')
  const test = () => {
    void sendTestNotice().then(ok => setSent(ok ? 'sent' : 'failed'))
  }
  return (
    <div className={s.scrim} data-push-ask="" data-popup-guide="">
      <div className={s.card} role="dialog" aria-modal="true" aria-labelledby="popup-guide-title">
        <span className={s.bell} aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM8.5 5h7a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2.5 14h2" />
          </svg>
        </span>
        <h2 id="popup-guide-title" className={s.title}>Make them pop up</h2>
        <ol className={s.steps}>
          <li>Tap <b>Send a test</b>.</li>
          <li>Press and hold the test notification, then tap <b>⚙</b>.</li>
          <li>Turn on <b>Pop on screen</b> — <i>Floating</i> or <i>Banners</i> on some phones.</li>
        </ol>
        {sent === 'failed' ? <p className={s.reason} role="alert">This phone could not show it. Turn on Phone notifications first.</p> : null}
        <button type="button" className={s.allow} onClick={test}>{sent === 'sent' ? 'Send another' : 'Send a test'}</button>
        <button type="button" className={s.later} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
