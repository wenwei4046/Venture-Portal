import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { paintStatusBar, resolveColor, topColorOf, useStatusBar } from './status-bar'

// The phone's status bar in the colour of the page under it (2026-10-17 — the owner, the strip above the CRM's Profile on
// an iPhone: "for the top bar, should be same colour with the apps. with all tab as well").
const metas = () => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(m => m.content)
beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">'
  document.documentElement.removeAttribute('style')
  document.body.removeAttribute('style')
})
afterEach(() => { paintStatusBar(null); document.body.innerHTML = '' })

describe('the status bar', () => {
  it('takes the colour asked for — the theme-color and the page behind (iOS 26 reads the background)', () => {
    paintStatusBar('#FBF7F3')
    expect(metas()).toEqual(['#FBF7F3'])
    expect(document.documentElement.style.backgroundColor).not.toBe('')
    expect(document.body.style.backgroundColor).toBe(document.documentElement.style.backgroundColor)
  })

  it('gives the page its own back when the screen goes', () => {
    paintStatusBar('#F6B48A')
    paintStatusBar('#FFFFFF')
    paintStatusBar(null)
    expect(metas()).toEqual(['#ffffff'])
    expect(document.documentElement.style.backgroundColor).toBe('')
    expect(document.body.style.backgroundColor).toBe('')
  })

  it('leaves a colour the page set since (a new route\'s own) as it is', () => {
    paintStatusBar('#F6B48A')
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = '#f8f5f0'
    paintStatusBar(null)
    expect(metas()).toEqual(['#f8f5f0'])
  })

  it('every theme-color the page has (light and dark), and one where it has none', () => {
    document.head.innerHTML = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="rgb(222 215 202)"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="rgb(48 42 35)">'
    paintStatusBar('#FFFFFF')
    expect(metas()).toEqual(['#FFFFFF', '#FFFFFF'])
    paintStatusBar(null)
    expect(metas()).toEqual(['rgb(222 215 202)', 'rgb(48 42 35)'])
    document.head.innerHTML = ''
    paintStatusBar('#FFFFFF')
    expect(metas()).toEqual(['#FFFFFF'])
  })

  it('reads a Revenue app colour off its root; nothing to read paints nothing', () => {
    document.body.innerHTML = '<div data-revenue-app style="--rv-peach: #F6B48A"></div>'
    expect(resolveColor('var(--rv-peach)')).toBe('#F6B48A')
    expect(resolveColor('#123456')).toBe('#123456')
    paintStatusBar('var(--rv-none)')
    expect(metas()).toEqual(['#ffffff'])
  })

  it("a screen's top colour: the first colour of a strip drawn as a gradient, else its background colour", () => {
    const panel = document.createElement('div')
    panel.style.backgroundImage = 'linear-gradient(rgb(251, 247, 243), rgb(251, 247, 243))'
    panel.style.backgroundColor = 'rgb(255, 255, 255)'
    const mine = document.createElement('div')
    mine.style.backgroundColor = 'rgb(255, 255, 255)'
    document.body.append(panel, mine)
    expect(topColorOf(panel)).toBe('rgb(251, 247, 243)')
    expect(topColorOf(mine)).toBe('rgb(255, 255, 255)')
  })

  it('a screen paints it while on, not while off, and gives it back when it goes', () => {
    const { rerender, unmount } = renderHook(({ c, on }) => useStatusBar(c, on), { initialProps: { c: '#F6B48A', on: true } })
    expect(metas()).toEqual(['#F6B48A'])
    rerender({ c: '#FFFFFF', on: false })
    expect(metas()).toEqual(['#F6B48A'])
    rerender({ c: '#FFFFFF', on: true })
    expect(metas()).toEqual(['#FFFFFF'])
    unmount()
    expect(metas()).toEqual(['#ffffff'])
  })
})
