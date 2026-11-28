'use client'

import { useEffect, useState } from 'react'
import { EMOJI_GROUPS, withRecent } from '@/lib/leads/emoji'
import { Sheet, TITLE, lv } from './parts'

const RECENT_KEY = 'lead-emoji-recent'

/**
 * The composer's emoji (not in the prototype, whose smiley does nothing; the desktop Inbox's picker): the viewer's recent
 * eight, then the groups. It stays open for several; a tap outside or Back closes it.
 */
export default function EmojiSheet({ open, onPick }: { open: boolean; onPick: (emoji: string) => void }) {
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    try {
      const r: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
      setRecent(Array.isArray(r) ? r.filter((e): e is string => typeof e === 'string').slice(0, 8) : [])
    } catch { setRecent([]) }
  }, [open])
  const pick = (emoji: string) => {
    onPick(emoji)
    const next = withRecent(recent, emoji)
    setRecent(next)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* a private window: no recent row */ }
  }
  const groups = recent.length ? [{ name: 'Recent', emoji: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS
  return (
    <Sheet open={open} label="Emoji" radius={26} maxHeight="62%">
      <span aria-hidden="true" style={{ alignSelf: 'center', flex: 'none', width: 40, height: 5, borderRadius: 3, background: lv('line') }} />
      <h2 style={{ ...TITLE, margin: 0, fontSize: 22, color: lv('fg') }}>Emoji</h2>
      {groups.map(g => (
        <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: lv('fg-4') }}>{g.name}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
            {g.emoji.map(e => (
              <button key={e} type="button" onClick={() => pick(e)} aria-label={e} onMouseDown={ev => ev.preventDefault()}
                style={{ height: 44, display: 'grid', placeItems: 'center', fontSize: 26, lineHeight: 1 }}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  )
}
