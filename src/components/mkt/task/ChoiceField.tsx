'use client'

import { useState, useTransition } from 'react'
import { addMktOption } from '@/lib/marketing/actions'
import { answerWords, choiceOptions, LIST_MAX, optionThere, optionWords, picksOf, togglePick, type OptionLists } from '@/lib/marketing/options'
import type { FormField } from '@/lib/marketing/tasks'
import s from './task.module.css'

// A choice on a stage's work (③d-2 — the user's answer 9, "a shared option list (Locations) as a dropdown — the person
// filling it in adds a missing option on the spot"): a Select a dropdown, a Multi-select its options to tick — its own
// options, or its shared list's, where *+ Add an option…* puts a missing one on the list for everybody and picks it.
// Read only, the answer in words.

// An option is trimmed, so its words never start with a space: this value is never one.
const ADD = ' + add '

export default function ChoiceField({ field, value, lists, live, busy, onAnswer, onList, say }: {
  field: FormField
  value: unknown
  lists: OptionLists
  /** The viewer's own stage, worked now. */
  live: boolean
  busy: boolean
  /** The answer picked — the page saves it (none picked: null). */
  onAnswer: (next: string | string[] | null) => void
  /** A shared list as it now stands, once an option was added. */
  onList: (name: string, opts: string[]) => void
  say: (words: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, start] = useTransition()
  const multi = field.type === 'Multi-select'
  const opts = choiceOptions(field, lists, value)
  const picks = picksOf(value)
  const canAdd = !!field.list && (lists[field.list]?.length ?? 0) < LIST_MAX
  const cancel = () => {
    setAdding(false)
    setTyped('')
  }
  const pick = (o: string) => onAnswer(multi ? (picks.includes(o) ? picks : togglePick(picks, o, [...opts, o])) : o)
  const add = () =>
    start(async () => {
      const o = optionWords(typed)
      if (!o || !field.list) return
      // There already in other letters: picked as the list spells it.
      const there = optionThere(opts, o)
      if (there) {
        cancel()
        return pick(there)
      }
      const r = await addMktOption(field.list, o)
      if (!r.ok) return say(r.reason)
      onList(r.list, r.opts)
      cancel()
      pick(r.option)
      say(`${r.option} · added to ${r.list}`)
    })

  if (!live) return <input className={s.fInput} value={answerWords(value)} disabled readOnly placeholder="—" aria-label={field.label} />

  const addRow = adding ? (
    <span className={s.choiceAdd}>
      <input
        className={s.fInput}
        value={typed}
        maxLength={40}
        autoFocus
        placeholder={`New option for ${field.list}`}
        aria-label={`New option for ${field.label}`}
        onChange={e => setTyped(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          } else if (e.key === 'Escape') cancel()
        }}
      />
      <button type="button" className={s.btn} disabled={!optionWords(typed) || pending} onClick={add}>{pending ? 'Adding…' : 'Add'}</button>
      <button type="button" className={s.btn} disabled={pending} onClick={cancel}>Cancel</button>
    </span>
  ) : null

  if (multi) {
    return (
      <>
        <span className={s.choiceChips} role="group" aria-label={field.label}>
          {opts.map(o => (
            <button key={o} type="button" aria-pressed={picks.includes(o)} disabled={busy || pending}
              className={`${s.choiceChip}${picks.includes(o) ? ` ${s.choiceChipOn}` : ''}`}
              onClick={() => {
                const next = togglePick(picks, o, opts)
                onAnswer(next.length ? next : null)
              }}>
              {o}
            </button>
          ))}
          {opts.length ? null : <span className={s.choiceNone}>No options yet</span>}
          {canAdd && !adding ? <button type="button" className={s.choiceMore} disabled={busy || pending} onClick={() => setAdding(true)}>+ Add an option…</button> : null}
        </span>
        {addRow}
      </>
    )
  }
  return (
    <>
      <select
        className={s.fInput}
        value={typeof value === 'string' ? value : ''}
        disabled={busy || pending}
        aria-label={field.label}
        onChange={e => {
          if (e.target.value === ADD) return setAdding(true)
          onAnswer(e.target.value || null)
        }}
      >
        <option value="">Pick one…</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
        {canAdd ? <option value={ADD}>+ Add an option…</option> : null}
      </select>
      {addRow}
    </>
  )
}
