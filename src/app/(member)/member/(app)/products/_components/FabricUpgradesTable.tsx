'use client'

import { valueKey } from '@/lib/catalogue/keys'
import type { FabricUpgradeRow } from '../load'
import {
  addUpgrade, dropNew, shownUpgrade, takenSeries, touchNew, touchUpgrade, type UpgradesDraft,
} from './fabric-upgrades'
import { CellChip, CellInput, money } from './ui'
import c from './products.module.css'

/**
 * Maintenance › Fabrics › Sofa / Bedframe upgrades (2026-10-29, the user:
 * "先建 upgrade 再勾 series"): one category's upgrades — NAME (what the Quote
 * says) · CHARGE (RM) · SERIES, the fabric series ticked under it. Drawn from
 * the saved rows with the tab's draft over them, so a Save shows as saved
 * until the page's fresh rows arrive. The tab holds the draft and saves it
 * (MaintenanceTab), so a pool switch keeps what was typed.
 */
export default function FabricUpgradesTable({ upgrades, draft, onDraft, editing, saving, options, newKey }: {
  /** This category's saved upgrades. */
  upgrades: FabricUpgradeRow[]
  draft: UpgradesDraft
  onDraft: (next: UpgradesDraft) => void
  editing: boolean
  saving: boolean
  /** The series the ERP's fabric list holds, and how many fabrics each. */
  options: ReadonlyArray<{ series: string; fabrics: number }>
  newKey: () => string
}) {
  const shown = upgrades.map(u => ({ u, ...shownUpgrade(u, draft) })).filter(r => editing || !r.removing)
  const rows = shown.length + draft.added.length

  function seriesCell(series: readonly string[], except: string, label: string, onChange: (next: string[]) => void, disabled: boolean) {
    if (!editing) {
      return series.length ? (
        <span className={c.metaChips}>{series.map(s => <span key={s} className={c.metaChip}>{s}</span>)}</span>
      ) : <span className={c.muted}>—</span>
    }
    const taken = takenSeries(upgrades, draft, except)
    const mine = new Set(series.map(s => valueKey(s)))
    const free = options.filter(o => !taken.has(valueKey(o.series)!) && !mine.has(valueKey(o.series)))
    return (
      <span className={c.metaChips}>
        {series.map(s => (
          <span key={s} className={c.metaChip}>
            {s}
            <button type="button" className={c.chipX} aria-label={`Untick ${s} from ${label}`} disabled={disabled}
              onClick={() => onChange(series.filter(x => x !== s))}>×</button>
          </span>
        ))}
        <select className={c.cellSelect} value="" aria-label={`Tick a series for ${label}`} disabled={disabled || free.length === 0}
          onChange={e => { if (e.target.value) onChange([...series, e.target.value]) }}>
          <option value="">+ Series</option>
          {free.map(o => <option key={o.series} value={o.series}>{o.series} · {o.fabrics} fabric{o.fabrics === 1 ? '' : 's'}</option>)}
        </select>
      </span>
    )
  }

  return (
    <>
      <table className={c.table}>
        <thead><tr>
          <th scope="col" className={c.th} data-first="" style={{ minWidth: 230 }}>NAME</th>
          <th scope="col" className={c.th} data-num="" style={{ minWidth: 140 }}>CHARGE (RM)</th>
          <th scope="col" className={c.th} style={{ minWidth: 340 }}>SERIES</th>
          {editing ? <th scope="col" className={c.th} style={{ minWidth: 120 }} aria-label="Remove" /> : null}
        </tr></thead>
        <tbody>
          {shown.map(({ u, name, price, series, removing }, i) => {
            const d = draft.rows.get(u.id)
            const locked = saving || removing
            return (
              <tr key={u.id} className={c.row} data-stripe={i % 2 === 1 || undefined} data-dim={removing || undefined}>
                <td className={c.td} data-first="">
                  {editing ? (
                    <input className={`${c.cellInput} ${c.textInput}`} value={name} maxLength={80} aria-label={`${u.name} name`}
                      data-edited={d?.name !== undefined || undefined} disabled={locked}
                      onChange={e => onDraft(touchUpgrade(draft, u.id, { name: e.target.value }))} />
                  ) : <span className={c.strong}>{name}</span>}
                </td>
                <td className={c.td} data-num="">
                  {editing ? (
                    <CellInput value={price} onChange={v => onDraft(touchUpgrade(draft, u.id, { price: v }))} edited={d?.price !== undefined}
                      label={`${u.name} charge`} disabled={locked} />
                  ) : <span className={c.strong}>{money(Number(price))}</span>}
                </td>
                <td className={c.td}>
                  {seriesCell(series, u.id, u.name, next => onDraft(touchUpgrade(draft, u.id, { series: next })), locked)}
                </td>
                {editing ? (
                  <td className={c.td}>
                    <button type="button" className={c.secondary} disabled={saving} aria-label={`${removing ? 'Keep' : 'Remove'} ${u.name}`}
                      onClick={() => onDraft(touchUpgrade(draft, u.id, { removing: !removing }))}>{removing ? 'Keep' : 'Remove'}</button>
                    {removing ? <CellChip tone="removing">REMOVING</CellChip> : null}
                  </td>
                ) : null}
              </tr>
            )
          })}
          {draft.added.map((a, i) => (
            <tr key={a.key} className={c.row} data-stripe={(shown.length + i) % 2 === 1 || undefined}>
              <td className={c.td} data-first="">
                {editing ? (
                  <input className={`${c.cellInput} ${c.textInput}`} value={a.name} maxLength={80} placeholder="Upgrade fabric"
                    aria-label="New upgrade name" data-edited="" disabled={saving}
                    onChange={e => onDraft(touchNew(draft, a.key, { name: e.target.value }))} />
                ) : <span className={c.strong}>{a.name}</span>}
                <CellChip>NEW</CellChip>
              </td>
              <td className={c.td} data-num="">
                {editing ? (
                  <CellInput value={a.price} onChange={v => onDraft(touchNew(draft, a.key, { price: v }))} edited
                    label={`${a.name || 'New upgrade'} charge`} disabled={saving} />
                ) : <span className={c.strong}>{money(Number(a.price))}</span>}
              </td>
              <td className={c.td}>
                {seriesCell(a.series, a.key, a.name || 'the new upgrade', next => onDraft(touchNew(draft, a.key, { series: next })), saving)}
              </td>
              {editing ? (
                <td className={c.td}>
                  <button type="button" className={c.secondary} disabled={saving} aria-label={`Remove ${a.name || 'the new upgrade'}`}
                    onClick={() => onDraft(dropNew(draft, a.key))}>Remove</button>
                </td>
              ) : null}
            </tr>
          ))}
          {rows === 0 ? <tr><td colSpan={editing ? 4 : 3} className={c.empty}>No upgrades yet.</td></tr> : null}
        </tbody>
      </table>
      {editing ? (
        <div className={c.addRow}>
          <button type="button" className={c.secondary} disabled={saving} onClick={() => onDraft(addUpgrade(draft, newKey()))}>+ Add upgrade</button>
        </div>
      ) : null}
    </>
  )
}
