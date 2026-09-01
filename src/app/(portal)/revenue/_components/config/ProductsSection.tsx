'use client'

import { useMemo, useState, useTransition } from 'react'
import { bulkUpsertProducts, deleteProduct, upsertProduct } from '../../product-actions'
import { parseProductPaste } from '@/lib/commission/product-paste'
import {
  ActionButton,
  ActionForm,
  ErrorNote,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  SectionHead,
  Tick,
} from '@/components/RowForm'
import type { ProductRow } from './types'

/**
 * Revenue → Product List. Principal only.
 *
 * The one place cost enters the system. A product with no unit cost leaves
 * every line of it without cost, which leaves its bill without a margin — the
 * commission run then skips the below-margin penalty on it and says so. The
 * counter at the top makes that gap impossible to miss.
 */
export default function ProductsSection({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [showPaste, setShowPaste] = useState(false)

  const missing = products.filter(p => p.unit_cost === null).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter(p => (onlyMissing ? p.unit_cost === null : true))
      .filter(p =>
        !q ||
        p.item_code.toLowerCase().includes(q) ||
        (p.product_name ?? '').toLowerCase().includes(q) ||
        (p.brand_code ?? '').toLowerCase().includes(q),
      )
      .slice(0, 300)
  }, [products, query, onlyMissing])

  return (
    <div className="space-y-8">
      <section>
        <SectionHead
          title="Product list"
          count={`${products.length} PRODUCTS`}
          action={
            <button
              type="button"
              onClick={() => setShowPaste(v => !v)}
              className="text-sm text-accent hover:text-accent-hover font-serif italic"
            >
              {showPaste ? 'Cancel' : '+ Paste from a spreadsheet'}
            </button>
          }
        />
        <Hint>
          Cost is the only thing the ERP sales-order export does not carry, so it is keyed here. A
          product left without a cost has no margin, and the commission run will skip the
          below-margin penalty on every bill containing it rather than guess. While this list is
          being filled, a margin can be typed straight onto a sales order instead — that always
          wins over anything derived here.
        </Hint>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="border border-hairline rounded-md bg-surface px-4 py-3">
            <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">
              Missing a cost
            </div>
            <div className={`num text-lg ${missing > 0 ? 'text-danger' : 'text-num-ink'}`}>
              {missing}
            </div>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search item code, name or brand"
            aria-label="Search products"
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink w-72 focus:outline-none focus:border-accent-border"
          />
          <label className="inline-flex items-center gap-2 text-sm font-sans text-graphite">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={e => setOnlyMissing(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Only those without a cost
          </label>
        </div>

        {showPaste ? <PasteBox onDone={() => setShowPaste(false)} /> : null}
      </section>

      <section>
        <div className="border border-hairline rounded-md bg-surface overflow-x-auto table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Item code</th>
                <th>Product</th>
                <th className="w-28">Brand</th>
                <th className="w-32">Item group</th>
                <th className="right">Unit cost</th>
                <th className="w-20">Active</th>
                <th className="w-32"></th>
              </tr>
            </thead>
            <tbody>
              <RowForm action={upsertProduct}>
                {({ pending }) => (
                  <tr className="bg-surface-2/40">
                    <td><Field name="item_code" placeholder="ERP item code" width="w-56" required /></td>
                    <td><Field name="product_name" placeholder="name" /></td>
                    <td><Field name="brand_code" placeholder="AKEMI" width="w-24" /></td>
                    <td><Field name="item_group" placeholder="MATTRESS" width="w-28" /></td>
                    <td className="num"><Field name="unit_cost" type="number" step="0.01" width="w-24" placeholder="0.00" /></td>
                    <td><Tick name="is_active" defaultChecked ariaLabel="new product active" /></td>
                    <td><SaveButton pending={pending} label="Add" /></td>
                  </tr>
                )}
              </RowForm>

              {shown.map(p => (
                <RowForm key={p.id} action={upsertProduct}>
                  {({ pending }) => (
                    <tr>
                      <td className="font-mono text-xs">
                        <Hidden name="id" value={p.id} />
                        <Hidden name="item_code" value={p.item_code} />
                        {p.item_code}
                      </td>
                      <td><Field name="product_name" defaultValue={p.product_name} /></td>
                      <td><Field name="brand_code" defaultValue={p.brand_code} width="w-24" /></td>
                      <td><Field name="item_group" defaultValue={p.item_group} width="w-28" /></td>
                      <td className="num">
                        <Field
                          name="unit_cost"
                          type="number"
                          step="0.01"
                          width="w-24"
                          defaultValue={p.unit_cost ?? ''}
                          placeholder="—"
                        />
                      </td>
                      <td><Tick name="is_active" defaultChecked={p.is_active} ariaLabel={`${p.item_code} active`} /></td>
                      <td className="flex items-center gap-3">
                        <SaveButton pending={pending} label="✓" />
                        <ActionButton
                          run={() => deleteProduct(p.id)}
                          label="Remove"
                          danger
                          confirm={`Remove ${p.item_code} from the product list?`}
                        />
                      </td>
                    </tr>
                  )}
                </RowForm>
              ))}

              {shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted font-serif italic">
                    {products.length === 0
                      ? 'No products yet — paste a cost list to begin.'
                      : 'Nothing matches that filter.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {products.length > shown.length ? (
          <p className="font-serif italic text-muted text-xs mt-2">
            Showing {shown.length} of {products.length}. Narrow the search to see the rest.
          </p>
        ) : null}
      </section>
    </div>
  )
}

/** Paste, preview, then write — never write a paste sight-unseen. */
function PasteBox({ onDone }: { onDone: () => void }) {
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = useMemo(() => (raw.trim() ? parseProductPaste(raw) : null), [raw])

  return (
    <div className="border border-hairline rounded-md bg-surface p-5 mb-6">
      <h3 className="font-serif text-lg text-ink mb-2">Paste a cost list</h3>
      <p className="font-serif italic text-muted text-sm mb-3">
        One product per line: <span className="font-mono text-xs">item code · name · brand · item
        group · unit cost</span>, tab or comma separated. The cost is read from the last numeric
        column, so a shorter paste still works. An item code that already exists is updated in
        place. A blank cost is stored as <em>not keyed in yet</em>, not as zero.
      </p>

      <ErrorNote error={error} />
      {result ? (
        <div className="bg-surface-2 border border-hairline text-ink rounded-md p-3 mb-3 text-sm font-sans">
          {result}
        </div>
      ) : null}

      <textarea
        value={raw}
        onChange={e => {
          setRaw(e.target.value)
          setResult(null)
        }}
        rows={8}
        aria-label="Product cost paste"
        placeholder={'AK-GUARDIAN MATT (Q)\tAKEMI GUARDIAN MATTRESS\tAKEMI\tMATTRESS\t1800'}
        className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
      />

      {preview ? (
        <p className="font-serif italic text-graphite text-sm mt-2">
          {preview.parsed.length} product{preview.parsed.length === 1 ? '' : 's'} read
          {preview.parsed.filter(p => p.unitCost === null).length > 0
            ? `, ${preview.parsed.filter(p => p.unitCost === null).length} without a cost`
            : ''}
          {preview.skipped.length > 0 ? ` · ${preview.skipped.length} line(s) skipped` : ''}.
        </p>
      ) : null}

      {preview && preview.skipped.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {preview.skipped.slice(0, 5).map(s => (
            <li key={s.line} className="font-mono text-xs text-danger">
              line {s.line}: {s.reason} — {s.text.slice(0, 60)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !preview || preview.parsed.length === 0}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              try {
                const r = await bulkUpsertProducts(raw)
                setResult(`${r.written} product(s) saved${r.skipped ? `, ${r.skipped} skipped` : ''}.`)
                setRaw('')
                onDone()
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Import failed')
              }
            })
          }}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {pending ? 'Importing…' : 'Import'}
        </button>
        <span className="font-serif italic text-muted text-xs">
          Costs are in RM, per unit.
        </span>
      </div>
    </div>
  )
}
