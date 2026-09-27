'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types'
import { VIEW_AS_MIRROR_COOKIE, viewAsChanged } from '@/lib/view-as'

function readMirror(): string | null {
  const prefix = `${VIEW_AS_MIRROR_COOKIE}=`
  const hit = document.cookie.split('; ').find(part => part.startsWith(prefix))
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : null
}

/**
 * A portal tab drawn in one view redraws when another tab switched it.
 *
 * View-as is a cookie, so a switch in one tab is a switch for the whole
 * browser — but every other open tab keeps the shell it was drawn with. Left
 * alone, a tab that still says Principal sends clicks the server now judges as
 * HR or Finance, and a page that view cannot open bounces to Overview
 * (2026-09-27). Checked whenever the tab comes back into sight, which is the
 * first moment anybody could click in it; at most one refresh per drawn view,
 * so a disagreement the server will not resolve cannot loop.
 */
export function useViewAsSync(rendered: UserRole, enabled: boolean) {
  const router = useRouter()
  useEffect(() => {
    if (!enabled) return
    let refreshed = false
    const check = () => {
      if (refreshed || document.visibilityState !== 'visible') return
      if (!viewAsChanged(readMirror(), rendered)) return
      refreshed = true
      router.refresh()
    }
    // Also now: a switch can land between the server drawing this shell and
    // the browser mounting it.
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [enabled, rendered, router])
}
