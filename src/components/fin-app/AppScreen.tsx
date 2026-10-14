'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useChrome, useFrame } from './FinAppFrame'
import { keepScroll, peekIntent, scrollOf, takeIntent, type Intent } from './nav'
import s from './fin-app.module.css'

// One screen of the Finance phone app (2026-10-15, the Finance revamp v2's
// phone — README §1 and › Motion, `Finance Mobile App.dc.html`): the head (a
// tab's root: the H tile, *HOUZS Venture · Finance* and the title; pushed:
// iOS's "‹ Payments" with the title centred, Android's ← with it on the left;
// a hub: none — its top tabs fill to the status bar), the page that scrolls,
// and what stands over its foot — the action bar, or Invoices' dark bulk bar.
// The page plays in as the move into it says (`nav.ts`), and Back puts it
// where it was left.

export interface BarButton {
  key: string
  label: string
  kind?: 'primary' | 'secondary' | 'danger' | 'more'
  onClick?: () => void
  /** A page to go to instead. */
  href?: string
  disabled?: boolean
  /** Drawn pale while what it needs is missing (it still says why when pressed). */
  off?: boolean
}

export interface HeadAction {
  key: string
  label: string
  onClick?: () => void
  /** A file to open in its own tab (a PDF). */
  href?: string
}

export type ScreenHead =
  | { kind: 'root'; title: string }
  | { kind: 'back'; title: string; backLabel: string; onBack: () => void }
  | { kind: 'bare' }

export interface TopTab {
  key: string
  label: string
  href: string
  current: boolean
  /** Before it goes: which way the next hub plays in. */
  onPress?: () => void
}

export interface BulkBar {
  text: string
  sub: string
  label: string
  off?: boolean
  onClear: () => void
  onGo: () => void
}

type Anim = Intent | 'in' | 'none'

/** The prototype's raf(): two animation frames, or 80ms, whichever comes first. */
function nextPaint(fn: () => void): () => void {
  let done = false
  const run = () => {
    if (done) return
    done = true
    fn()
  }
  let inner = 0
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(run)
  })
  const t = setTimeout(run, 80)
  return () => {
    done = true
    cancelAnimationFrame(outer)
    cancelAnimationFrame(inner)
    clearTimeout(t)
  }
}

