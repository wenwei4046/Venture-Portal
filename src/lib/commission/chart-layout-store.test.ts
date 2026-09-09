import { describe, it, expect } from 'vitest'
import {
  layoutKey,
  parseManualLayout,
  readManualLayout,
  serializeManualLayout,
  writeManualLayout,
  type StorageLike,
} from './chart-layout-store'

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { store: Map<string, string> } {
  const store = new Map(Object.entries(seed))
  return {
    store,
    getItem: k => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: k => void store.delete(k),
  }
}

describe('parseManualLayout', () => {
  it('reads a map of finite pairs and nothing else', () => {
    const out = parseManualLayout(
      JSON.stringify({
        a: { x: 10, y: 20 },
        b: { x: 'ten', y: 20 },
        c: { x: Infinity, y: 0 },
        d: null,
        e: [1, 2],
      }),
    )
    expect([...out.entries()]).toEqual([['a', { x: 10, y: 20 }]])
  })

  it('treats garbage, arrays and nothing as an empty arrangement', () => {
    expect(parseManualLayout(null).size).toBe(0)
    expect(parseManualLayout('{not json').size).toBe(0)
    expect(parseManualLayout('[1,2]').size).toBe(0)
    expect(parseManualLayout('"str"').size).toBe(0)
  })
})

describe('serializeManualLayout', () => {
  it('rounds to whole pixels and round-trips', () => {
    const raw = serializeManualLayout(new Map([['a', { x: 10.4, y: 19.6 }]]))
    expect(raw).toBe('{"a":{"x":10,"y":20}}')
    expect(parseManualLayout(raw).get('a')).toEqual({ x: 10, y: 20 })
  })
})

describe('read / write', () => {
  it('keys the arrangement by scheme and removes the key when it is empty', () => {
    const storage = fakeStorage()
    writeManualLayout(storage, 'scheme-1', new Map([['a', { x: 1, y: 2 }]]))
    expect(storage.store.has(layoutKey('scheme-1'))).toBe(true)
    expect(readManualLayout(storage, 'scheme-1').get('a')).toEqual({ x: 1, y: 2 })
    expect(readManualLayout(storage, 'scheme-2').size).toBe(0)

    writeManualLayout(storage, 'scheme-1', new Map())
    expect(storage.store.has(layoutKey('scheme-1'))).toBe(false)
  })

  it('never throws when storage is missing or broken', () => {
    expect(readManualLayout(null, 's').size).toBe(0)
    expect(() => writeManualLayout(undefined, 's', new Map([['a', { x: 0, y: 0 }]]))).not.toThrow()
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('quota')
      },
    }
    expect(readManualLayout(broken, 's').size).toBe(0)
    expect(() => writeManualLayout(broken, 's', new Map([['a', { x: 0, y: 0 }]]))).not.toThrow()
  })
})
