'use client'

import { useRouter } from 'next/navigation'
import Segmented from './ui/Segmented'

/** Insight's two views (2026-11-17): the funnel (the v2 handoff's page) and Overview (the outlets' sheet), ?v=overview. */
export default function InsightViews({ view }: { view: 'funnel' | 'overview' }) {
  const router = useRouter()
  return (
    <Segmented value={view} label="Insight view" options={[{ value: 'overview', label: 'Overview' }, { value: 'funnel', label: 'Funnel' }]}
      onChange={v => router.push(v === 'overview' ? '/leads/insight?v=overview' : '/leads/insight')} />
  )
}
