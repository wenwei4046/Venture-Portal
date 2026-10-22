import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type AtRule, type Container, type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { cardRowFit } from './Hub'

// Finance's hub pages on a desktop (2026-10-22, the user: "可以帮我把finance 的这些card move 上去吗" →
// "可以，原本的底色不要变，电话版本的也不要变"): the cards sit in one row above the table, which takes the
// hub's whole width — the total first, 1.6 cards wide, a card 175px or more so its figure shows whole.
// A hub too narrow for that puts the cards in two rows beside the total; a narrower one wraps them above
// the table as before. A phone keeps its layout.

const css = postcss.parse(readFileSync(resolve(__dirname, 'hub.module.css'), 'utf8'))

const rulesIn = (node: Container | undefined) => (node?.nodes ?? []).filter((n): n is Rule => n.type === 'rule')
const atRules = (name: string, params: RegExp) => css.nodes.filter((n): n is AtRule => n.type === 'atrule' && n.name === name && params.test(n.params))
const declsOf = (rule: Rule | undefined): Record<string, string> =>
  Object.fromEntries((rule?.nodes ?? []).flatMap((n) => (n.type === 'decl' ? [[n.prop, n.value]] : [])))
const ruleFor = (node: Container | undefined, selector: string) => rulesIn(node).find((r) => r.selector === selector)

/** A value as it stands where none of the custom properties is set: every var() at its fallback. */
function atFallback(value: string): string {
  const at = value.indexOf('var(')
  if (at < 0) return value
  let depth = 0
  let comma = -1
  let end = at + 3
  for (; end < value.length; end++) {
    const c = value[end]
    if (c === '(') depth++
    else if (c === ')' && --depth === 0) break
    else if (c === ',' && depth === 1 && comma < 0) comma = end
  }
  return atFallback(value.slice(0, at) + (comma < 0 ? '' : value.slice(comma + 1, end).trim()) + value.slice(end + 1))
}

/** What a rule outside every @media and @container gives a phone. */
const phone = (selector: string) => Object.fromEntries(Object.entries(declsOf(ruleFor(css, selector))).map(([p, v]) => [p, atFallback(v)]))

const desktop = atRules('media', /^\(min-width: 768px\)$/)
const containers = atRules('container', /^hub-cards\b/).map((a) => ({ min: Number(/min-width:\s*(\d+)px/.exec(a.params)?.[1]), rules: rulesIn(a) }))

/**
 * The row a hub `width` px wide gives cards that need step `one` for a row and `two` for two rows
 * (HubCards' `data-one-row`, `data-two-rows`): the container rules that apply, in the stylesheet's order.
 */
function rowAt(fit: { one: number; two: number }, width: number): { cols?: string; hero?: string } {
  const out: { cols?: string; hero?: string } = {}
  for (const c of containers) {
    if (c.min > width) continue
    for (const r of c.rules) {
      const one = Number(/data-one-row='(\d+)'/.exec(r.selector)?.[1])
      const two = Number(/data-two-rows='(\d+)'/.exec(r.selector)?.[1])
      if (one !== fit.one && two !== fit.two) continue
      const d = declsOf(r)
      if (d['--cols'] !== undefined) out.cols = d['--cols']
      if (d['--hero'] !== undefined) out.hero = d['--hero']
    }
  }
  return out
}
const ONE_ROW = { cols: 'var(--n)', hero: 'auto' }
const TWO_ROWS = { cols: 'var(--half)', hero: 'span 2 / auto' }

