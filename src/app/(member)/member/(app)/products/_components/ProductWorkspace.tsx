'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useProductShell } from '@/components/member/app/product-shell'
import type { ProductTab } from './ProductListTabs'
import c from './products.module.css'

/**
 * How a tab scrolls. SKU Master, Combo Pricing and Costing gaps are wide
 * sheets: a window of their own (560px, the prototype's `maxH`) that you drag
 * both ways. Modular and Maintenance only ever grow downward, so they grow
 * with the page and the page's own scrollbar moves them, the way the ERP's
 * Products page does (user 2026-09-27) — and so does Costing Setting.
 */
export function productTabScroll(tab: ProductTab): 'page' | 'window' {
  return tab === 'modular' || tab === 'maintenance' || tab === 'costing' ? 'page' : 'window'
}

type DraftState = { changes: number; saving: boolean }
const CLEAN: DraftState = { changes: 0, saving: false }

/** Somewhere to go that throws the drafts away: another tab, another sub-department. */
export interface Leave {
  /** What the guard bar says it opens: "Modular", "IR", "SKU Master". */
  label: string
  go: () => void
}

interface Workspace extends DraftState {
  dirty: boolean
  setDraftState: (state: DraftState) => void
  /** Leave at once when nothing is unsaved; else the bar under the tabs asks first. */
  requestLeave: (leave: Leave) => void
  /** The leave the bar is asking about, if any. */
  leave: Leave | null
  keepEditing: () => void
  /** Where a floating window (a model, a new combo) is drawn, over the list. */
  overlayHost: HTMLElement | null
  /** While a window is open the list behind it takes no input. */
  setOverlayOpen: (open: boolean) => void
}

const WorkspaceContext = createContext<Workspace>({
  ...CLEAN,
  dirty: false,
  setDraftState: () => {},
  requestLeave: leave => leave.go(),
  leave: null,
  keepEditing: () => {},
  overlayHost: null,
  setOverlayOpen: () => {},
})

/**
 * One active tab owns its drafts — `changes` is how many there are (the
 * prototype's `dirty()`: a SKU, an option price, a combo, a tick, an add or a
 * removal) — and the workspace protects every way off the page.
 */
export function useProductDraftGuard(changes: number, saving: boolean) {
  const { setDraftState } = useContext(WorkspaceContext)
  useEffect(() => {
    setDraftState({ changes, saving })
    return () => setDraftState(CLEAN)
  }, [changes, saving, setDraftState])
}

export function useProductDraftState() {
  return useContext(WorkspaceContext)
}

/**
 * The Product List's page inside the Revenue app: a frame the size of the
 * app's column that scrolls inside itself (`data-page-scroll`), with the
 * windows drawn over it. Unsaved changes are guarded three ways — a link or a
 * reload asks the browser's question, the app's own screens ask before the app
 * leaves (`ProductShell.setDraft`), and a tab or sub-department switch asks in
 * the bar under the tabs.
 */
export default function ProductWorkspace({ tab = 'sku', children }: { tab?: ProductTab; children: ReactNode }) {
  const [draftState, setDraftState] = useState<DraftState>(CLEAN)
  const [leave, setLeave] = useState<Leave | null>(null)
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const shell = useProductShell()
  const dirty = draftState.changes > 0

  // The app asks before it leaves for one of its own screens.
  useEffect(() => {
    shell.setDraft({ dirty, saving: draftState.saving })
  }, [shell, dirty, draftState.saving])
  useEffect(() => () => shell.setDraft({ dirty: false, saving: false }), [shell])
  // Nothing left to lose: a question still on screen has nothing to ask.
  useEffect(() => {
    if (!dirty) setLeave(null)
  }, [dirty])

  useEffect(() => {
    if (!dirty && !draftState.saving) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const beforeLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      if (target.href === window.location.href || target.getAttribute('href')?.startsWith('#')) return
      if (draftState.saving || !window.confirm('Discard your unsaved Product List changes and leave this page?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', beforeLink, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', beforeLink, true)
    }
  }, [dirty, draftState.saving])

  const requestLeave = useCallback((next: Leave) => {
    if (draftState.saving) return
    if (dirty) setLeave(next)
    else next.go()
  }, [dirty, draftState.saving])
  const keepEditing = useCallback(() => setLeave(null), [])

  const value = useMemo<Workspace>(() => ({
    ...draftState,
    dirty,
    setDraftState,
    requestLeave,
    leave,
    keepEditing,
    overlayHost,
    setOverlayOpen,
  }), [draftState, dirty, requestLeave, leave, keepEditing, overlayHost])

  return (
    <WorkspaceContext.Provider value={value}>
      <div className={c.root} data-shift={shell.shift || undefined} data-scroll={productTabScroll(tab)}>
        <div className={c.scroll} data-page-scroll="" inert={overlayOpen || undefined}>
          <div className={c.column}>{children}</div>
        </div>
        <div ref={setOverlayHost} />
      </div>
    </WorkspaceContext.Provider>
  )
}
