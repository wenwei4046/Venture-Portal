'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, DialogMenu, Field, FinDialog, Hint, Input, type DialogMenuItem } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import { Select } from '@/components/hrv/select'
import { matchState, signed, type ReconGroupView, type ReconHubModel, type ReconLine, type ReconReportView, type ReconSessionModel } from '@/lib/fin-app/recon-model'
import { dayWords } from '@/lib/fin-app/page-model'
import { stageInto } from '@/lib/storage/stage'
import {
  contraBookLines,
  contraStatementLines,
  deleteSession,
  dissolveGroup,
  manualMatch,
  setLineIgnored,
  setSessionStatus,
  unmatchLine,
  uploadStatementInWords,
} from '@/app/(portal)/reconciliation/actions'
import { openReconReport, openReconSession } from '@/app/(portal)/reconciliation/page-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, ListBlock, Notice, RecordItems, Row, SearchRow, StackCards, type ItemLine } from './parts'

// Daily › Reconciliation in the Finance phone app (2026-10-15, part 5c — a page
// the design does not draw, in its style): each bank against the GL and the
// saved months as cards; a card's months; a month as its page — where the
// statement stands against the GL, what it has cleared, its matches, contras
// and ignored lines — with *Match lines* (the statement and book lines still
// open, ticked on both sides until their sums agree: Match, Contra, Ignore),
// its *Report* (the reconciliation statement and its items, the files), and
// Mark done / Reopen and Delete in the ⋯. *Upload statement* in the hub's bar.
// Every step is the review page's own action, answered in words.

type Step =
  | { kind: 'hub' }
  | { kind: 'list'; card: string }
  | { kind: 'record'; id: string; from: string | null }
  | { kind: 'match'; id: string; from: string | null }
  | { kind: 'report'; id: string; from: string | null }

const fromQ = (from: string | null) => (from ? `&from=${encodeURIComponent(from)}` : '')
const searchOf = (s: Step) =>
  s.kind === 'list'
    ? `f=${encodeURIComponent(s.card)}`
    : s.kind === 'record'
      ? `id=${encodeURIComponent(s.id)}${fromQ(s.from)}`
      : s.kind === 'match' || s.kind === 'report'
        ? `id=${encodeURIComponent(s.id)}&part=${s.kind}${fromQ(s.from)}`
        : ''
const parentOf = (s: Step) =>
  s.kind === 'match' || s.kind === 'report' ? `id=${encodeURIComponent(s.id)}${fromQ(s.from)}` : s.kind === 'record' ? (s.from ? `f=${encodeURIComponent(s.from)}` : '') : ''
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const STATEMENT_TYPES = '.pdf,.xlsx,.xls,.csv,.txt'

type Asking = { kind: 'delete' } | { kind: 'group'; group: ReconGroupView; contra: boolean } | { kind: 'ignored'; line: ReconLine }

