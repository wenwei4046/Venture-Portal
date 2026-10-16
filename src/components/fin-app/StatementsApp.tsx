'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, DialogMenu, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import { joinQuery, f2, monthWords, shiftMonth, type PagePlace } from '@/lib/fin-app/page-model'
import { STATEMENT_CARDS, type StatementCard, type StatementHubModel, type StatementRecordModel } from '@/lib/fin-app/statement-model'
import { generateStatementsInWords, issueStatementInWords, markStatementPaidInWords } from '@/app/(portal)/statements/actions'
import { openStatement } from '@/app/(portal)/statements/[id]/page-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ListBlock, Row, StackCards } from './parts'
import s from './fin-app.module.css'

// Fund › Statements in the Finance phone app (2026-10-15, part 5c — a page the
// design does not draw, in its style): the month's net between its arrows over
// the desktop page's cards — the month's statements, every month's drafts,
// every statement; a card's list (the company, its code · state · invoice −
// contra, the net); a statement as its page — its invoice and contra items, the
// net — with the step its status allows (Issue to subsidiary, Mark as paid)
// and Print. *Generate statements* and the month's files in the hub's bar.

type Step = { kind: 'hub' } | { kind: 'list'; card: StatementCard } | { kind: 'record'; id: string; from: StatementCard | null }

const asCard = (v: string | null): StatementCard | null => (v && (STATEMENT_CARDS as readonly string[]).includes(v) ? (v as StatementCard) : null)

