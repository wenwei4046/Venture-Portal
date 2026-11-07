'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EditError } from '@/lib/catalogue/edits'
import { gwpChangesOf, gwpDraftChanged, type GwpChanges, type GwpDraft, type GwpSaved, type GwpSide } from '@/lib/catalogue/gwp-edits'
import { removeGwp, saveGwp } from '../actions'
import type { GwpEntry, GwpSkuRef, PickSku } from '../load'
import GwpSkuPicker from './GwpSkuPicker'
import PageScrolledTable from './PageScrolledTable'
import { useProductDraftGuard } from './ProductWorkspace'
import { ActionRow, CellChip, EditingButtons, Heading, Notice, plural, TableFoot } from './ui'
import c from './products.module.css'

const EMPTY: GwpDraft = { buy: [], gift: [], perUnit: '' }
const SIDES: readonly GwpSide[] = ['buy', 'gift']

const savedOf = (g: GwpEntry): GwpSaved => ({ buy: g.buy.map(r => r.erpId), gift: g.gift.map(r => r.erpId), perUnit: g.perUnit })

/**
 * Product List › GWP (2026-11-08 — the user: "i want the product list tab for one more new tab is gwp … example,
 * dullop mattress ecobliss, set a gwp 2 micorfibre pillow. so the margin calculator and margin leader will not
 * calculate the cost in for those 2 pillow. is jsut calculate the mattress cost only"). A gift with purchase: the
 * SKUs whose purchase earns it — any sizes ticked together ("2, or can select all as well") — the SKUs it may be,
 * any of them, and how many each unit bought earns ("每买一张送 N 个"). No dates ("gwp no need got set date
 * funtion"): while it is on the list it counts on every bill. Every margin reads it — the Quote's (with nothing
 * said on the Quote: "no need show gwp wording as well"), Comm Cal's month, Insight, the Arena and a run computed
 * again. Every sub-department alike.
 *
 * One GWP is open at a time, new or saved; a Save sends only what changed (`gwpChangesOf`) and a remove asks a
 * second click.
 */
