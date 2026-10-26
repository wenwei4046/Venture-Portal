'use client'

import { useState } from 'react'
import b from './builder.module.css'

// A builder's template or product never published, deleted (the user's answer 8, 2026-10-24: "可以删（只限从没发布、
// 没被用过的）") — asked once, beside Publish. The database refuses one a product still links, in words.

export default function DeleteDraft({ what, busy, onDelete }: { what: string; busy: boolean; onDelete: () => void }) {
  const [ask, setAsk] = useState(false)
  if (!ask) {
    return (
      <button type="button" className={b.delBtn} disabled={busy} title="Never published — nothing runs on it" onClick={() => setAsk(true)}>
        Delete draft
      </button>
    )
  }
  return (
    <span className={b.delAsk} role="group" aria-label={`Delete this ${what}?`}>
      Delete this {what}?
      <button type="button" className={b.delYes} disabled={busy} onClick={onDelete}>Delete</button>
      <button type="button" className={b.delNo} onClick={() => setAsk(false)}>Keep</button>
    </span>
  )
}
