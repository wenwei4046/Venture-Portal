'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, firstOfMonth } from '@/lib/attendance/engine'
import type { MyDocuments } from '@/lib/documentation/personal'
import { secOf } from '@/lib/me/format'
import { meOpenTarget } from '@/lib/push/notices'
import { photoLink, readDocuments, readMe, readOrg, readPayslips, readRecord, readTeam, readToday } from '@/lib/me/read'
import type { MeData, MeOrg, MePayslip, MeRecord, MeTeam, MeToday } from '@/lib/me/types'

/**
 * What Me holds (2026-10-17): today (for the button and the card that open it — read as the page comes up), then,
 * once Me opens, one's month, requests and settings, one's record and photo, an upline's team; the hierarchy,
 * payslips and documents as their screens open. Every read is the browser's own (lib/me/read.ts).
 */

export interface MeStore {
  today: MeToday | null
  /** When `today` was read (Date.now()), for the server clock. */
  todayAt: number
  data: MeData | null
  /** Last month while HR has not closed it yet, in the first week: what still needs fixing there. */
  prev: MeData | null
  dataError: string | null
  record: MeRecord | null | undefined
  photo: string | null
  team: MeTeam | null
  org: MeOrg | null
  orgError: string | null
  payslips: MePayslip[] | null
  payError: string | null
  docs: MyDocuments | null
  docsError: string | null
}

const EMPTY: MeStore = {
  today: null, todayAt: 0, data: null, prev: null, dataError: null, record: undefined, photo: null, team: null,
  org: null, orgError: null, payslips: null, payError: null, docs: null, docsError: null,
}

export function useMe(enabled = true) {
  const [s, set] = useState<MeStore>(EMPTY)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  const put = useCallback((patch: Partial<MeStore>) => { if (alive.current) set(x => ({ ...x, ...patch })) }, [])

  const loadToday = useCallback(async () => {
    const r = await readToday()
    if (r.ok) put({ today: r.data, todayAt: Date.now() })
  }, [put])

  const loadTeam = useCallback(async () => {
    const r = await readTeam()
    if (r.ok) put({ team: r.data })
  }, [put])

  const loadMe = useCallback(async () => {
    const [m, rec] = await Promise.all([readMe(), readRecord()])
    if (!m.ok) { put({ dataError: m.reason }); return }
    put({ data: m.data, dataError: null })
    if (rec.ok) {
      put({ record: rec.data.record })
      void photoLink(rec.data.record?.photo ?? null).then(photo => put({ photo }))
    }
    if (m.data.me && (m.data.reports > 0)) void loadTeam()
    else put({ team: null })
    // In the first days of a month, last month is still open until HR closes it: its missing punches can be fixed.
    const day = m.data.workDay
    const prevMonth = firstOfMonth(addDays(firstOfMonth(day), -1))
    if (m.data.me && Number(day.slice(8, 10)) <= 7) {
      const p = await readMe(prevMonth)
      put({ prev: p.ok && p.data.month.close?.status !== 'closed' ? p.data : null })
    } else put({ prev: null })
  }, [put, loadTeam])

  const loadOrg = useCallback(async () => {
    const r = await readOrg()
    put(r.ok ? { org: r.data, orgError: null } : { orgError: r.reason })
  }, [put])

  const loadPayslips = useCallback(async () => {
    const r = await readPayslips()
    put(r.ok ? { payslips: r.data, payError: null } : { payError: r.reason })
  }, [put])

  const loadDocs = useCallback(async () => {
    const r = await readDocuments()
    put(r.ok ? { docs: r.data, docsError: null } : { docsError: r.reason })
  }, [put])

  const loadRecord = useCallback(async () => {
    const rec = await readRecord()
    if (rec.ok) {
      put({ record: rec.data.record })
      put({ photo: await photoLink(rec.data.record?.photo ?? null) })
    }
  }, [put])

  // Today, as the page comes up; again every five minutes, and when the tab comes back.
  useEffect(() => {
    if (!enabled) return
    void loadToday()
    const t = setInterval(() => void loadToday(), 5 * 60 * 1000)
    const vis = () => { if (document.visibilityState === 'visible') void loadToday() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [enabled, loadToday])

  return { s, put, loadToday, loadMe, loadTeam, loadOrg, loadPayslips, loadDocs, loadRecord }
}

export type MeHandle = ReturnType<typeof useMe>

/**
 * A tapped notice about one's own request (2026-10-17, `?open=me:<id>` — lib/push/notices noticeUrl): the request to
 * open Me on, read once from the address the page started on, then taken off it so a refresh does not open it again;
 * `done()` once Me has closed, so opening it again starts on its hub.
 */
export function useOpenedRequest(enabled = true): [string | null, () => void] {
  const [id, setId] = useState<string | null>(null)
  const done = useCallback(() => setId(null), [])
  useEffect(() => {
    if (!enabled) return
    const want = meOpenTarget(window.location.search)
    if (!want) return
    const q = new URLSearchParams(window.location.search)
    q.delete('open')
    const rest = q.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
    setId(want)
  }, [enabled])
  return [id, done]
}

/** The server's clock, to the second: its reading at `at`, carried on by the device's clock. */
export function useClock(serverNow: string | null | undefined, at: number): number {
  const base = serverNow ? secOf(serverNow) : null
  const calc = () => (base == null ? 0 : (base + Math.floor((Date.now() - at) / 1000)) % 86400)
  const [now, setNow] = useState(calc)
  useEffect(() => {
    setNow(calc())
    if (base == null) return
    const t = setInterval(() => setNow(calc()), 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, at])
  return now
}
