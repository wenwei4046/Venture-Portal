'use client'

import { useState } from 'react'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Tabs, useTabParam } from '@/components/hrv/tabs'
import type { HiringBoard } from '@/lib/hiring/types'
import type { ReviewFilter } from '@/lib/hiring/view'
import RequestInbox from './RequestInbox'
import RequestListing from './RequestListing'
import FormSettings from './FormSettings'
import NewRequestDrawer from './NewRequestDrawer'

/**
 * Hiring › Requests (2026-10-11, README §11): the handoff's head, then three
 * tabs kept in the URL — Requests (the review inbox), Listing (every request)
 * and Form settings (what requesters fill in, the hiring sources; for whoever
 * may change them). "+ New request" and Form settings' "Preview form" open the
 * same drawer.
 */
const TABS = ['review', 'listing', 'form'] as const
type Tab = (typeof TABS)[number]

export default function HiringRequestsView({
  board,
  can,
}: {
  board: HiringBoard
  can: { create: boolean; edit: boolean; approve: boolean }
}) {
  const [tab, setTab] = useTabParam<Tab>(TABS, 'review')
  const [newOpen, setNewOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReviewFilter>('pending')
  const items = [
    { key: 'review', label: 'Requests' },
    { key: 'listing', label: 'Listing' },
    ...(can.edit ? [{ key: 'form', label: 'Form settings' }] : []),
  ]
  const shown: Tab = tab === 'form' && !can.edit ? 'review' : tab

  return (
    <HvPage>
      <PageHead eyebrow="Hiring · Requests" title="Hiring requests" subtitle="Manpower requests from every department, from submission to filled." />
      <Tabs items={items} active={shown} onSelect={k => setTab(k as Tab)} size="compact" style={{ margin: '-4px 0 18px', flexWrap: 'wrap' }} label="Hiring requests" />
      {shown === 'review' ? (
        <RequestInbox board={board} filter={filter} onFilter={setFilter} selected={selected} onSelect={setSelected} onNewRequest={() => setNewOpen(true)} canCreate={can.create} canApprove={can.approve} />
      ) : null}
      {shown === 'listing' ? <RequestListing board={board} canApprove={can.approve} /> : null}
      {shown === 'form' ? <FormSettings board={board} onPreview={() => setNewOpen(true)} /> : null}
      {can.create ? (
        <NewRequestDrawer
          board={board}
          open={newOpen}
          onClose={() => setNewOpen(false)}
          onSubmitted={id => {
            setNewOpen(false)
            setSelected(id)
            setFilter('pending')
            setTab('review')
          }}
        />
      ) : null}
    </HvPage>
  )
}
