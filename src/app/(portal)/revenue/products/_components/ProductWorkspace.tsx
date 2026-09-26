'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ProductTab } from './ProductListTabs'

/**
 * How a tab scrolls. SKU Master and Combo Pricing are wide sheets: a window
 * fixed to the screen that you drag both ways. Modular and Maintenance only
 * ever grow downward, so they grow with the page and its own scrollbar moves
 * them, the way the ERP's Products page does (user 2026-09-27).
 */
export function productTabScroll(tab: ProductTab): 'page' | 'window' {
  return tab === 'modular' || tab === 'maintenance' ? 'page' : 'window'
}

type DraftState = { dirty: boolean; saving: boolean }
const CLEAN: DraftState = { dirty: false, saving: false }
const DraftContext = createContext<DraftState & { setDraftState: (state: DraftState) => void }>({
  ...CLEAN,
  setDraftState: () => {},
})

/** One active tab owns its drafts; the workspace protects navigation away. */
export function useProductDraftGuard(dirty: boolean, saving: boolean) {
  const { setDraftState } = useContext(DraftContext)
  useEffect(() => {
    setDraftState({ dirty, saving })
    return () => setDraftState(CLEAN)
  }, [dirty, saving, setDraftState])
}

export function useProductDraftState() {
  return useContext(DraftContext)
}

export default function ProductWorkspace({ tab = 'sku', children }: { tab?: ProductTab; children: ReactNode }) {
  const [draftState, setDraftState] = useState<DraftState>(CLEAN)

  useEffect(() => {
    if (!draftState.dirty && !draftState.saving) return
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
  }, [draftState])

  return (
    <DraftContext.Provider value={{ ...draftState, setDraftState }}>
      <div className="product-page product-page-workspace" data-scroll={productTabScroll(tab)}>{children}</div>
    </DraftContext.Provider>
  )
}
