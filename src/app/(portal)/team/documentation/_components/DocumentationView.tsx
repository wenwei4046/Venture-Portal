'use client'

import { useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs } from '@/components/hrv/tabs'
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
 */
export default function DocumentationView({
  data,
  can,
  initialTab,
  initialPerson,
}: {
  data: Documentation
  can: { create: boolean; edit: boolean }
  initialTab: DocTab
  initialPerson: string | null
}) {
  const [tab, setTab] = useState<DocTab>(initialTab)
  const [opened, setOpened] = useState<DocTab[]>(() => [initialTab])
  const [person, setPerson] = useState<string | null>(initialPerson ?? data.people[0]?.id ?? null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  const go = (key: DocTab) => {
    setTab(key)
    setOpened(o => (o.includes(key) ? o : [...o, key]))
  }
  const show = (key: DocTab) => opened.includes(key)

  return (
    <HvPage>
      <PageHead
        eyebrow="People · Documentation"
        title="Documentation"
        subtitle="Files HR shares by department, the letters kept on each person’s record, and memos and letters HR publishes."
      />
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
          <DataCenterTab data={data} can={can} person={person} onPerson={setPerson} onView={id => setPreview({ kind: 'letter', id })} />
        </div>
      ) : null}
      {show('letters') ? (
        <div hidden={tab !== 'letters'}>
          <LettersTab
            data={data}
            can={can}
            onView={id => setPreview({ kind: 'letter', id })}
            onPerson={id => {
              setPerson(id)
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
      <PreviewDrawer data={data} target={preview} onClose={() => setPreview(null)} />
    </HvPage>
  )
}