describe('a phone', () => {
  it('keeps the cards beside the table, wrapping above it, the total a row of its own', () => {
    expect(phone('.hub')).toMatchObject({ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'flex-start', gap: '20px' })
    expect(phone('.cardsBox')).toMatchObject({ flex: '1 1 260px', 'min-width': '0' })
    expect(phone('.cards')).toMatchObject({ display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(168px, 1fr))', gap: '10px' })
    expect(phone(".cards[data-wide='true']")['grid-template-columns']).toBe('repeat(auto-fill, minmax(220px, 1fr))')
    expect(phone('.hero')['grid-area']).toBe('auto / 1 / auto / -1')
    expect(phone('.cardName')['white-space']).toBe('nowrap')
    expect(phone('.cardSub')['white-space']).toBe('nowrap')
  })

  it('never meets the row: the cards’ box is a container on a desktop only', () => {
    css.walkDecls(/^container/, (d) => {
      expect(d.parent?.parent).toBe(desktop[0])
    })
    for (const m of atRules('media', /max-width: 767px/)) {
      for (const r of rulesIn(m)) expect(r.selector).not.toMatch(/\.(hub|cards|cardsBox|hero|card\w*)\b/)
    }
  })
})

describe('a desktop', () => {
  it('puts the table under the cards at the hub’s whole width', () => {
    expect(desktop).toHaveLength(1)
    expect(declsOf(ruleFor(desktop[0], '.hub'))).toMatchObject({ display: 'grid', 'grid-template-columns': 'minmax(0, 1fr)' })
    expect(declsOf(ruleFor(desktop[0], '.cardsBox')).container).toBe('hub-cards / inline-size')
  })

  it('lays the row out as the total at 1.6 cards and a column a card, the notice under it', () => {
    expect(declsOf(ruleFor(desktop[0], '.cards'))).toMatchObject({
      '--row': 'minmax(0, 1.6fr) repeat(var(--cols), minmax(0, 1fr))',
      'grid-auto-flow': 'row dense',
    })
    expect(declsOf(ruleFor(css, '.cards'))['grid-template-columns']).toMatch(/^var\(--row, /)
    expect(declsOf(ruleFor(css, ".cards[data-wide='true']"))['grid-template-columns']).toMatch(/^var\(--row, /)
    expect(declsOf(ruleFor(css, '.hero'))['grid-area']).toMatch(/^var\(--hero, /)
    expect(declsOf(ruleFor(css, '.notice'))['grid-column']).toBe('1 / -1')
  })

  it('wraps a card’s name and line rather than cutting them; the figure stays whole on its line', () => {
    expect(declsOf(ruleFor(desktop[0], '.cardName, .cardSub'))['white-space']).toBe('normal')
    expect(declsOf(ruleFor(desktop[0], '.card'))['align-content']).toBe('space-between')
    expect(declsOf(ruleFor(css, '.cardAmount'))['white-space']).toBe('nowrap')
  })

  it.each([2, 3, 4, 5, 6, 7, 8, 9])('measures step %i at 280px + 185px a step: a row of that many cards 175px wide, the total 1.6 of them', (step) => {
    const width = 185 * step + 280
    expect((width - 10 * step) / (step + 1.6)).toBeCloseTo(175)
    expect(rowAt({ one: step, two: 1 }, width)).toEqual(ONE_ROW)
    expect(rowAt({ one: step, two: 1 }, width - 1)).toEqual({})
    expect(rowAt({ one: 99, two: step }, width)).toEqual(TWO_ROWS)
    expect(rowAt({ one: 99, two: step }, width - 1)).toEqual({})
    // Where both fit, the one row.
    expect(rowAt({ one: step, two: step - 1 }, width)).toEqual(ONE_ROW)
  })

  it('on the user’s screen (a hub 1613px wide): Payments’ 7 cards in a row, Invoices’ 8 in two, the Allocator’s long figures in a row', () => {
    const payments = cardRowFit(['RM 6,818,165.79', 'RM 0.00', 'RM 34,502.60', 'RM 0.00', 'RM 6,486,252.88', 'RM 297,410.31', 'RM 484,543.72'], 'RM 805,786.16')
    const invoices = cardRowFit(['RM 412,377.20', 'RM 98,120.00', 'RM 301,457.20', 'RM 12,800.00', 'RM 4,200.00', '−RM 1,720.40', 'RM 186,000.00', 'RM 3,412.55'], 'RM 412,377.20')
    const allocator = cardRowFit(['RM 23,456.78 to bill', 'RM 62,955.52 billed', '41 active', '6 / 9 companies'], 'RM 86,412.30')
    expect(rowAt(payments, 1613)).toEqual(ONE_ROW)
    expect(rowAt(invoices, 1613)).toEqual(TWO_ROWS)
    expect(rowAt(allocator, 1613)).toEqual(ONE_ROW)
    // A laptop's hub (1054px): the Allocator's figures would not fit a row of four, so two rows.
    expect(rowAt(allocator, 1054)).toEqual(TWO_ROWS)
  })
})
