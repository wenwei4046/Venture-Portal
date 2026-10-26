'use client'

import type { ReactNode } from 'react'
import {
  ACCENT_NAMES, ACCENTS, addable, BG_NAMES, BGS, CORNER_NAMES, CORNERS, TILES, type SpaceTheme, type TileKind, type TilePlace,
} from '@/lib/marketing/space'
import s from './myspace.module.css'

// Edit layout's drawer (`My Space Bento.dc.html`): its two tabs — **✥ Layout**: *Add a tile* (the kinds not on the
// board), *Page background*, *Accent*, *Tile corners*, *Reset layout and theme*; **🎨 Room & pet** (RoomDrawerTab) —
// and *Done*.

export type DrawerTab = 'layout' | 'room'

export interface SpaceDrawerProps {
  tab: DrawerTab
  onTab: (tab: DrawerTab) => void
  /** The Room & pet tab's content, and its name (🎨 Room & pet, or 🎨 Room for a space with no pet). */
  room: ReactNode
  roomLabel: string
  layout: TilePlace[]
  theme: SpaceTheme
  onAdd: (kind: TileKind) => void
  onTheme: (theme: SpaceTheme) => void
  onReset: () => void
  onDone: () => void
}

export default function SpaceDrawer(p: SpaceDrawerProps) {
  const add = addable(p.layout)
  const { theme } = p
  const tabs: [DrawerTab, string][] = [['layout', '✥ Layout'], ['room', p.roomLabel]]
  return (
    <aside className={s.drawer} aria-label="Edit layout">
      <div className={s.tabs} role="tablist" aria-label="Edit layout">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={p.tab === k} className={s.tab} onClick={() => p.onTab(k)}>{label}</button>
        ))}
      </div>
      {p.tab === 'room' ? p.room : <LayoutTab {...p} add={add} theme={theme} />}
      <button type="button" className={s.doneBtn} onClick={p.onDone}>Done</button>
    </aside>
  )
}

function LayoutTab(p: SpaceDrawerProps & { add: TileKind[] }) {
  const { add, theme } = p
  return (
    <>
      <div>
        <div className={s.drawerHead}>Add a tile</div>
        {add.length ? (
          <div className={s.addGrid}>
            {add.map(k => (
              <button key={k} type="button" className={s.addTile} onClick={() => p.onAdd(k)}>
                <span aria-hidden="true">{TILES[k].emoji}</span>
                {TILES[k].label}
              </button>
            ))}
          </div>
        ) : (
          <div className={s.drawerNone}>Every tile is already on your space.</div>
        )}
      </div>
      <div>
        <div className={s.drawerHead}>Page background</div>
        <div className={s.swatches} role="radiogroup" aria-label="Page background">
          {BGS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={theme.bg === k} aria-label={BG_NAMES[k]} title={BG_NAMES[k]}
              className={s.bgOpt} data-bg={k} onClick={() => p.onTheme({ ...theme, bg: k })} />
          ))}
        </div>
      </div>
      <div>
        <div className={s.drawerHead}>Accent</div>
        <div className={s.accents} role="radiogroup" aria-label="Accent">
          {ACCENTS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={theme.accent === k} aria-label={ACCENT_NAMES[k]} title={ACCENT_NAMES[k]}
              className={s.accentOpt} data-accent={k} onClick={() => p.onTheme({ ...theme, accent: k })} />
          ))}
        </div>
      </div>
      <div>
        <div className={s.drawerHead}>Tile corners</div>
        <div className={s.seg} role="radiogroup" aria-label="Tile corners">
          {CORNERS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={theme.corners === k} className={s.segOpt}
              onClick={() => p.onTheme({ ...theme, corners: k })}>
              {CORNER_NAMES[k]}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className={s.reset} onClick={p.onReset}>Reset layout and theme</button>
    </>
  )
}
