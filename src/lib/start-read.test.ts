import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRead } from './start-read'

/** A PostgREST-style builder: every `then` sends the request again. */
function builder<T>(answer: T, delayMs = 0) {
  const sent: number[] = []
  const query: PromiseLike<T> = {
    then: (onfulfilled, onrejected) => {
      sent.push(Date.now())
      return new Promise<T>((done) => setTimeout(() => done(answer), delayMs)).then(onfulfilled, onrejected)
    },
  }
  return { query, sent }
}

describe('startRead', () => {
  const listeners: Array<(reason: unknown) => void> = []
  afterEach(() => {
    for (const l of listeners.splice(0)) process.off('unhandledRejection', l)
  })

  it('sends a builder once, however many times its answer is awaited', async () => {
    const { query, sent } = builder({ data: [1] })
    const read = startRead(query)
    expect(await read).toEqual({ data: [1] })
    expect(await read).toEqual({ data: [1] })
    expect(sent).toHaveLength(1)
  })

  it('…where awaiting the builder itself twice would send it twice', async () => {
    const { query, sent } = builder({ data: [1] })
    await query
    await query
    expect(sent).toHaveLength(2)
  })

  it('starts the read at once, not when the page gets round to awaiting it', async () => {
    const first = builder('first', 20)
    const second = builder('second', 20)
    const a = startRead(first.query)
    const b = startRead(second.query)
    expect(await a).toBe('first')
    // The second was sent before the first answered: one round trip, not two.
    expect(second.sent).toHaveLength(1)
    expect(await b).toBe('second')
  })

  it('a read that fails before anything awaits it is no unhandled rejection — and still throws where it is awaited', async () => {
    const unhandled = vi.fn()
    listeners.push(unhandled)
    process.on('unhandledRejection', unhandled)

    const failing = startRead(Promise.reject(new Error('fetchAllRows: timeout')))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(unhandled).not.toHaveBeenCalled()
    await expect(failing).rejects.toThrow('fetchAllRows: timeout')
  })

  it('keeps the page’s own order of failures: the read awaited first is the one that throws', async () => {
    const readFirst = startRead(new Promise((_, reject) => setTimeout(() => reject(new Error('read first')), 15)))
    const readSecond = startRead(new Promise((_, reject) => setTimeout(() => reject(new Error('read second')), 1)))
    const page = async () => {
      await readFirst // fails later in time, but the page reads it first…
      await readSecond // …so this one's earlier failure never surfaces
    }
    await expect(page()).rejects.toThrow('read first')
  })
})
