import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The orange step numbers beside State / City / Postcode (2026-10-23, the user: "make the number centre a bit in the
// orange colour"): the badge took its host label's 20px line, which grew its grid row past the 16px circle and set the
// figure ~2px low. It keeps a line of its own, so the figure sits in the middle of the circle.

const css = readFileSync(resolve(__dirname, 'address-fields.module.css'), 'utf8').replace(/\r\n/g, '\n')

describe('the step number', () => {
  it('sits in the middle of its circle', () => {
    const step = /\n\.step \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(step).toContain('place-items: center')
    expect(step).toContain('height: 16px')
    expect(step).toMatch(/\bline-height: 1;/)
  })
})
