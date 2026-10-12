import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { placeMenu, shownEdges } from './menu-place'

// happy-dom lays nothing out, so every box here says where it is: the sheet that scrolls (from 0 to
// `sheetBottom`), the button's box at `buttonTop` (30px tall), and a menu `menuHeight` tall that sits 6px
// under that box — or, once turned over (`data-up`), 6px above it — as hiring.module.css places it.
const rect = (top: number, height: number) =>
  ({ top, bottom: top + height, height, left: 0, right: 220, width: 220, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

let sheet: HTMLElement
let anchor: HTMLElement
let menu: HTMLElement
const layout = { sheetBottom: 700, buttonTop: 300, menuHeight: 80 }

beforeEach(() => {
  document.body.innerHTML = '<main style="overflow-y: auto"><div class="rel"><button>+</button><div role="menu"></div></div></main>'
  sheet = document.querySelector('main')!
  anchor = document.querySelector('.rel')!
  menu = document.querySelector('[role="menu"]')!
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  Object.defineProperty(sheet, 'clientHeight', { configurable: true, get: () => layout.sheetBottom })
  sheet.getBoundingClientRect = () => rect(0, layout.sheetBottom)
  anchor.getBoundingClientRect = () => rect(layout.buttonTop, 30)
  menu.getBoundingClientRect = () =>
    menu.dataset.up === 'true'
      ? rect(layout.buttonTop - 6 - layout.menuHeight, layout.menuHeight)
      : rect(layout.buttonTop + 30 + 6, layout.menuHeight)
  menu.scrollIntoView = vi.fn()
})
afterEach(() => {
  document.body.innerHTML = ''
  Object.assign(layout, { sheetBottom: 700, buttonTop: 300, menuHeight: 80 })
})

describe('a menu at the foot of the page opens upward (2026-10-12)', () => {
  it('reads the room the sheet shows, not the whole window', () => {
    expect(shownEdges(menu)).toEqual({ top: 0, bottom: 700 })
  })

  it('stays under its button while it fits there', () => {
    placeMenu(menu)
    expect(menu.dataset.up).toBeUndefined()
    expect(menu.scrollIntoView).not.toHaveBeenCalled()
  })

  it("turns over when the sheet ends under it — the Candidates card's + at the bottom of a request", () => {
    layout.buttonTop = 640
    placeMenu(menu)
    expect(menu.dataset.up).toBe('true')
    expect(menu.scrollIntoView).not.toHaveBeenCalled()
  })

  it('goes back under its button when it is measured again with room below', () => {
    layout.buttonTop = 640
    placeMenu(menu)
    layout.buttonTop = 300
    placeMenu(menu)
    expect(menu.dataset.up).toBeUndefined()
  })

  it('a menu that grew (Change status ▸) is measured again and turns over', () => {
    layout.buttonTop = 520
    placeMenu(menu)
    expect(menu.dataset.up).toBeUndefined()
    layout.menuHeight = 260
    placeMenu(menu)
    expect(menu.dataset.up).toBe('true')
  })

  it('where neither side holds all of it, takes the roomier side and scrolls it into view', () => {
    Object.assign(layout, { sheetBottom: 200, buttonTop: 120, menuHeight: 150 })
    placeMenu(menu)
    expect(menu.dataset.up).toBe('true')
    expect(menu.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
