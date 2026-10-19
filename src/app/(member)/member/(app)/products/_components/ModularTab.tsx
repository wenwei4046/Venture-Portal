'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isRiderModel, leadNameOf, RIDER } from '@/lib/catalogue/options'
import { useProductShell } from '@/components/member/app/product-shell'
import type { BrandRef, CatalogueModel, MaintenanceOption } from '../load'
import ModelEditor, { type ModelLeave } from './ModelEditor'
import { boardOrder, modularBoard } from './modular-board'
import { ActionRow, categoryLabel, Chip, ChipRow, Controls, FilterPanel, Notice, orderedCategories, plural, SearchField, SelectField } from './ui'
import c from './products.module.css'

type Show = 'all' | 'offered' | 'not-offered' | 'new'

const SHOW_OPTIONS = [
  ['all', 'All models'],
  ['offered', 'Offered'],
  ['not-offered', 'Not offered'],
  ['new', 'New models or SKUs'],
] as const

/**
 * ERP models, one card each, grouped by category the way the ERP's own
 * Modular page is, and inside a category by branding (`modularBoard`). The
 * board grows with its cards and the page scrolls it (`productTabScroll`). A
 * card opens the model in a floating window. Prices stay on SKU Master,
 * Maintenance and Combo Pricing.
 */
