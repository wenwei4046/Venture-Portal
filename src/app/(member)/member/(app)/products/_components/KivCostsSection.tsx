'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EditError, KIV_SIZES, KIV_SIZE_LABEL, parseMoney, validateKivCosts, type KivCostEdit, type KivSize } from '@/lib/catalogue/edits'
import { teamCost } from '@/lib/catalogue/rule-edits'
import { saveKivCosts } from '../actions'
import type { KivCostRow } from '../load'
import { ActionRow, CellInput, EditButton, EditingButtons, Heading, money, Notice, plural } from './ui'
import c from './products.module.css'

/** What a draft says once saved: a cost, nothing (blank), or a figure that is no amount yet. */
function readCost(text: string): number | null | 'bad' {
  try {
    return parseMoney(text, 'Cost')
  } catch (e) {
    if (e instanceof EditError) return 'bad'
    throw e
  }
}

/**
 * Costing Setting › KIV bed frames (2026-10-31 — the user: "只要 detect 到 bed frame 它是 KIV 的话 … 就拿最贵的 bed
 * frame 按照这样子的 costing 去计算它的 margin", King 1000, Queen 820, Super single 600, Single 550, and a place on
 * the Product List to set them). A bed frame still to be chosen costs the dearest frame of its size until it is, so
 * its bill's margin reads low, never high; a frame of another size, or none stated, costs the dearest of the four.
 * Every sub-department alike. Its unsaved changes are the tab's (`onDraft`): one guard keeps a page from being left
 * with them.
 */
export default function KivCostsSection({ costs, divisor, onDraft }: {
  costs: KivCostRow[]
  /** The open sub-department's ratio: what each cost is to its Revenue Team. */
  divisor: number
  onDraft: (state: { changes: number; saving: boolean }) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<ReadonlyMap<KivSize, string>>(new Map())
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const saved = useMemo(() => new Map(costs.map(r => [r.size, r.cost])), [costs])

  // A save leaves its drafts on screen until the refreshed costs arrive, as the ratios above do.
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<KivCostRow[] | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setEditing(false)
    setDrafts(new Map())
  }, [])
  useEffect(() => {
    if (settling && settleFrom.current && settleFrom.current !== costs) settle()
  }, [settling, costs, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

  /** A size's draft when it says something other than what is saved. */
  const changeOf = (size: KivSize): string | undefined => {
    const text = drafts.get(size)
    if (text === undefined) return undefined
    const n = readCost(text)
    return n === (saved.get(size) ?? null) ? undefined : text.trim()
  }
  const changed = editing ? KIV_SIZES.filter(size => changeOf(size) !== undefined) : []
  const dirty = changed.length

  useEffect(() => {
    onDraft({ changes: dirty, saving })
  }, [dirty, saving, onDraft])

  function cancel() {
    if (saving) return
    setDrafts(new Map())
    setEditing(false)
    setError(null)
  }

  function save() {
    if (saving || dirty === 0) return
    const edits: KivCostEdit[] = changed.map(size => ({ size, cost: changeOf(size) ?? null }))
    try {
      validateKivCosts(edits)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the costs.')
      return
    }
    setError(null)
    setNotice(null)
    const before = costs
    startSaving(async () => {
      try {
        await saveKivCosts(edits)
        settleFrom.current = before
        setSettling(true)
        setNotice('Saved. New bills are costed at these now; recost a month to move the bills already in it.')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the KIV bed frame costs.')
      }
    })
  }

  return (
    <>
      <Heading title="KIV bed frames" sub="Every sub-department" />
      <ActionRow>
        {editing ? (
          <EditingButtons cancelLabel="Cancel changes" onCancel={cancel} onSave={save} changes={dirty} saving={saving} pending={pending}
            saveLabel={pending ? 'Saving…' : settling ? 'Saved' : dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'change')}`} />
        ) : (
          <EditButton label="Edit KIV costs" onClick={() => { setEditing(true); setNotice(null) }} />
        )}
      </ActionRow>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className={c.kivGrid} role="group" aria-label="KIV bed frame costs">
        {KIV_SIZES.map(size => {
          const label = KIV_SIZE_LABEL[size]
          const text = drafts.get(size)
          const edited = editing && changeOf(size) !== undefined
          const draft = text === undefined ? undefined : readCost(text)
          const shown = editing && typeof draft === 'number' ? draft : editing && draft === null ? null : saved.get(size) ?? null
          return (
            <div key={size} className={c.kivCell} data-edited={edited || undefined} data-testid={`kiv-${size}`}>
              <span className={c.kivSize}>{label.toUpperCase()}</span>
              {editing ? (
                <CellInput value={text ?? (saved.has(size) ? String(saved.get(size)) : '')} onChange={v => { setDrafts(previous => new Map(previous).set(size, v)); setNotice(null) }}
                  edited={edited} width={130} disabled={saving} label={`${label} KIV cost`} />
              ) : (
                <span className={c.kivCost}>{shown !== null ? money(shown) : '—'}</span>
              )}
              <span className={c.kivTeam}>
                {shown !== null ? `Team cost ${money(teamCost(shown, divisor))}` : 'Not set · the dearest'}
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