export default function AppScreen({
  screenKey,
  head,
  actions = [],
  topTabs = null,
  bar = [],
  bulk = null,
  root = false,
  onSwipe,
  children,
}: {
  /** Names what is on screen (its address): a new one plays in, and Back finds where it was left. */
  screenKey: string
  head: ScreenHead
  actions?: HeadAction[]
  topTabs?: TopTab[] | null
  bar?: BarButton[]
  bulk?: BulkBar | null
  /** A tab's root: the tab bar stands at its foot. */
  root?: boolean
  /** A hub's sideways swipe (60px, the README): to the next or the previous top tab. */
  onSwipe?: (way: 'next' | 'prev') => void
  children: ReactNode
}) {
  const { platform } = useFrame()
  useChrome({ root, bar: bar.length > 0 && !bulk, bulk: !!bulk })

  const scroller = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [anim, setAnim] = useState<Anim>(() => peekIntent() ?? 'none')
  const shownKey = useRef(screenKey)

  // First drawn: the move into it is used up, Back's place is put back, then it plays in.
  useLayoutEffect(() => {
    const how = takeIntent()
    const el = scroller.current
    if (el && how === 'pop') el.scrollTop = scrollOf(screenKey)
    if (how === null) return
    return nextPaint(() => setAnim('in'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Another screen of the same page (a list, a record): the same.
  useLayoutEffect(() => {
    if (shownKey.current === screenKey) return
    shownKey.current = screenKey
    const how = takeIntent() ?? 'push'
    const el = scroller.current
    if (el) el.scrollTop = how === 'pop' ? scrollOf(screenKey) : 0
    setScrolled((el?.scrollTop ?? 0) > 4)
    setAnim(how)
    return nextPaint(() => setAnim('in'))
  }, [screenKey])

  const press = useRef<{ x: number; y: number } | null>(null)
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    press.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    press.current = null
    if (!p || !onSwipe) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return
    onSwipe(dx < 0 ? 'next' : 'prev')
  }

  return (
    <div className={s.screen}>
      <div className={s.head} data-scrolled={scrolled ? 'true' : 'false'} data-bare={head.kind === 'bare' ? 'true' : undefined}>
        <div className={s.headRow}>
          {head.kind === 'root' ? (
            <span className={s.rootTitle}>
              <span className={s.hTile} aria-hidden="true">
                H
              </span>
              <span className={s.rootText}>
                <span className={s.rootKicker}>HOUZS Venture · Finance</span>
                <span className={s.rootName}>{head.title}</span>
              </span>
            </span>
          ) : head.kind === 'back' ? (
            platform === 'ios' ? (
              <>
                <button type="button" className={s.backIos} onClick={head.onBack}>
                  <span className={s.backChevron} aria-hidden="true">
                    ‹
                  </span>
                  <span className={s.backLabel}>{head.backLabel}</span>
                </button>
                <span className={s.titleIos}>{head.title}</span>
              </>
            ) : (
              <>
                <button type="button" className={s.backAnd} onClick={head.onBack} aria-label={`Back to ${head.backLabel}`}>
                  ←
                </button>
                <span className={s.titleAnd}>{head.title}</span>
              </>
            )
          ) : null}
          <span className={s.grow} />
          {actions.map((a) =>
            a.href ? (
              <a key={a.key} href={a.href} target="_blank" rel="noopener noreferrer" className={s.headAct}>
                {a.label}
              </a>
            ) : (
              <button key={a.key} type="button" className={s.headAct} onClick={a.onClick}>
                {a.label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className={s.scrollBox}>
        <div
          ref={scroller}
          className={s.scroller}
          data-fin-scroller=""
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop
            keepScroll(screenKey, top)
            const past = top > 4
            if (past !== scrolled) setScrolled(past)
          }}
        >
          {topTabs ? (
            <div className={s.topTabs}>
              <div className={s.topTabsRow} role="tablist">
                {topTabs.map((t) => (
                  <Link key={t.key} href={t.href} className={s.topTab} aria-current={t.current ? 'page' : undefined} onClick={t.onPress}>
                    {t.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <div className={s.content} data-anim={anim === 'none' ? undefined : anim} onPointerDown={onSwipe ? onDown : undefined} onPointerUp={onSwipe ? onUp : undefined}>
            {children}
            <div className={s.foot24} />
          </div>
        </div>
      </div>

      {bulk ? (
        <div className={s.bulk}>
          <span className={s.bulkText}>
            <span className={s.bulkMain}>{bulk.text}</span>
            <span className={s.bulkSub}>{bulk.sub}</span>
          </span>
          <button type="button" className={s.bulkClear} onClick={bulk.onClear}>
            Clear
          </button>
          <button type="button" className={s.bulkGo} data-off={bulk.off ? 'true' : undefined} onClick={bulk.onGo}>
            {bulk.label}
          </button>
        </div>
      ) : bar.length > 0 ? (
        <div className={s.bar}>
          {bar.map((b) =>
            b.href ? (
              <Link key={b.key} href={b.href} className={s.barBtn} data-kind={b.kind && b.kind !== 'secondary' ? b.kind : undefined}>
                {b.label}
              </Link>
            ) : (
              <button
                key={b.key}
                type="button"
                className={s.barBtn}
                data-kind={b.kind && b.kind !== 'secondary' ? b.kind : undefined}
                data-off={b.off ? 'true' : undefined}
                disabled={b.disabled}
                aria-label={b.kind === 'more' ? 'More' : undefined}
                onClick={b.onClick}
              >
                {b.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

/** A pushed screen's head: the eyebrow (its numeral in the roman orange), the Newsreader title, the 48px rule. */
export function PageHead({ roman, eyebrow, title }: { roman: string; eyebrow: string; title: string }) {
  return (
    <div className={s.pageHead}>
      <div className={s.eyebrow}>
        <span className={s.eyebrowRoman}>{roman}</span> {eyebrow}
      </div>
      <h1 className={s.pageTitle}>{title}</h1>
      <div className={s.rule48} aria-hidden="true" />
    </div>
  )
}

export { s as appStyles }
