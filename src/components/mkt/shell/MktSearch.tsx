'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { mktSearchFromRow, type MktSearchResult } from '@/lib/marketing/shell'
import s from './shell.module.css'

// The top bar's search (`Marketing Shell.dc.html`: "Search Track ID, task or person", ⌘K): a Track ID or a title opens
// Projects on it; a person opens the Calendar on them. Read from the browser as it is typed (`mkt_search`, 2+ letters),
// a moment after the typing stops.

const EMPTY: MktSearchResult = { projects: [], people: [] }

export default function MktSearch() {
  const router = useRouter()
  const box = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<MktSearchResult>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(0)

  // ⌘K / Ctrl+K from anywhere in the view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        box.current?.focus()
        box.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const words = q.trim()
    if (words.length < 2) {
      setHits(EMPTY)
      setBusy(false)
      return
    }
    setBusy(true)
    let live = true
    const t = setTimeout(async () => {
      try {
        const db = createClient() as unknown as SupabaseClient
        const { data, error } = await db.rpc('mkt_search', { p_q: words })
        if (live) setHits(error ? EMPTY : mktSearchFromRow(data))
      } catch {
        if (live) setHits(EMPTY)
      } finally {
        if (live) setBusy(false)
      }
    }, 180)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])

  const links = [
    ...hits.projects.map(p => ({ key: `p:${p.trackId}`, href: `/marketing/projects?q=${encodeURIComponent(p.trackId)}` })),
    ...hits.people.map(p => ({ key: `u:${p.id}`, href: `/marketing/calendar?who=${encodeURIComponent(p.id)}` })),
  ]
  useEffect(() => setPick(0), [hits])

  const close = () => {
    setOpen(false)
    box.current?.blur()
  }
  const go = (href: string) => {
    close()
    setQ('')
    router.push(href)
  }

  const words = q.trim()
  const shown = open && words.length >= 2

  return (
    <div className={s.search}>
      <label className={s.searchBox}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={box}
          className={s.searchInput}
          value={q}
          placeholder="Search Track ID, task or person"
          aria-label="Search Track ID, task or person"
          onChange={e => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Escape') close()
            else if (e.key === 'ArrowDown' && links.length) {
              e.preventDefault()
              setPick(i => (i + 1) % links.length)
            } else if (e.key === 'ArrowUp' && links.length) {
              e.preventDefault()
              setPick(i => (i - 1 + links.length) % links.length)
            } else if (e.key === 'Enter' && links[pick]) {
              e.preventDefault()
              go(links[pick].href)
            }
          }}
        />
        <span className={s.kbd} aria-hidden="true">⌘K</span>
      </label>
      {shown ? (
        <div className={s.results} role="listbox" aria-label="Search results">
          {hits.projects.length ? <div className={s.resultsHead}>Projects</div> : null}
          {hits.projects.map((p, i) => (
            <Link
              key={p.trackId}
              href={links[i].href}
              className={`${s.result}${pick === i ? ` ${s.resultOn}` : ''}`}
              role="option"
              aria-selected={pick === i}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                close()
                setQ('')
              }}
            >
              <span className={s.resultId}>{p.trackId}</span>
              <span className={s.resultTitle}>{p.title}</span>
            </Link>
          ))}
          {hits.people.length ? <div className={s.resultsHead}>People</div> : null}
          {hits.people.map((u, j) => {
            const i = hits.projects.length + j
            return (
              <Link
                key={u.id}
                href={links[i].href}
                className={`${s.result}${pick === i ? ` ${s.resultOn}` : ''}`}
                role="option"
                aria-selected={pick === i}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  close()
                  setQ('')
                }}
              >
                <span className={s.resultTitle}>{u.full || u.first}</span>
                {u.title ? <span className={s.resultMeta}>{u.title}</span> : null}
              </Link>
            )
          })}
          {!links.length ? <div className={s.resultsEmpty}>{busy ? 'Searching…' : 'Nothing found'}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
