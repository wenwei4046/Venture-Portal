import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The portal's own field rules (globals.css) — the blue focus glow and the
// phone's 44px control floor — stop at the surfaces drawn to their own
// prototypes: the Revenue app, the HR app, the guest page, and the soft
// dropdown's menu, which is portaled to <body> and so sits outside all of
// them. Without the last two the guest's fields and every long list's search
// box focused blue and stood 44px tall (the phone audit, 2026-10-11).

const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')
const SURFACES = ['[data-revenue-app] *', '[data-hr-app] *', '[data-guest-page] *', '[data-soft-menu] *']

function rulesMatching(selectorPart: RegExp): string[] {
  return css
    .split('}')
    .map(block => block.slice(0, block.indexOf('{')).trim())
    .filter(sel => selectorPart.test(sel))
}

describe('the portal’s field rules leave the prototype-drawn surfaces alone', () => {
  it('the focus glow', () => {
    const glow = rulesMatching(/:focus:not\(:where\(/)
    expect(glow.length).toBeGreaterThan(0)
    for (const sel of glow) for (const s of SURFACES) expect(sel).toContain(s)
  })

  it('the phone’s control floor', () => {
    const floor = css.slice(css.indexOf("keep their prototypes' own control heights"))
    const block = floor.slice(0, floor.indexOf('}'))
    for (const s of SURFACES) expect(block).toContain(s)
  })

  // 2026-11-10: on a narrow window the floor stood the Inbox filter's search box 44px tall inside its 34px frame.
  it('the phone’s control floor leaves Lead View alone too', () => {
    const floor = css.slice(css.indexOf("keep their prototypes' own control heights"))
    const block = floor.slice(0, floor.indexOf('}'))
    expect(block.match(/\[data-lead-view\] \*/g)).toHaveLength(3)
  })

  it('the markers are on the guest page and the soft menu', () => {
    const guest = fs.readFileSync(path.resolve(__dirname, '../app/(guest)/g/[code]/_components/GuestPage.tsx'), 'utf8')
    const select = fs.readFileSync(path.resolve(__dirname, '../components/hrv/select.tsx'), 'utf8')
    expect(guest).toContain('data-guest-page=""')
    expect(select).toContain('data-soft-menu=""')
  })
})
