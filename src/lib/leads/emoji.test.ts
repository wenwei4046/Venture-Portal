import { describe, expect, it } from 'vitest'
import { EMOJI_GROUPS, insertAt, withRecent } from './emoji'

describe('the reply box’s emoji', () => {
  it('goes where the cursor is, over a selection, and the cursor follows it', () => {
    expect(insertAt('Hi Jason!', 9, 9, '😊')).toEqual({ text: 'Hi Jason!😊', caret: 11 })
    expect(insertAt('Hi Jason!', 0, 0, '👋')).toEqual({ text: '👋Hi Jason!', caret: 2 })
    expect(insertAt('Hi Jason!', 3, 8, '🙏')).toEqual({ text: 'Hi 🙏!', caret: 5 })
    expect(insertAt('', 5, 9, '👍')).toEqual({ text: '👍', caret: 2 })
  })
  it('keeps the newest eight used, each once', () => {
    expect(withRecent(['😊', '👍'], '👍')).toEqual(['👍', '😊'])
    expect(withRecent(['1', '2', '3', '4', '5', '6', '7', '8'], '9')).toEqual(['9', '1', '2', '3', '4', '5', '6', '7'])
  })
  it('lists each emoji once', () => {
    const all = EMOJI_GROUPS.flatMap(g => g.emoji)
    expect(new Set(all).size).toBe(all.length)
  })
})
