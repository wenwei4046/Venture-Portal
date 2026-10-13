'use client'

import { useEffect, useRef, useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
import { ROOT, personAt, type Drive } from '@/lib/documentation/drive'
import type { Documentation } from '@/lib/documentation/model'
import DocumentsTab from './DocumentsTab'
import DataCenterTab from './DataCenterTab'
import LettersTab from './LettersTab'
import PublishTab from './PublishTab'
import PreviewDrawer, { type PreviewTarget } from './PreviewDrawer'

export type DocTab = 'documents' | 'data-center' | 'letters' | 'publish'

const TABS: Array<{ key: DocTab; label: string }> = [
  { key: 'documents', label: 'Documents' },
  { key: 'data-center', label: 'Data center' },
  { key: 'letters', label: 'Letters' },
  { key: 'publish', label: 'Publish' },
]

/**
 * People › Documentation (2026-10-11, HR revamp round 2 — README §10, the
 * handoff's DOCUMENTATION block): Documents · Data center · Letters · Publish,
 * no counts on the tabs. The tab is the page's own state (as Member
 * services'): a write may be in flight when it changes, and a URL pushed then
 * makes the App Router drop the write and refresh. `?tab=` / `?person=` still
 * open one tab, one person.
 *
 * A tab mounts when first opened and then stays, hidden, so what was typed on
 * Publish waits for the user's return.
 *
 * The Data center is a Drive (2026-10-12): its place — the Data center, HOUZS
 * Venture, a department, a person, a folder HR made — is kept here and written
 * into the address with `history.replaceState` (`?tab=data-center&in=…`; no
 * navigation, so no write is dropped), so a reload or a shared link opens the
 * same folder. Letters' names open their person's folder.
 */
export default function DocumentationView({
  data,
  drive,
  driveError,
  can,
  initialTab,
  initialAt,
}: {
  data: Documentation
  drive: Drive
  driveError: string | null
  can: { create: boolean; edit: boolean }
  initialTab: DocTab
  /** The Data center's place to open on (`?in=`, or `?person=` as before). */
  initialAt: string | null
}) {
  const [tab, setTab] = useState<DocTab>(initialTab)
  const [opened, setOpened] = useState<DocTab[]>(() => [initialTab])
  const [at, setAt] = useState<string>(initialAt ?? ROOT)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  const go = (key: DocTab) => {
    setTab(key)
    setOpened(o => (o.includes(key) ? o : [...o, key]))
  }
  const show = (key: DocTab) => opened.includes(key)

  // The address follows the tab and the Data center's place once either moves — replaced, never pushed (Next keeps
  // its router in step with a replaceState; nothing is fetched).
  const written = useRef(`${initialTab}|${initialAt ?? ROOT}`)
  useEffect(() => {
    if (written.current === `${tab}|${at}`) return
    written.current = `${tab}|${at}`
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    url.searchParams.delete('person')
    if (tab === 'data-center' && at !== ROOT) url.searchParams.set('in', at)
    else url.searchParams.delete('in')
    if (url.href !== window.location.href) window.history.replaceState(null, '', url.href)
  }, [tab, at])

  return (
    <HvPage>
      <PageHead eyebrow="People · Documentation" title="Documentation" />
      <Tabs
        items={TABS}
        active={tab}
        onSelect={k => go(k as DocTab)}
        size="compact"
        label="Documentation"
        style={{ margin: '-4px 0 18px', flexWrap: 'wrap' }}
      />
      {show('documents') ? (
        <div hidden={tab !== 'documents'}>
          <DocumentsTab data={data} can={can} onView={id => setPreview({ kind: 'document', id })} />
        </div>
      ) : null}
      {show('data-center') ? (
        <div hidden={tab !== 'data-center'}>
          <DataCenterTab data={data} drive={drive} driveError={driveError} can={can} at={at} onAt={setAt} onView={setPreview} />
        </div>
      ) : null}
      {show('letters') ? (
        <div hidden={tab !== 'letters'}>
          <LettersTab
            data={data}
            can={can}
            onView={id => setPreview({ kind: 'letter', id })}
            onPerson={id => {
              setAt(personAt(id))
              go('data-center')
            }}
          />
        </div>
      ) : null}
      {show('publish') ? (
        <div hidden={tab !== 'publish'}>
          <PublishTab data={data} can={can} />
        </div>
      ) : null}
      <PreviewDrawer data={data} drive={drive} target={preview} onClose={() => setPreview(null)} />
    </HvPage>
  )
}
