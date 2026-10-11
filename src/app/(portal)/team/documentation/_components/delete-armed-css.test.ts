import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Documents › Delete asks twice: the first press arms it ("Confirm delete", pink). The pointer is on it right after
// that press, and the hover rules (.smallBtn's orange, .deleteBtn's grey) outranked the armed one, so it showed
// grey instead of pink (the parity audit, 2026-10-11). The armed look holds under the pointer too.

const css = readFileSync(resolve(__dirname, 'documentation.module.css'), 'utf8').replace(/\r\n/g, '\n')

describe('the armed delete', () => {
  it('stays pink under the pointer', () => {
    const m = /\.deleteBtn\[data-armed='true'\],\s*\.deleteBtn\[data-armed='true'\]:hover:not\(:disabled\)\s*\{([^}]*)\}/.exec(css)
    expect(m?.[1]).toContain('border-color: rgb(236 190 184)')
    expect(m?.[1]).toContain('background: rgb(250 228 224)')
  })
})