export default function ModularTab({ models, brands, options }: {
  models: CatalogueModel[]
  brands: BrandRef[]
  options: MaintenanceOption[]
}) {
  const shell = useProductShell()
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The open window holds unsaved changes: a card clicked meanwhile asks through its guard.
  const [editorDirty, setEditorDirty] = useState(false)
  const requestLeave = useRef<((leave: ModelLeave) => void) | null>(null)

  const live = useMemo(() => models.filter(m => !m.removed), [models])
  const categories = useMemo(() => orderedCategories(live.map(m => m.category)), [live])
  /** The filtered models, category by category and branding by branding. */
  const board = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = live.filter(m => {
      if (category !== null && (m.category ?? '').toUpperCase() !== category) return false
      if (show === 'offered' && !m.offered) return false
      if (show === 'not-offered' && m.offered) return false
      if (show === 'new' && !m.isNew && !m.skus.some(s => s.isNew && !s.removed)) return false
      return !q || [m.code, m.name, m.erpName, m.brand, m.branding, ...m.skus.map(s => s.code)]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
    return modularBoard(matching, categories, brands)
  }, [live, categories, brands, category, query, show])
  /** The same models in the order they are drawn — what ‹ › steps through. */
  const shown = useMemo(() => boardOrder(board), [board])
  // Deliberately independent of the filters: searching never unmounts an unsaved window.
  const selected = models.find(m => m.erpId === open)
  const index = selected ? shown.findIndex(m => m.erpId === selected.erpId) : -1

  const step = useCallback((dir: -1 | 1) => {
    const next = shown[index + dir]
    if (next) setOpen(next.erpId)
  }, [shown, index])

  // A right-hand panel of the app opened: the window makes way, unless it holds unsaved changes.
  useEffect(() => {
    if (shell.shift && open && !editorDirty) setOpen(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the panel opens
  }, [shell.shift])

  function openModel(id: string) {
    shell.closePanels()
    setOpen(id)
    setNotice(null)
  }
  function openCard(id: string) {
    if (id === open) return
    if (open && editorDirty && requestLeave.current) requestLeave.current({ kind: 'open', id })
    else openModel(id)
  }

  return (
    <>
      <FilterPanel>
        <ChipRow ariaLabel="Model categories">
          <Chip on={category === null} onClick={() => setCategory(null)}>All</Chip>
          {categories.map(k => <Chip key={k} on={category === k} onClick={() => setCategory(k)}>{categoryLabel(k)}</Chip>)}
        </ChipRow>
        <Controls ruled>
          <SearchField value={query} onChange={setQuery} placeholder="Search model, name, brand or SKU…" label="Search models" />
          <SelectField label="Show" value={show} onChange={v => setShow(v as Show)} options={SHOW_OPTIONS} />
        </Controls>
      </FilterPanel>

      <ActionRow count={shown.length.toLocaleString()} rest={`models${category ? ` · ${categoryLabel(category)}` : ''}`}>
        <span className={c.hint}>Open a model to set what the Quote may offer of it.</span>
      </ActionRow>
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className={c.board} role="region" aria-label="Models">
        {board.map(cat => {
          const name = cat.category ? categoryLabel(cat.category) : 'Uncategorised'
          return (
            <section key={cat.category || 'none'} className={c.boardSection} aria-label={`${name} models`}>
              <h3 className={c.boardHead}>
                <span className={c.boardChip}>{name}</span>
                <span className={c.boardCount}>{plural(cat.count, 'model')}</span>
              </h3>
              {cat.groups.map(g => (
                <div key={g.branding?.key ?? ''} className={c.brandGroup}
                  role={cat.branded ? 'group' : undefined} aria-label={cat.branded ? `${name} · ${g.branding?.label ?? 'No branding'}` : undefined}>
                  {cat.branded ? (
                    <h4 className={c.brandHead} data-none={g.branding === null || undefined}>
                      <span className={c.brandDash} aria-hidden="true" />
                      <span className={c.brandLabel}>{g.branding?.label ?? 'NO BRANDING'}</span>
                      <span className={c.brandCount}>{plural(g.models.length, 'model')}</span>
                      <span className={c.brandRule} aria-hidden="true" />
                    </h4>
                  ) : null}
                  <div className={c.cards}>
                    {g.models.map(m => <ModelCard key={m.erpId} model={m} brands={brands} open={m.erpId === open} onOpen={() => openCard(m.erpId)} />)}
                  </div>
                </div>
              ))}
            </section>
          )
        })}
        {board.length === 0 ? <p className={c.boardEmpty}>No models match these filters.</p> : null}
      </div>

      <ModelEditor
        model={selected ?? null}
        brands={brands}
        options={options}
        position={index === -1 ? null : { index, total: shown.length }}
        onClose={() => setOpen(null)}
        onStep={step}
        onOpen={openModel}
        onDirtyChange={setEditorDirty}
        onSaved={setNotice}
        requestRef={requestLeave}
      />
    </>
  )
}

function ModelCard({ model: m, brands, open, onOpen }: { model: CatalogueModel; brands: BrandRef[]; open: boolean; onOpen: () => void }) {
  const activeSkus = m.skus.filter(s => !s.removed && s.active)
  const ticked = activeSkus.filter(s => s.offered).length
  // The ladder by its brand's own name (Akemi, Dunlopillo), as the register spells it.
  const ladder = m.brand && m.brand !== RIDER ? brands.find(b => b.code === m.brand)?.name ?? m.brand
    : isRiderModel(m.category, m.brandOverride) ? 'Rider' : 'No ladder'
  const flag = !m.active ? 'Inactive' : m.isNew ? 'New model' : m.skus.some(s => s.isNew && !s.removed) ? 'New SKU' : null
  // A named sofa leads with its name, its code under it (2026-10-19); everything else leads with its code.
  const lead = leadNameOf(m.category, m.code, m.name)
  const second = lead ? m.code : m.name && m.name !== m.code ? m.name : null
  return (
    <button type="button" className={c.card} data-offered={m.offered} data-open={open} aria-label={`Configure ${m.code}`} onClick={onOpen}>
      <span className={c.cardTop}>
        <strong className={c.cardCode}>{lead ?? m.code}</strong>
        <span className={c.cardState}>{m.offered ? 'Offered' : 'Not offered'}</span>
      </span>
      {second ? <span className={c.cardName}>{second}</span> : null}
      <span className={c.cardMeta}>
        <span>{ladder}</span>
        <span>{ticked} / {plural(activeSkus.length, 'SKU')}</span>
        {flag ? <span className={c.cardFlag}>{flag}</span> : null}
      </span>
    </button>
  )
}

