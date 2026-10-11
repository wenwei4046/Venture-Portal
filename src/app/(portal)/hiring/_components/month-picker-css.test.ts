import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Hiring › Insights › "Pick a month" was pinned to its button's left edge: on a
// 390px phone it ran from x 203 to 493 and six of the twelve months could not
// be pressed (the parity audit, 2026-10-11). On a phone it opens leftwards from
// the button's right edge; on a desktop it stays where the prototype puts it.

const css = readFileSync(resolve(__dirname, 'hiring.module.css'), 'utf8').replace(/\r\n/g, '\n')
const rule = (block: string, selector: string) => new RegExp(`(^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(block)?.[2].replace(/\s+/g, ' ').trim() ?? ''

describe('the month picker', () => {
  it('keeps the prototype’s place on a desktop', () => {
    expect(rule(css, '.monthPop')).toContain('left: 0;')
  })

  it('opens leftwards from its button on a phone', () => {
    const phone = css.slice(css.lastIndexOf('@media (max-width: 767px)'))
    expect(rule(phone, '.monthPop')).toBe('left: auto; right: 0;')
  })
})
