import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserRole } from '@/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { useViewAsSync } from './useViewAsSync'

function setMirror(value: string | null) {
  document.cookie = value === null
    ? 'vp-view=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    : `vp-view=${value}; path=/`
}

function comeBack() {
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useViewAsSync — a portal tab follows a switch made in another tab', () => {
  beforeEach(() => {
    refresh.mockReset()
    setMirror(null)
  })
  afterEach(() => setMirror(null))

  it('redraws once when another tab switched to HR while this one shows Principal', () => {
    renderHook(() => useViewAsSync('principal', true))
    expect(refresh).not.toHaveBeenCalled()
    setMirror('hr')
    comeBack()
    comeBack()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('redraws at mount when the switch landed before hydration', () => {
    setMirror('finance')
    renderHook(() => useViewAsSync('principal', true))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves the tab alone when the member app is opened elsewhere (Revenue View)', () => {
    renderHook(() => useViewAsSync('principal', true))
    setMirror('revenue_member')
    comeBack()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('leaves the tab alone when nobody has switched since sign-in', () => {
    renderHook(() => useViewAsSync('hr', true))
    comeBack()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('follows the switch back to Principal', () => {
    const { rerender } = renderHook(({ role }: { role: UserRole }) => useViewAsSync(role, true), {
      initialProps: { role: 'hr' as UserRole },
    })
    setMirror('principal')
    comeBack()
    expect(refresh).toHaveBeenCalledTimes(1)
    // The refresh redrew the shell as Principal: nothing further to follow.
    rerender({ role: 'principal' })
    comeBack()
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('never runs for an account that has no view to switch', () => {
    setMirror('hr')
    renderHook(() => useViewAsSync('finance', false))
    comeBack()
    expect(refresh).not.toHaveBeenCalled()
  })
})
