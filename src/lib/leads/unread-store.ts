'use client'

// The rail's Inbox dot (Lead View v2, README §5: "Inbox shows a 6px #FFD9BF unread dot"): lit while a chat waits unread.
// The Inbox knows; the shell draws it. Kept for the tab (sessionStorage, a convenience — try/catch) so another Lead View
// page still shows what the Inbox last saw.

import { useSyncExternalStore } from 'react'

const KEY = 'lead-unread'
const listeners = new Set<() => void>()
let current: boolean | null = null

function read(): boolean {
  if (current !== null) return current
  try { current = sessionStorage.getItem(KEY) === '1' } catch { current = false }
  return current
}

export function setLeadUnread(on: boolean) {
  if (read() === on) return
  current = on
  try { sessionStorage.setItem(KEY, on ? '1' : '0') } catch { /* a private window: this page only */ }
  for (const l of listeners) l()
}

export function useLeadUnread(): boolean {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    read,
    () => false,
  )
}