export default function ReconApp({
  hub,
  search,
  banks,
  defaultMonth,
  may,
  record: initialRecord,
  refused: initialRefused,
}: {
  hub: ReconHubModel
  search: string
  /** Upload statement's banks. */
  banks: Array<{ id: string; label: string }>
  /** The month a statement is usually for: last month (the desktop's). */
  defaultMonth: string
  /** Reconciliation's Create (upload a statement), on this page's boxes. */
  may: { create: boolean }
  record: ReconSessionModel | null
  refused: string | null
}) {
  const router = useRouter()
  const cards = useMemo(() => new Set(hub.cards.map((c) => c.key)), [hub.cards])
  const read = useMemo(
    () =>
      (q: URLSearchParams): Step => {
        const id = q.get('id')
        const f = q.get('from')
        const from = f && cards.has(f) ? f : null
        if (id) {
          const part = q.get('part')
          return part === 'match' ? { kind: 'match', id, from } : part === 'report' ? { kind: 'report', id, from } : { kind: 'record', id, from }
        }
        const card = q.get('f')
        return card && cards.has(card) ? { kind: 'list', card } : { kind: 'hub' }
      },
    [cards],
  )
  const [step, open, back] = useStep(read, search)
  const go = (s: Step) => open(searchOf(s))
  const backTo = () => back(parentOf(step))
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  // ── The month on show, read when a step lands on it ──
  /** A step's refusal, said on the screen until the next step. */
  const [said, setSaid] = useState<string | null>(null)
  const [record, setRecord] = useState<ReconSessionModel | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openReconSession(id).then(
      (res) => {
        if (res.ok) setRecord(res.record)
        else {
          setRecord(null)
          setRefused(res.reason)
        }
      },
      () => {
        setRecord(null)
        setRefused('This reconciliation could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' || step.kind === 'match' || step.kind === 'report' ? step.id : null
  useEffect(() => {
    setSaid(null)
    if (!recordId || record?.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  const [report, setReport] = useState<{ id: string; view: ReconReportView } | { id: string; reason: string } | null>(null)
  const reportId = step.kind === 'report' ? step.id : null
  useEffect(() => {
    if (!reportId || report?.id === reportId) return
    setReport(null)
    void openReconReport(reportId).then(
      (res) => setReport(res.ok ? { id: reportId, view: res.report } : { id: reportId, reason: res.reason }),
      () => setReport({ id: reportId, reason: 'The report could not be read just now. Try again.' }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const [selS, setSelS] = useState<Set<string>>(new Set())
  const [selB, setSelB] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [earlier, setEarlier] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [menu, setMenu] = useState(false)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const r = recordId && record?.id === recordId ? record : null
  const after = (words: string) => {
    flash(words)
    setSelS(new Set())
    setSelB(new Set())
    setReport(null)
    router.refresh()
    if (r) load(r.id)
  }
  const run = (fn: () => Promise<{ error?: string } | void>, words: string) => {
    setSaid(null)
    startBusy(async () => {
      try {
        const res = await fn()
        if (res && res.error) setSaid(res.error)
        else after(words)
      } catch {
        setSaid('That did not go through. Try again.')
      }
    })
  }
  const toggle = (set: (f: (prev: Set<string>) => Set<string>) => void) => (id: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // The month's ⋯: Mark done / Reopen (Approve), Delete (Edit) — the desktop row menu's.
  const recordMenu: DialogMenuItem[] = !r
    ? []
    : [
        ...(r.can.approve
          ? [{ key: 'status', label: r.status === 'done' ? 'Reopen' : 'Mark done', onClick: () => { setMenu(false); run(() => setSessionStatus(r.id, r.status === 'done' ? 'open' : 'done'), r.status === 'done' ? 'Reopened' : 'Marked done') } }]
          : []),
        ...(r.can.edit ? [{ key: 'delete', label: 'Delete reconciliation', sub: 'statement lines and matches', danger: true, onClick: () => { setMenu(false); setError(null); setAsking({ kind: 'delete' }) } }] : []),
      ]

  const uploadBtn: BarButton | null = may.create ? { key: 'upload', label: 'Upload statement', kind: 'primary', onClick: () => setUploading(true) } : null

  let screen: ReactNode
  if (step.kind === 'match') {
    const q = query.trim().toLowerCase()
    const openS = r?.open ?? []
    const book = (r?.book ?? []).filter((b) => earlier || !b.earlier)
    const hit = (l: ReconLine & { entryNo?: string }) => !q || `${l.description} ${l.entryNo ?? ''} ${l.amount} ${l.date}`.toLowerCase().includes(q)
    const st = matchState(openS, r?.book ?? [], selS, selB)
    const bar: BarButton[] = r
      ? [
          { key: 'match', label: `Match ${st.sCount || '…'} ↔ ${st.bCount || '…'}`, kind: 'primary', off: !st.canMatch, disabled: busy, onClick: () => st.canMatch && run(() => manualMatch([...selS], [...selB]), 'Matched') },
          ...(st.canContraBook ? [{ key: 'contra', label: 'Mark contra', disabled: busy, onClick: () => run(() => contraBookLines(r.id, [...selB]), 'Marked contra') }] : []),
          ...(st.canContraStatement ? [{ key: 'contra', label: 'Mark contra', disabled: busy, onClick: () => run(() => contraStatementLines(r.id, [...selS]), 'Marked contra') }] : []),
          ...(st.canIgnore && !st.canContraStatement
            ? [
                {
                  key: 'ignore',
                  label: st.sCount === 1 ? 'Ignore line' : `Ignore ${st.sCount} lines`,
                  disabled: busy,
                  onClick: () =>
                    run(async () => {
                      for (const id of selS) {
                        const res = await setLineIgnored(id, true)
                        if (res.error) return res
                      }
                    }, st.sCount === 1 ? 'Line ignored' : 'Lines ignored'),
                },
              ]
            : []),
        ]
      : []
    const shownS = openS.filter(hit)
    const shownB = book.filter(hit)
    const earlierCount = (r?.book ?? []).filter((b) => b.earlier).length
    screen = (
      <AppScreen screenKey={`recon?${searchOf(step)}`} head={{ kind: 'back', title: 'Match lines', backLabel: r?.month ?? 'Reconciliation', onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={r ? `Reconciliation · ${r.bank} · ${r.month}` : 'Reconciliation'} title="Match lines" />
        {r ? (
          <>
            <Notice>{said ?? st.words}</Notice>
            <SearchRow value={query} onChange={setQuery} placeholder="Search description, entry, amount…" />
            <ListBlock title="Bank statement — not in the books" count={`${selS.size ? `${selS.size} ticked · ` : ''}${openS.length}`} empty={shownS.length === 0 ? (openS.length === 0 ? 'All statement lines settled ✓' : 'No line matches.') : null}>
              {shownS.map((l) => (
                <Row key={l.id} title={l.description || '—'} desc={dayWords(l.date)} amount={signed(l.amount)} tone={l.amount < 0 ? 'out' : 'ledger'} tick={{ on: selS.has(l.id), can: true }} onClick={() => toggle(setSelS)(l.id)} />
              ))}
            </ListBlock>
            <ListBlock title="Book (GL) — not on the statement" count={`${selB.size ? `${selB.size} ticked · ` : ''}${book.length}`} empty={shownB.length === 0 ? (book.length === 0 ? 'Every book line is on the statement ✓' : 'No line matches.') : null}>
              {shownB.map((l) => (
                <Row
                  key={l.id}
                  title={l.description || l.entryNo}
                  desc={`${dayWords(l.date)} · ${l.entryNo}${l.earlier ? ' · earlier' : ''}`}
                  amount={signed(l.amount)}
                  tone={l.amount < 0 ? 'out' : 'ledger'}
                  tick={{ on: selB.has(l.id), can: true }}
                  onClick={() => toggle(setSelB)(l.id)}
                />
              ))}
            </ListBlock>
            {earlierCount > 0 ? (
              <div className={fm.more}>
                <button type="button" className={fm.moreBtn} aria-pressed={earlier} onClick={() => setEarlier((v) => !v)}>
                  {earlier ? 'Hide' : 'Show'} earlier items ({earlierCount})
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'report') {
    const rep = report && report.id === step.id ? report : null
    const view = rep && 'view' in rep ? rep.view : null
    const bar: BarButton[] = view ? view.files.map((f, i) => ({ key: f.key, label: f.label, kind: i === 0 ? ('primary' as const) : undefined, onClick: () => (f.format === 'pdf' ? window.open(f.href, '_blank', 'noopener,noreferrer') : window.location.assign(f.href)) })) : []
    screen = (
      <AppScreen screenKey={`recon?${searchOf(step)}`} head={{ kind: 'back', title: 'Report', backLabel: r?.month ?? 'Reconciliation', onBack: backTo }} bar={bar}>
        <PageHead roman="I." eyebrow={r ? `Reconciliation report · ${r.month}` : 'Reconciliation report'} title={view?.title ?? 'Report'} />
        {view ? (
          <>
            <Group n="I." title="Reconciliation statement">
              {view.walk.map((w) => (
                <Line key={w.label} label={w.label} value={w.value} mono />
              ))}
              <Line label="Result" value={view.verdict.text} tone={view.verdict.tone === 'ledger' ? 'ledger' : view.verdict.tone === 'muted' ? 'muted' : undefined} />
            </Group>
            {view.parts.length === 0 ? <ListBlock title="Reconciling items" count="0" empty="No reconciling items — every statement line is matched and every book entry is presented." /> : null}
            {view.parts.map((p) => (
              <ItemGroup key={p.title} title={p.title} count={String(p.rows.length)} items={p.rows.map((x, i) => ({ key: `${p.title}:${i}`, label: x.label, sub: x.sub, value: x.value, tone: x.tone }))} />
            ))}
          </>
        ) : (
          <div className={d.loading}>{rep && 'reason' in rep ? rep.reason : 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'record') {
    const bar: BarButton[] = r
      ? [
          ...(r.can.edit && (r.counts.open > 0 || r.book.length > 0) ? [{ key: 'match', label: 'Match lines', kind: 'primary' as const, onClick: () => go({ kind: 'match', id: r.id, from: step.from }) }] : []),
          { key: 'report', label: 'Report', kind: r.can.edit && (r.counts.open > 0 || r.book.length > 0) ? undefined : ('primary' as const), onClick: () => go({ kind: 'report', id: r.id, from: step.from }) },
          ...(recordMenu.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu(true) }] : []),
        ]
      : []
    const groupLine = (g: ReconGroupView, contra: boolean): ItemLine => ({ key: g.id, label: g.label, sub: g.sub, value: signed(g.amount), tone: g.amount < 0 ? 'out' : 'ledger', onOpen: () => { setError(null); setAsking({ kind: 'group', group: g, contra }) } })
    const numeral = (() => {
      let n = 0
      return () => `${ROMAN[n++]}.`
    })()
    screen = (
      <AppScreen screenKey={`recon?${searchOf(step)}`} head={{ kind: 'back', title: r?.month || 'Reconciliation', backLabel: step.from ? (hub.lists[step.from]?.title ?? 'Reconciliation') : 'Reconciliation', onBack: backTo }} bar={bar}>
        {r ? (
          <>
            {said ? <Notice>{said}</Notice> : null}
            <div className={d.hero} data-light={r.hero.light}>
              <div className={d.heroTop}>
                <span className={d.kicker}>Bank reconciliation</span>
                <span className={d.heroChip}>
                  <span className={d.heroDot} />
                  {r.status === 'done' ? 'Done' : 'Open'}
                </span>
              </div>
              <div className={d.heroNo}>{r.month}</div>
              <div className={d.heroAmount}>{r.hero.amount}</div>
              <div className={d.heroTo}>{r.hero.to}</div>
              <div className={d.heroNote}>
                <span className={d.heroNoteDot} />
                <span>{r.hero.note}</span>
              </div>
            </div>
            <Group n={numeral()} title="Statement against the GL">
              {r.summary.map((x) => (
                <Line key={x.label} label={x.label} value={x.value} sub={x.sub} mono={x.mono} tone={x.tone} />
              ))}
            </Group>
            <RecordItems roman={numeral()} title="Matched" count={`${r.matched.length}`} items={r.matched.map((g) => groupLine(g, false))} empty="Nothing matched yet." />
            {r.contra.length > 0 ? <RecordItems roman={numeral()} title="Contra" count={`${r.contra.length}`} items={r.contra.map((g) => groupLine(g, true))} /> : null}
            {r.ignored.length > 0 ? (
              <RecordItems
                roman={numeral()}
                title="Ignored"
                count={`${r.ignored.length}`}
                items={r.ignored.map((l) => ({ key: l.id, label: l.description || '—', sub: dayWords(l.date), value: signed(l.amount), tone: 'muted' as const, onOpen: r.can.edit ? () => { setError(null); setAsking({ kind: 'ignored', line: l }) } : undefined }))}
              />
            ) : null}
          </>
        ) : (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const list = hub.lists[step.card]
    screen = (
      <AppScreen screenKey={`recon?f=${step.card}`} head={{ kind: 'back', title: list?.title ?? 'Reconciliation', backLabel: 'Reconciliation', onBack: backTo }} bar={uploadBtn ? [uploadBtn] : []}>
        <PageHead roman="I." eyebrow="Daily · Reconciliation" title={list?.title ?? 'Reconciliation'} />
        {(list?.groups ?? []).map((g) => (
          <ListBlock key={g.title} title={g.title} count={String(g.rows.length)} empty={g.rows.length === 0 ? (g.title === 'Open' ? 'Nothing open.' : 'None.') : null}>
            {g.rows.map((x) => (
              <Row key={x.id} title={x.title} desc={x.desc} amount={x.amount} onClick={() => go({ kind: 'record', id: x.id, from: step.card })} />
            ))}
          </ListBlock>
        ))}
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="/fin-app/page/recon" head={{ kind: 'back', title: 'Reconciliation', backLabel: 'Overview', onBack: leave }} bar={uploadBtn ? [uploadBtn] : []}>
        <BankHero value={hub.hero.value} label={hub.hero.label} chip={hub.chip} />
        <StackCards cards={hub.cards} onOpen={(k) => go({ kind: 'list', card: k })} />
      </AppScreen>
    )
  }

  const askedTitle = !asking ? '' : asking.kind === 'delete' ? `Delete ${r?.month ?? 'this'} reconciliation?` : asking.kind === 'ignored' ? 'Ignored line' : asking.contra ? 'Contra' : 'Matched'
  const confirmDelete = () => {
    if (!r) return
    setError(null)
    startBusy(async () => {
      try {
        const res = await deleteSession(r.id)
        if (res.error) return setError(res.error)
        setAsking(null)
        flash('Reconciliation deleted')
        router.refresh()
        backTo()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  const undoAsked = () => {
    if (!asking || asking.kind === 'delete') return
    setError(null)
    startBusy(async () => {
      try {
        const res =
          asking.kind === 'ignored'
            ? await setLineIgnored(asking.line.id, false)
            : asking.contra || !asking.group.lineId
              ? await dissolveGroup(asking.group.id)
              : await unmatchLine(asking.group.lineId)
        if (res.error) return setError(res.error)
        const words = asking.kind === 'ignored' ? 'Line restored' : asking.contra ? 'Contra dissolved' : 'Unmatched'
        setAsking(null)
        after(words)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <>
      {screen}
      <ReconUploadSheet
        open={uploading}
        banks={banks}
        defaultMonth={defaultMonth}
        onClose={() => setUploading(false)}
        onDone={(id) => {
          setUploading(false)
          flash('Statement uploaded and matched')
          router.refresh()
          go({ kind: 'record', id, from: step.kind === 'list' ? step.card : null })
        }}
      />
      <FinDialog open={menu} onClose={() => setMenu(false)} title={r ? `${r.bank} · ${r.month}` : 'Reconciliation'}>
        <DialogMenu items={recordMenu} />
      </FinDialog>
      <FinDialog open={!!asking} onClose={() => !busy && setAsking(null)} title={askedTitle} sub={asking && asking.kind === 'group' ? signed(asking.group.amount) : undefined} locked={busy}>
        {asking?.kind === 'delete' ? (
          <DialogConfirm text="Its statement lines and matches go with it." confirmLabel={busy ? 'Deleting…' : 'Delete reconciliation'} danger busy={busy} error={error} onCancel={() => setAsking(null)} onConfirm={confirmDelete} />
        ) : asking ? (
          <DialogForm
            onSubmit={undoAsked}
            buttons={
              <>
                <DialogButton onClick={() => setAsking(null)} disabled={busy}>
                  Close
                </DialogButton>
                {r?.can.edit ? (
                  <DialogButton type="submit" kind={asking.kind === 'ignored' ? 'primary' : 'danger'} disabled={busy}>
                    {busy ? 'Working…' : asking.kind === 'ignored' ? 'Restore' : asking.contra ? 'Dissolve' : 'Unmatch'}
                  </DialogButton>
                ) : null}
              </>
            }
          >
            {asking.kind === 'ignored' ? (
              <LinesCard title="Statement" lines={[asking.line]} />
            ) : (
              <>
                {asking.group.statement.length > 0 ? <LinesCard title="Statement" lines={asking.group.statement} /> : null}
                {asking.group.books.length > 0 ? <LinesCard title="Book entries" lines={asking.group.books} /> : null}
              </>
            )}
            {error ? <Hint danger>{error}</Hint> : null}
          </DialogForm>
        ) : null}
      </FinDialog>
    </>
  )
}

/** Lines on a white card: what a match, a contra or an ignored line holds. */
function LinesCard({ title, lines }: { title: string; lines: Array<ReconLine & { entryNo?: string }> }) {
  return (
    <Field label={title}>
      <div className={fm.summary}>
        {lines.map((l) => (
          <div key={l.id}>
            <div className={fm.summaryRow}>
              <span className={fm.summaryLabel}>{l.description || l.entryNo || '—'}</span>
              <span className={fm.summaryValue}>{signed(l.amount)}</span>
            </div>
            <div className={fm.summaryParts}>
              {dayWords(l.date)}
              {l.entryNo ? ` · ${l.entryNo}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Field>
  )
}

/** Upload statement: a bank, the statement's month and its file (PDF for Hong Leong, Excel or CSV for any bank). */
function ReconUploadSheet({
  open,
  banks,
  defaultMonth,
  onClose,
  onDone,
}: {
  open: boolean
  banks: Array<{ id: string; label: string }>
  defaultMonth: string
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [bankId, setBankId] = useState('')
  const [month, setMonth] = useState(defaultMonth)
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setBankId(banks[0]?.id ?? '')
    setMonth(defaultMonth)
    setFile(null)
    setError(null)
  }, [open, banks, defaultMonth])

  const ok = !!bankId && /^\d{4}-\d{2}$/.test(month) && !!file
  const send = async () => {
    if (!ok || busy || !file) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.set('bank_account_id', bankId)
    fd.set('period_month', month)
    try {
      // Sent ahead of the action (2026-10-23, lib/storage/stage.ts) — a statement past a body's 4 MB goes too.
      await stageInto(fd, 'file', file)
      const res = await uploadStatementInWords(fd)
      if (!res.ok) return setError(res.reason)
      onDone(res.id)
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={onClose} title="Upload statement" locked={busy}>
      <DialogForm
        onSubmit={send}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!ok} disabled={busy}>
              {busy ? 'Reading…' : 'Upload & match'}
            </DialogButton>
          </>
        }
      >
        <Field label="Bank" htmlFor="recon-bank">
          <Select id="recon-bank" round={12} className={fm.select} value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Statement month" htmlFor="recon-month">
          <Input id="recon-month" type="month" mono value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="Statement file">
          <div className={fm.files}>
            <div className={fm.file}>
              <span className={fm.fileName}>{file?.name ?? 'No file chosen'}</span>
              {file ? (
                <button type="button" className={fm.fileRemove} onClick={() => setFile(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className={fm.more}>
            <button type="button" className={fm.moreBtn} onClick={() => fileRef.current?.click()}>
              Choose file
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            aria-label="Statement file"
            accept={STATEMENT_TYPES}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}
