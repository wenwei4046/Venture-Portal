import { describe, expect, it, vi } from 'vitest'
import {
  navigationStarted,
  onNavigationStart,
  skeletonHidden,
  skeletonShown,
  subscribeSkeletons,
  visibleSkeletons,
} from './nav-progress'

describe('nav-progress store', () => {
  it('tells every listener a navigation started, and survives one that throws', () => {
    const first = vi.fn(() => {
      throw new Error('a broken listener')
    })
    const second = vi.fn()
    const offFirst = onNavigationStart(first)
    const offSecond = onNavigationStart(second)

    expect(() => navigationStarted()).not.toThrow()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    offFirst()
    offSecond()
    navigationStarted()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('counts skeletons in and out, and never below zero', () => {
    const seen: number[] = []
    const off = subscribeSkeletons(() => seen.push(visibleSkeletons()))

    skeletonShown()
    skeletonShown()
    skeletonHidden()
    skeletonHidden()
    skeletonHidden()

    expect(seen).toEqual([1, 2, 1, 0, 0])
    expect(visibleSkeletons()).toBe(0)
    off()
  })
})
