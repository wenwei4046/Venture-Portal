import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// On a phone HR's content frame runs on under the bottom tab bar (54px and the
// home strip, `globals.css` .hrv-frame). The kit's drawers, their scrims, its
// windows and its toast were placed from the frame's own edge, so the bottom
// ~45px of every drawer and every toast sat under the bar: + New request's
// "Submit to HR" could not be pressed (the parity audit, 2026-10-11). They stop
// where the sheet stops now.

const SRC = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8').replace(/\r\n/g, '\n')

/** The bodies of every `@media (max-width: 767px)` block in a stylesheet, joined. */
function phoneRules(css: string): string {
  const out: string[] = []
  let at = css.indexOf('@media (max-width: 767px)')
  while (at >= 0) {
    let i = css.indexOf('{', at) + 1
    let depth = 1
    const start = i
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(start, i - 1))
    at = css.indexOf('@media (max-width: 767px)', i)
  }
  return out.join('\n')
}

/** The declarations a selector list sets inside some CSS. */
function declarations(css: string, selector: RegExp): string {
  const m = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

describe('the kit on a phone', () => {
  const kit = phoneRules(read('components/hrv/hrv.module.css'))
  const frame = phoneRules(read('app/globals.css'))

  it('the frame clears the tab bar by 54px, the home strip and its 10px of ground', () => {
    expect(declarations(frame, /\.hrv-frame/)).toContain('padding-bottom: calc(54px + 10px + var(--safe-bottom))')
  })

  it('a drawer and its scrim end where the sheet ends', () => {
    expect(declarations(kit, /\.drawer,\s*\.drawerFixed/)).toContain('bottom: calc(54px + 10px + var(--safe-bottom))')
    expect(declarations(kit, /\.scrim/)).toContain('bottom: calc(54px + 10px + var(--safe-bottom))')
  })

  it('a window centres above the bar and is never taller than the room left there', () => {
    const w = declarations(kit, /\.window/)
    expect(w).toContain('top: calc(50% - (54px + var(--safe-bottom)) / 2)')
    expect(w).toContain('max-height: min(760px, calc(100% - 94px - var(--safe-bottom)))')
  })

  it('the toast stands as far above the bar as it stands above the sheet on a desktop', () => {
    expect(declarations(kit, /\.toast/)).toContain('bottom: calc(54px + 30px + var(--safe-bottom))')
  })
})