export function readStatementStep(q: URLSearchParams): Step {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const stepQuery = (st: Step) => (st.kind === 'record' ? `id=${encodeURIComponent(st.id)}${st.from ? `&from=${st.from}` : ''}` : st.kind === 'list' ? `f=${st.card}` : '')
const TITLE: Record<StatementCard, string> = { month: 'This month', draft: 'Draft', all: 'All statements' }

export default function StatementsApp({
  place,
  month,
  hub,
  search,
  canGenerate,
  canExport = false,
  record: initialRecord,
  refused: initialRefused,
}: {
  place: PagePlace
  /** The month on show, `YYYY-MM`. */
  month: string
  hub: StatementHubModel
  search: string
  /** Treasury's Create on the page's boxes: Generate statements. */
  canGenerate: boolean
  /** Treasury · Export: the month's files (2026-10-16 — the route asks it). */
  canExport?: boolean
  record: StatementRecordModel | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readStatementStep, search)
  // A list or a record keeps the month on show in its address, so a refresh lands where it was.
  const go = (st: Step) => open(joinQuery(place.keep, stepQuery(st)))
  const backTo = () => back(joinQuery(place.keep, step.kind === 'record' && step.from ? `f=${step.from}` : ''))
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  // ── The month on show: the server's to read ──
  const [moving, startMove] = useTransition()
  const [goingTo, setGoingTo] = useState<string | null>(null)
  const move = (keep: string | null, label: string) => {
    if (keep === null) return
    setGoingTo(label)
    startMove(() => router.replace(`${place.href}${keep ? `?${keep}` : ''}`, { scroll: false }))
  }

  const [record, setRecord] = useState<StatementRecordModel | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openStatement(id).then(
      (res) => {
        if (res.ok) setRecord(res.record)
        else {
          setRecord(null)
          setRefused(res.reason)
        }
      },
      () => {
        setRecord(null)
        setRefused('This statement could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    if (!recordId || record?.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  const [generating, setGenerating] = useState(false)
  const [menu, setMenu] = useState(false)
  const [busy, startBusy] = useTransition()

  const files = [
    { key: 'pdf', label: 'Export PDF', href: `/statements/monthly/export?format=pdf&period=${month}`, pdf: true },
    { key: 'xlsx', label: 'Export Excel', href: `/statements/monthly/export?format=xlsx&period=${month}`, pdf: false },
  ]
  const fetchFile = (f: (typeof files)[number]) => {
    setMenu(false)
    if (f.pdf) window.open(f.href, '_blank', 'noopener,noreferrer')
    else window.location.assign(f.href)
  }
  const fileButtons: BarButton[] = [
    { key: 'pdf', label: 'Export PDF', onClick: () => fetchFile(files[0]) },
    { key: 'more', label: '⋯', kind: 'more', onClick: () => setMenu(true) },
  ]
  const hubBar: BarButton[] = canGenerate
    ? [{ key: 'generate', label: 'Generate statements', kind: 'primary', onClick: () => setGenerating(true) }, ...(canExport ? fileButtons : [])]
    : canExport
      ? files.map((f, i) => ({ key: f.key, label: f.label, kind: i === 0 ? ('primary' as const) : undefined, onClick: () => fetchFile(f) }))
      : []

  const r = step.kind === 'record' && record?.id === step.id ? record : null
  // Issue and Mark as paid go one way — an issued statement locks (Generate statements skips it) and nothing
  // here takes either back — so each is asked first (2026-10-15, the user: a thumb lands on the bar's first
  // button by mistake). The refusal stays in the question.
  const [asking, setAsking] = useState<'issue' | 'paid' | null>(null)
  const [askError, setAskError] = useState<string | null>(null)
  const ask = (which: 'issue' | 'paid') => {
    setAskError(null)
    setAsking(which)
  }
  const confirmStep = () => {
    if (!r || !asking) return
    const which = asking
    setAskError(null)
    startBusy(async () => {
      try {
        const res = which === 'issue' ? await issueStatementInWords(r.id) : await markStatementPaidInWords(r.id)
        if (!res.ok) return setAskError(res.reason)
        setAsking(null)
        flash(which === 'issue' ? 'Statement issued' : 'Statement marked paid')
        router.refresh()
        load(r.id)
      } catch {
        setAskError('That did not go through. Try again.')
      }
    })
  }

  let screen: ReactNode
  if (step.kind === 'record') {
    const bar: BarButton[] = r
      ? [
          ...(r.can.issue ? [{ key: 'issue', label: 'Issue to subsidiary', kind: 'primary' as const, disabled: busy, onClick: () => ask('issue') }] : []),
          ...(r.can.paid ? [{ key: 'paid', label: 'Mark as paid', kind: 'primary' as const, disabled: busy, onClick: () => ask('paid') }] : []),
          { key: 'print', label: 'Print statement', onClick: () => window.open(`/statements/${r.id}/print`, '_blank', 'noopener,noreferrer') },
        ]
      : []
    screen = (
      <AppScreen screenKey={`statements?${stepQuery(step)}`} head={{ kind: 'back', title: r?.company || 'Statement', backLabel: step.from ? TITLE[step.from] : 'Statements', onBack: backTo }} bar={bar}>
        {r ? (
          <>
            <div className={d.hero} data-light={r.status === 'paid' ? 'ledger' : r.status === 'issued' ? 'alert' : 'def'}>
              <div className={d.heroTop}>
                <span className={d.kicker}>Monthly statement</span>
                <span className={d.heroChip}>
                  <span className={d.heroDot} />
                  {r.status}
                </span>
              </div>
              <div className={d.heroNo}>
                {r.period}
                {r.code ? ` · ${r.code}` : ''}
              </div>
              <div className={d.heroAmount}>{r.net}</div>
              <div className={d.heroTo}>{r.direction}</div>
              <div className={d.heroNote}>
                <span className={d.heroNoteDot} />
                <span>{r.issued ? `Issued ${r.issued}` : `Created ${r.created}`}</span>
              </div>
            </div>
            <Group
              n="I."
              title={`Invoice items · ${r.invoiceLines.length}`}
              foot={r.invoiceLines.length > 0 ? { l: 'Subtotal invoice', v: f2(r.invoice) } : undefined}
              empty={r.invoiceLines.length === 0 ? 'No invoice items for this period.' : undefined}
            >
              {r.invoiceLines.map((l) => (
                <Line key={l.key} label={l.label} value={l.value} sub={l.sub} mono />
              ))}
            </Group>
            <Group
              n="II."
              title={`Contra items · ${r.contraLines.length}`}
              foot={r.contraLines.length > 0 ? { l: 'Subtotal contra', v: r.contra ? `−${f2(r.contra)}` : f2(0) } : undefined}
              empty={r.contraLines.length === 0 ? 'No contra items.' : undefined}
            >
              {r.contraLines.map((l) => (
                <Line key={l.key} label={l.label} value={l.value} sub={l.sub} mono />
              ))}
            </Group>
            <Group n="III." title="Net summary">
              <Line label="Subtotal invoice" value={f2(r.invoice)} mono />
              <Line label="Subtotal contra" value={r.contra ? `−${f2(r.contra)}` : f2(0)} mono />
              <Line label="Net payable" value={r.net} mono sub={r.direction} />
              <Line label="Created" value={r.created} mono />
              {r.issued ? <Line label="Issued" value={r.issued} mono /> : null}
            </Group>
          </>
        ) : (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const groups = hub.lists[card]
    const all = groups.reduce((t, g) => t + g.rows.length, 0)
    screen = (
      <AppScreen screenKey={`statements?f=${card}`} head={{ kind: 'back', title: TITLE[card], backLabel: 'Statements', onBack: backTo }} bar={canGenerate ? [{ key: 'generate', label: 'Generate statements', kind: 'primary', onClick: () => setGenerating(true) }] : []}>
        <PageHead roman="II." eyebrow={card === 'month' ? `Statements · ${place.period?.label ?? ''}` : 'Fund · Statements'} title={TITLE[card]} />
        {all === 0 ? (
          <ListBlock title="Statements" count="0" empty={card === 'draft' ? 'No draft waiting.' : card === 'month' ? `No statements for ${place.period?.label ?? 'this month'}.` : 'No statements yet.'} />
        ) : (
          groups.map((g) => (
            <ListBlock key={g.title} title={g.title} count={String(g.rows.length)} empty={null}>
              {g.rows.map((x) => (
                <Row key={x.id} title={x.title} desc={x.desc} amount={x.amount} tone={x.tone} onClick={() => go({ kind: 'record', id: x.id, from: card })} />
              ))}
            </ListBlock>
          ))
        )}
      </AppScreen>
    )
  } else {
    const p = place.period
    screen = (
      <AppScreen screenKey={place.href} head={{ kind: 'back', title: 'Statements', backLabel: 'Overview', onBack: leave }} bar={hubBar}>
        <BankHero
          value={hub.hero.value}
          label={hub.hero.label}
          chip={hub.chip}
          month={p ? { label: goingTo && moving ? goingTo : p.label, prev: () => move(p.prev, monthWords(shiftMonth(month, -1))), next: () => move(p.next, monthWords(shiftMonth(month, 1))), canPrev: p.prev !== null, canNext: p.next !== null } : null}
        />
        <div className={moving ? s.pending : undefined}>
          <StackCards cards={hub.cards} onOpen={(k) => go({ kind: 'list', card: k as StatementCard })} />
        </div>
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      <FinDialog open={menu} onClose={() => setMenu(false)} title="Statements">
        <DialogMenu items={[{ key: 'xlsx', label: 'Export Excel', onClick: () => fetchFile(files[1]) }]} />
      </FinDialog>
      <FinDialog
        open={asking !== null && !!r}
        onClose={() => !busy && setAsking(null)}
        title={asking === 'paid' ? `Mark ${r?.company ?? 'this statement'} paid?` : `Issue to ${r?.company ?? 'the subsidiary'}?`}
        sub={r ? `${r.period} · ${r.net}` : undefined}
        locked={busy}
      >
        <DialogConfirm
          text={asking === 'paid' ? 'This cannot be undone.' : 'An issued statement is locked — Generate statements skips it. This cannot be undone.'}
          confirmLabel={busy ? (asking === 'paid' ? 'Marking…' : 'Issuing…') : asking === 'paid' ? 'Mark as paid' : 'Issue statement'}
          busy={busy}
          error={askError}
          onCancel={() => setAsking(null)}
          onConfirm={confirmStep}
        />
      </FinDialog>
      <GenerateSheet
        open={generating}
        month={month}
        onClose={() => setGenerating(false)}
        onDone={(made, words) => {
          setGenerating(false)
          flash(words)
          if (made !== month) move(`m=${made}`, monthWords(made))
          else router.refresh()
        }}
      />
    </>
  )
}

/** Generate statements: a month's drafts made (again) for every active subsidiary; an issued one is left as it is. */
function GenerateSheet({ open, month, onClose, onDone }: { open: boolean; month: string; onClose: () => void; onDone: (month: string, words: string) => void }) {
  const [period, setPeriod] = useState(month)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trouble, setTrouble] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    setPeriod(month)
    setError(null)
    setTrouble([])
  }, [open, month])

  const go = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setTrouble([])
    try {
      const res = await generateStatementsInWords(period)
      if (!res.ok) return setError(res.reason)
      const words = `${res.generated} generated · ${res.skipped} skipped`
      // A company's trouble stays in the sheet to be read; the rest went through.
      if (res.errors.length > 0) {
        setTrouble(res.errors)
        setError(`${words} — ${res.errors.length} with trouble:`)
        return
      }
      onDone(res.period.slice(0, 7), words)
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FinDialog open={open} onClose={onClose} title="Generate statements" locked={busy}>
      <DialogForm
        onSubmit={go}
        buttons={
          <>
            <DialogButton onClick={onClose} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton type="submit" kind="primary" off={!/^\d{4}-\d{2}$/.test(period)} disabled={busy}>
              {busy ? 'Generating…' : 'Yes, generate'}
            </DialogButton>
          </>
        }
      >
        <Field label="Period" htmlFor="stmt-period">
          <Input id="stmt-period" type="month" mono value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Hint>Drafts for every active subsidiary, made again; issued statements are skipped.</Hint>
        {error ? <Hint danger>{error}</Hint> : null}
        {trouble.map((t) => (
          <Hint key={t} danger>
            {t}
          </Hint>
        ))}
      </DialogForm>
    </FinDialog>
  )
}