export default function GwpTab({ entries, skus }: { entries: GwpEntry[]; skus: PickSku[] }) {
  const router = useRouter()
  /** The GWP open in the editor: a saved one's id, or null for a new one. */
  const [open, setOpen] = useState<{ id: string | null } | null>(null)
  const [draft, setDraft] = useState<GwpDraft>(EMPTY)
  /** The GWP whose Remove was clicked once. */
  const [armed, setArmed] = useState<string | null>(null)
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const close = useCallback(() => {
    setOpen(null)
    setDraft(EMPTY)
  }, [])

  // A save leaves the editor on screen, read-only, until the refreshed list arrives (as Costing Setting does).
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<GwpEntry[] | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    close()
  }, [close])
  useEffect(() => {
    if (settling && settleFrom.current && settleFrom.current !== entries) settle()
  }, [settling, entries, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

  // A Remove clicked once waits a moment for the second click.
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(null), 4_000)
    return () => window.clearTimeout(timer)
  }, [armed])

  const skuById = useMemo(() => new Map(skus.map(s => [s.erpId, s])), [skus])
  const savedCode = useMemo(() => {
    const codes = new Map<string, string>()
    for (const g of entries) for (const r of [...g.buy, ...g.gift]) codes.set(r.erpId, r.code)
    return codes
  }, [entries])
  /** A SKU as the SKU Master names it today, else as it was saved. */
  const codeOf = useCallback((erpId: string) => skuById.get(erpId)?.code ?? savedCode.get(erpId) ?? erpId, [skuById, savedCode])
  /** The ERP renamed it since: new bills carry a code this GWP no longer matches until it is saved again. */
  const renamed = (r: GwpSkuRef) => {
    const sku = skuById.get(r.erpId)
    return sku !== undefined && sku.code !== r.code
  }

  const openEntry = open?.id ? entries.find(g => g.id === open.id) ?? null : null
  const saved = openEntry ? savedOf(openEntry) : null
  const stale = openEntry ? SIDES.filter(side => openEntry[side].some(renamed)) : []
  const dirty = open && (gwpDraftChanged(saved, draft) || stale.length > 0) ? 1 : 0
  useProductDraftGuard(dirty, saving)

  const buySet = useMemo(() => new Set(draft.buy), [draft.buy])
  const giftSet = useMemo(() => new Set(draft.gift), [draft.gift])

  function edit(next: Partial<GwpDraft>) {
    setDraft(previous => ({ ...previous, ...next }))
    setNotice(null)
  }

  function startNew() {
    setOpen({ id: null })
    setDraft(EMPTY)
    setArmed(null)
    setError(null)
    setNotice(null)
  }

  function startEdit(g: GwpEntry) {
    setOpen({ id: g.id })
    setDraft({ buy: g.buy.map(r => r.erpId), gift: g.gift.map(r => r.erpId), perUnit: String(g.perUnit) })
    setArmed(null)
    setError(null)
    setNotice(null)
  }

  function cancel() {
    if (saving) return
    close()
    setError(null)
  }

  function save() {
    if (!open || saving || dirty === 0) return
    let changes: GwpChanges
    try {
      changes = gwpChangesOf(saved, draft, codeOf, stale)
    } catch (e) {
      if (!(e instanceof EditError)) throw e
      setError(e.message)
      return
    }
    setError(null)
    setNotice(null)
    const before = entries
    const id = open.id
    startSaving(async () => {
      try {
        const result = await saveGwp(id, changes)
        if (!result.ok) {
          setError(result.reason)
          return
        }
        settleFrom.current = before
        setSettling(true)
        setNotice('Saved')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the GWP.')
      }
    })
  }

  function remove(g: GwpEntry) {
    if (saving || open) return
    if (armed !== g.id) {
      setArmed(g.id)
      setNotice(null)
      return
    }
    setArmed(null)
    setError(null)
    const before = entries
    startSaving(async () => {
      try {
        const result = await removeGwp(g.id)
        if (!result.ok) {
          setError(result.reason)
          return
        }
        settleFrom.current = before
        setSettling(true)
        setNotice('Removed')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove the GWP.')
      }
    })
  }

  /** A side of a saved GWP: its SKUs as chips. */
  const chipsOf = (refs: readonly GwpSkuRef[]) => (
    <span className={c.gwpChips}>
      {refs.map(r => {
        const sku = skuById.get(r.erpId)
        return (
          <span key={r.erpId} className={c.gwpChip} title={sku?.description ?? undefined}>
            {r.code}
            {sku && renamed(r) ? <span className={c.gwpChipNote}>now {sku.code}</span> : null}
            {sku?.removed ? <span className={c.gwpChipNote}>gone from ERP</span> : null}
          </span>
        )
      })}
    </span>
  )

  const saveLabel = pending ? 'Saving…' : settling ? 'Saved' : open?.id ? 'Save changes' : 'Save GWP'

  return (
    <>
      <Heading title="Gifts with purchase" sub="Every sub-department" />
      <ActionRow>
        {open ? (
          <EditingButtons cancelLabel="Cancel" onCancel={cancel} onSave={save} changes={dirty} saving={saving} pending={pending} saveLabel={saveLabel} />
        ) : (
          <button type="button" className={c.primary} disabled={saving} onClick={startNew}>+ Add GWP</button>
        )}
      </ActionRow>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {open ? (
        <div className={c.gwpEditor} role="group" aria-label={open.id ? 'Edit GWP' : 'New GWP'}>
          <div className={c.gwpSides}>
            <GwpSkuPicker title="Bought" searchLabel="Find a SKU bought" skus={skus} chosen={draft.buy} elsewhere={giftSet}
              elsewhereLabel="Gift" codeOf={codeOf} disabled={saving} onChange={buy => edit({ buy })} />
            <GwpSkuPicker title="Gifts" searchLabel="Find a gift" skus={skus} chosen={draft.gift} elsewhere={buySet}
              elsewhereLabel="Bought" codeOf={codeOf} disabled={saving} onChange={gift => edit({ gift })} />
          </div>
          <label className={`${c.pickerAmount} ${c.gwpQty}`}>
            <span className={c.selectLabel}>Free per unit</span>
            <input className={c.pickerAmountInput} value={draft.perUnit} onChange={e => edit({ perUnit: e.target.value })} disabled={saving}
              inputMode="numeric" placeholder="—" aria-label="Free per unit" />
          </label>
        </div>
      ) : null}

      <div className={c.tableCard} data-page="">
        <PageScrolledTable label="Gifts with purchase">
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 300 }}>BOUGHT</th>
                <th scope="col" className={c.th} style={{ minWidth: 300 }}>GIFTS</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 130 }}>FREE PER UNIT</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 190 }}><span className="sr-only">Edit or remove</span>{' '}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((g, i) => {
                const editingThis = open?.id === g.id
                return (
                  <tr key={g.id} className={c.row} data-stripe={(!editingThis && i % 2 === 1) || undefined} data-new={editingThis || undefined}
                    data-testid={`gwp-${g.id}`}>
                    <td className={c.td} data-first="" data-wrap="">{chipsOf(g.buy)}</td>
                    <td className={c.td} data-wrap="">{chipsOf(g.gift)}</td>
                    <td className={`${c.td} ${c.bold}`} data-num="">{g.perUnit}</td>
                    <td className={c.td} data-num="">
                      {editingThis ? (
                        <CellChip tone="new">EDITING</CellChip>
                      ) : open ? null : (
                        <span className={c.gwpRowActions}>
                          <button type="button" className={c.cellLink} disabled={saving} onClick={() => startEdit(g)}>Edit</button>
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving} onClick={() => remove(g)}>
                            {armed === g.id ? 'Click again to remove' : 'Remove'}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {entries.length === 0 ? (
                <tr><td colSpan={4} className={c.empty}>No GWP yet</td></tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <TableFoot shown={plural(entries.length, 'GWP')} />
      </div>
    </>
  )
}
