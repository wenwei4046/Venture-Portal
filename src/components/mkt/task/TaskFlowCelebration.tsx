'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { Celebration } from '@/lib/marketing/flow'
import Tip from '../ui/Tip'
import c from './celebrate.module.css'

// The celebration (Task Flow.dc.html › art): when the last approval passes, the whole page is covered — 🎆 Fireworks,
// 🍻 Cheers, 🎬 Movie night, 🎉 Confetti, or the template's own GIF — with the title and "{team} each get +60 XP".
// A click anywhere closes it. The pieces' positions are the prototype's (a fixed pseudo-random spread).

const TITLE: Record<Celebration, string> = {
  fireworks: 'Shipped! 🎆', cheers: 'Cheers, team! 🍻', movie: 'Movie night unlocked 🎬', confetti: 'Done and dusted! 🎉', custom: 'Done! 🎉',
}
const COLS = ['var(--mk-celeb-c1)', 'var(--mk-celeb-c2)', 'var(--mk-celeb-c3)', 'var(--mk-celeb-c4)', 'var(--mk-celeb-c5)', 'var(--mk-celeb-c6)']
const r = (i: number, n: number) => Math.abs((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1)
const v = (st: Record<string, string | number>) => st as CSSProperties

function art(kind: Celebration, gif: string | null): ReactNode[] {
  const kids: ReactNode[] = []
  if (kind === 'custom') {
    // eslint-disable-next-line @next/next/no-img-element
    if (gif) kids.push(<img key="gif" className={c.gif} src={gif} alt="" />)
    return kids
  }
  if (kind === 'fireworks') {
    ;([[22, 30, 0], [70, 22, 0.5], [48, 40, 1.0], [84, 44, 1.5], [14, 50, 1.9], [60, 18, 2.4]] as const).forEach(([x, y, d], b) => {
      kids.push(<div key={`u${b}`} className={`${c.abs} ${c.up}`} style={v({ left: `${x}%`, background: COLS[b % 5], '--up': `-${100 - y}vh`, animationDelay: `${d}s` })} />)
      for (let i = 0; i < 18; i += 1) {
        const a = (i / 18) * Math.PI * 2
        const R = 80 + r(i, b) * 50
        const col = COLS[(b + i) % 5]
        kids.push(<div key={`${b}-${i}`} className={`${c.abs} ${c.spark}`} style={v({
          left: `${x}%`, top: `${y}%`, background: col, boxShadow: `0 0 8px ${col}`, '--dx': `${Math.cos(a) * R}px`, '--dy': `${Math.sin(a) * R + 30}px`,
          animationDelay: `${d + 0.5}s`,
        })} />)
      }
    })
  } else if (kind === 'confetti') {
    for (let i = 0; i < 90; i += 1) {
      kids.push(<div key={i} className={`${c.abs} ${c.confetti}`} style={v({
        left: `${r(i, 1) * 100}%`, width: 7 + r(i, 2) * 6, height: 10 + r(i, 3) * 8, background: COLS[i % 6], '--fall': `${60 + r(i, 4) * 50}vh`,
        '--rot': `${360 + r(i, 5) * 720}deg`, animationDuration: `${1.8 + r(i, 6) * 1.6}s`, animationDelay: `${r(i, 7) * 0.8}s`,
      })} />)
    }
    kids.push(<div key="pop" className={`${c.abs} ${c.pop}`}>🎉</div>)
  } else if (kind === 'cheers') {
    kids.push(<div key="l" className={`${c.abs} ${c.mugL}`}>🍺</div>, <div key="r" className={`${c.abs} ${c.mugR}`}>🍺</div>, <div key="s" className={`${c.abs} ${c.shine}`}>✨</div>)
    for (let i = 0; i < 26; i += 1) {
      const size = 6 + r(i, 2) * 10
      kids.push(<div key={`b${i}`} className={`${c.abs} ${c.bubble}`} style={v({
        left: `${30 + r(i, 1) * 40}%`, width: size, height: size, animationDuration: `${1.6 + r(i, 3) * 1.4}s`, animationDelay: `${r(i, 4) * 2}s`,
      })} />)
    }
  } else {
    kids.push(<div key="beam" className={`${c.abs} ${c.beam}`} />, <div key="clap" className={`${c.abs} ${c.clap}`}>🎬</div>)
    for (let i = 0; i < 40; i += 1) {
      kids.push(<div key={`p${i}`} className={`${c.abs} ${c.corn}`} style={v({
        left: `${r(i, 1) * 100}%`, fontSize: 18 + r(i, 2) * 14, '--fall': `${70 + r(i, 3) * 30}vh`, '--rot': `${r(i, 4) * 360}deg`,
        animationDuration: `${2.2 + r(i, 5) * 1.5}s`, animationDelay: `${0.6 + r(i, 6) * 1.6}s`,
      })}>🍿</div>)
    }
  }
  return kids
}

export default function TaskFlowCelebration({ kind, gif, category, finished, team, onClose }: {
  kind: Celebration
  /** The custom GIF's address (the bucket's file route). */
  gif: string | null
  category: string
  finished: string | null
  team: string
  onClose: () => void
}) {
  const k: Celebration = kind === 'custom' && !gif ? 'fireworks' : kind
  const dark = k === 'movie' || k === 'fireworks'
  return (
    <Tip text="Click anywhere to close">
    <button type="button" className={`${c.overlay} ${k === 'movie' ? c.movie : k === 'fireworks' ? c.night : c.light}${dark ? ` ${c.dark}` : ''}`}
      aria-label="Close the celebration" onClick={onClose} data-testid="tf-celebration">
      <div className={c.art}>{art(k, gif)}</div>
      <div className={c.words}>
        <span className={c.wTitle}>{TITLE[k]}</span>
        <span className={c.wText}>{category} is done{finished ? ` · finished ${finished}` : ''}.{team ? ` ${team} each get +60 XP.` : ''}</span>
      </div>
    </button>
    </Tip>
  )
}
