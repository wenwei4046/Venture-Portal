import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useStickySelection } from './useStickySelection'
import { dropSelectionsForPath, resetSelections } from './selection-store'

const NAV_ROOTS = new Set(['/approvals', '/payments'])

describe('useStickySelection', () => {
  beforeEach(() => resetSelections())

  it('restores the ticks when the list remounts after a detail page', () => {
    const ids = ['a', 'b', 'c']
    const first = renderHook(() => useStickySelection('/approvals', ids))
    act(() => {
      first.result.current.toggle('a')
      first.result.current.toggle('c')
    })
    expect([...first.result.current.selected].sort()).toEqual(['a', 'c'])

    // Into /approvals/a and straight back — the list unmounts and remounts.
    first.unmount()
    dropSelectionsForPath('/approvals/a', NAV_ROOTS)
    dropSelectionsForPath('/approvals', NAV_ROOTS)

    const back = renderHook(() => useStickySelection('/approvals', ids))
    expect([...back.result.current.selected].sort()).toEqual(['a', 'c'])
  })

  it('forgets them after a tab switch', () => {
    const ids = ['a', 'b']
    const first = renderHook(() => useStickySelection('/approvals', ids))
    act(() => first.result.current.toggle('a'))
    first.unmount()

    dropSelectionsForPath('/payments', NAV_ROOTS)

    const back = renderHook(() => useStickySelection('/approvals', ids))
    expect(back.result.current.selected.size).toBe(0)
  })

  it('prunes a row that was approved while the reader was away', () => {
    const first = renderHook(() =>
      useStickySelection('/approvals', ['a', 'b', 'c'])
    )
    act(() => {
      first.result.current.toggle('a')
      first.result.current.toggle('b')
    })
    first.unmount()

    // 'a' got approved on its detail page, so it is off the pending list now.
    const back = renderHook(() => useStickySelection('/approvals', ['b', 'c']))
    expect([...back.result.current.selected]).toEqual(['b'])
  })

  it('toggles a tick off again', () => {
    const { result } = renderHook(() => useStickySelection('/approvals', ['a']))
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('a'))
    expect(result.current.selected.size).toBe(0)
  })

  it('replaces and clears the whole selection', () => {
    const ids = ['a', 'b', 'c']
    const { result } = renderHook(() => useStickySelection('/approvals', ids))
    act(() => result.current.replace(ids))
    expect(result.current.selected.size).toBe(3)
    act(() => result.current.clear())
    expect(result.current.selected.size).toBe(0)
  })

  it('keeps scopes apart', () => {
    const approvals = renderHook(() =>
      useStickySelection('/approvals', ['a'])
    )
    act(() => approvals.result.current.toggle('a'))
    const payments = renderHook(() => useStickySelection('/payments', ['a']))
    expect(payments.result.current.selected.size).toBe(0)
  })
})
