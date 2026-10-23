'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'
import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import { BA_CARDS, BA_TITLE, calcOf, type BaCard, type BaHubModel, type BaListRow, type BaRecordModel } from '@/lib/fin-app/ba-model'
import { f2 } from '@/lib/fin-app/page-model'
import { stageInto } from '@/lib/storage/stage'
import type { CompanyOption, LimitRow } from '@/app/(portal)/ba/_components/BaView'
import { deleteBa, deleteBaAttachment, generateBaInvoice, getBaAttachmentUrl, setBaStatus, uploadBaAttachment } from '@/app/(portal)/ba/actions'
import { openBaFinancing } from '@/app/(portal)/ba/page-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { BaCalcSheet, BaFormSheet, BaLimitSheet, BaPvSheet } from './BaSheets'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, ListBlock, Notice, RecordItems, Row, SearchRow, StackCards, type ItemLine } from './parts'

// Fund › Invoice Financing in the Finance phone app (2026-10-15, part 5c — a
// page the design does not draw, in its style): the active face over the
// desktop page's cards — what the borrowers are charged, what HC is owed, HV's
// margin — then the register and the limits; a card's list (the borrower, its
// ref · terms, the figure); a financing as its page — the drawer's hero, its
// terms, dates, billing, its borrower's facility, its documents — with the
// desktop page's steps (Generate PV · Bill interest · Mark settled / Reopen,
// Edit and Delete in the ⋯). *Record financing* and the *Calculator* in the
// hub's bar; a limit's Edit on its company, *Set a limit* for another.

type Step = { kind: 'hub' } | { kind: 'list'; card: BaCard } | { kind: 'record'; id: string; from: BaCard | null }

const asCard = (v: string | null): BaCard | null => (v && (BA_CARDS as readonly string[]).includes(v) ? (v as BaCard) : null)

export function readBaStep(q: URLSearchParams): Step {
  const id = q.get('id')
  if (id) return { kind: 'record', id, from: asCard(q.get('from')) }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const searchOf = (s: Step) => (s.kind === 'record' ? `id=${encodeURIComponent(s.id)}${s.from ? `&from=${s.from}` : ''}` : s.kind === 'list' ? `f=${s.card}` : '')
const parentOf = (s: Step) => (s.kind === 'record' ? (s.from ? `f=${s.from}` : '') : '')
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const DOC_TYPES = 'application/pdf,image/png,image/jpeg,image/webp,image/gif'

type RecordStep = { key: string; label: string; act: () => void }

export default function BaApp({
  hub,
  search,
  today,
  companies,
  limits,
  autoRead,
  may,
  record: initialRecord,
  refused: initialRefused,
}: {
  hub: BaHubModel
  search: string
  today: string
  /** The Record financing sheet's borrowers and their limits (its over-limit warning). */
  companies: CompanyOption[]
  limits: LimitRow[]
  autoRead: boolean
  /** Treasury's Create (record financing) and Edit (a limit), on this page's boxes. */
  may: { create: boolean; edit: boolean }
  record: BaRecordModel | null
  refused: string | null
}) {
  const router = useRouter()
  const [step, open, back] = useStep(readBaStep, search)
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

  /** A step's refusal, said on the record until the next step (a toast is gone before it is read). */
  const [said, setSaid] = useState<string | null>(null)
  const [record, setRecord] = useState<BaRecordModel | null>(initialRecord)
  const [refused, setRefused] = useState<string | null>(initialRefused)
  const load = useCallback((id: string) => {
    setRefused(null)
    void openBaFinancing(id).then(
      (res) => {
        if (res.ok) setRecord(res.record)
        else {
          setRecord(null)
          setRefused(res.reason)
        }
      },
      () => {
        setRecord(null)
        setRefused('This financing could not be read just now. Try again.')
      },
    )
  }, [])
  const recordId = step.kind === 'record' ? step.id : null
  useEffect(() => {
    setSaid(null)
    if (!recordId || record?.id === recordId) return
    setRecord(null)
    load(recordId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  const [query, setQuery] = useState('')
  const [form, setForm] = useState<{ editing: BaRecordModel['row'] | null } | null>(null)
  const [calc, setCalc] = useState(false)
  const [pv, setPv] = useState<{ id: string; ref: string; owe: number; maturity: string } | null>(null)
  const [limitOf, setLimitOf] = useState<{ companyId: string; label: string; limit: number } | 'new' | null>(null)
  const [menu, setMenu] = useState(false)
  const [doc, setDoc] = useState<{ id: string; name: string } | null>(null)
  const [asking, setAsking] = useState<'delete' | 'unfile' | 'bill' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const r = step.kind === 'record' && record?.id === step.id ? record : null
  const after = (words: string) => {
    flash(words)
    router.refresh()
    if (r) load(r.id)
  }
  /** A step of the record's own, answered in words; a throw (a gate) said plainly. */
  const run = (fn: () => Promise<{ error?: string } & Record<string, unknown>>, words: (res: Record<string, unknown>) => string) => {
    setSaid(null)
    startBusy(async () => {
      try {
        const res = await fn()
        if (res?.error) setSaid(res.error)
        else after(words(res ?? {}))
      } catch {
        setSaid('That did not go through. Try again.')
      }
    })
  }
  const view = (id: string) =>
    startBusy(async () => {
      try {
        const res = await getBaAttachmentUrl(id)
        if (res.url) window.open(res.url, '_blank', 'noopener')
        else setSaid(res.error ?? 'The document could not be opened.')
      } catch {
        setSaid('The document could not be opened just now. Try again.')
      }
    })

  // The record's steps, in the desktop page's order: the PV to HC, billing the borrower, settling (or
  // reopening) — the first two in the bar, the rest in the ⋯ with Edit and Delete (shut, saying why, while
  // the interest is billed or paid — the server refuses the same).
  const steps: RecordStep[] = !r
    ? []
    : [
        ...(r.can.pv ? [{ key: 'pv', label: 'Generate PV', act: () => setPv({ id: r.id, ref: r.ref, owe: r.oweToHc, maturity: r.row.maturityDate }) }] : []),
        ...(r.can.bill
          ? [{ key: 'bill', label: 'Bill interest', act: () => { setSaid(null); setError(null); setAsking('bill') } }]
          : []),
        ...(r.can.settle ? [{ key: 'settle', label: 'Mark settled', act: () => run(() => setBaStatus(r.id, 'settled'), () => 'Marked settled — the limit is released.') }] : []),
        ...(r.can.reopen ? [{ key: 'reopen', label: 'Reopen', act: () => run(() => setBaStatus(r.id, 'active'), () => 'Reopened.') }] : []),
      ]
  const menuItems: DialogMenuItem[] = !r
    ? []
    : [
        ...steps.slice(2).map((x) => ({ key: x.key, label: x.label, onClick: () => { setMenu(false); x.act() } })),
        ...(r.can.edit ? [{ key: 'edit', label: 'Edit financing', sub: r.locked ?? undefined, disabled: !!r.locked, onClick: () => { setMenu(false); setForm({ editing: r.row }) } }] : []),
        ...(r.can.remove ? [{ key: 'delete', label: 'Delete financing', sub: r.locked ?? undefined, disabled: !!r.locked, danger: true, onClick: () => { setMenu(false); setError(null); setAsking('delete') } }] : []),
      ]

  const recordBtn: BarButton | null = may.create ? { key: 'new', label: 'Record financing', kind: 'primary', onClick: () => setForm({ editing: null }) } : null
  const rowOf = (x: BaListRow, card: BaCard) => <Row key={x.id} title={x.title} desc={x.desc} amount={x.amount} tone={x.tone} onClick={() => go({ kind: 'record', id: x.id, from: card })} />

  let screen: ReactNode
  if (step.kind === 'record') {
    const bar: BarButton[] = [
      ...steps.slice(0, 2).map((x, i) => ({ key: x.key, label: x.label, kind: i === 0 ? ('primary' as const) : undefined, disabled: busy, onClick: x.act })),
      ...(menuItems.length > 0 ? [{ key: 'more', label: '⋯', kind: 'more' as const, onClick: () => setMenu(true) }] : []),
    ]
    const docs: ItemLine[] = r
      ? [
          ...r.attachments.map((a) => ({ key: a.id, label: a.name, action: { label: 'View', onClick: () => view(a.id) }, onOpen: r.can.files ? () => setDoc(a) : undefined })),
          ...(r.can.files ? [{ key: 'attach', label: 'The bank’s document', action: { label: 'Attach', off: busy, onClick: () => fileRef.current?.click() } }] : []),
        ]
      : []
    screen = (
      <AppScreen screenKey={`ba?${searchOf(step)}`} head={{ kind: 'back', title: r?.ref || 'Financing', backLabel: step.from ? BA_TITLE[step.from] : 'Invoice Financing', onBack: backTo }} bar={bar}>
        {r ? (
          <>
            {said ? <Notice>{said}</Notice> : null}
            <div className={d.hero} data-light={r.state.light}>
              <div className={d.heroTop}>
                <span className={d.kicker}>Invoice financing</span>
                <span className={d.heroChip}>
                  <span className={d.heroDot} />
                  {r.state.words}
                </span>
              </div>
              <div className={d.heroNo}>{r.ref}</div>
              <div className={d.heroAmount}>{r.face}</div>
              <div className={d.heroTo}>
                {r.borrower}
                {r.bankName ? ` · ${r.bankName}` : ''}
              </div>
              <div className={d.heroNote}>
                <span className={d.heroNoteDot} />
                <span>{r.note}</span>
              </div>
            </div>
            {r.groups.map((g, i) => (
              <Group key={g.title} n={`${ROMAN[i]}.`} title={g.title}>
                {g.lines.map((l) => (
                  <Line key={l.label} label={l.label} value={l.value} sub={l.sub} mono={l.mono} tone={l.tone} />
                ))}
              </Group>
            ))}
            <RecordItems roman={`${ROMAN[r.groups.length]}.`} title="Documents" count={String(r.attachments.length)} items={docs} empty="No document filed." />
          </>
        ) : (
          <div className={d.loading}>{refused ?? 'Loading…'}</div>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    let body: ReactNode
    let bar: BarButton[] = recordBtn ? [recordBtn] : []
    if (card === 'limits') {
      bar = may.edit && hub.others.length > 0 ? [{ key: 'set', label: 'Set a limit', kind: 'primary', onClick: () => setLimitOf('new') }] : []
      body =
        hub.limits.length === 0 ? (
          <ListBlock title="Limits" count="0" empty="No company has a BA limit yet." />
        ) : (
          hub.limits.map((l) => (
            <ItemGroup
              key={l.companyId}
              title={l.label}
              count={l.pct != null ? `${Math.round(l.pct)}% of limit` : 'no limit set'}
              items={[
                {
                  key: 'used',
                  label: 'Outstanding',
                  sub: `limit ${l.limit > 0 ? `RM ${f2(l.limit)}` : '—'} · available ${l.limit > 0 ? `RM ${f2(l.available)}` : '—'}${l.avgRatePa != null ? ` · avg rate ${parseFloat((l.avgRatePa * 100).toFixed(2))}% p.a.` : ''}`,
                  value: f2(l.used),
                  tone: l.tone === 'danger' ? 'out' : l.tone === 'alert' ? 'alert' : null,
                  action: may.edit ? { label: 'Edit limit', onClick: () => setLimitOf({ companyId: l.companyId, label: l.label, limit: l.limit }) } : null,
                },
                ...l.active.map((a) => ({
                  key: a.id,
                  label: a.label,
                  sub: a.sub,
                  chip: a.late ? { text: 'overdue', tone: 'danger' as const } : a.soon ? { text: 'soon', tone: 'alert' as const } : null,
                  onOpen: () => go({ kind: 'record', id: a.id, from: 'limits' }),
                })),
                ...(l.active.length === 0 ? [{ key: 'none', label: 'No active BA.', tone: 'muted' as const }] : []),
              ]}
            />
          ))
        )
    } else if (card === 'register') {
      const q = query.trim().toLowerCase()
      const pick = (list: BaListRow[]) => list.filter((x) => !q || x.search.includes(q) || x.desc.toLowerCase().includes(q))
      const all = hub.lists.register.active.length + hub.lists.register.settled.length + hub.lists.register.cancelled.length
      const parts: Array<[string, BaListRow[]]> = [
        ['Active', pick(hub.lists.register.active)],
        ['Settled', pick(hub.lists.register.settled)],
        ['Cancelled', pick(hub.lists.register.cancelled)],
      ]
      body = (
        <>
          <SearchRow value={query} onChange={setQuery} placeholder="Search ref, bank, borrower, notes…" />
          {all === 0 ? (
            <ListBlock title="Financings" count="0" empty="No financing recorded yet." />
          ) : (
            parts
              .filter(([title, list]) => title === 'Active' || list.length > 0)
              .map(([title, list]) => (
                <ListBlock key={title} title={title} count={String(list.length)} empty={list.length === 0 ? (q ? 'No financing matches.' : 'No active financing.') : null}>
                  {list.map((x) => rowOf(x, 'register'))}
                </ListBlock>
              ))
          )}
        </>
      )
    } else {
      const list = hub.lists[card]
      const total = hub.cards.find((c) => c.key === card)?.value ?? ''
      body = (
        <ListBlock title="Active financings" count={`${list.length} · ${total}`} empty={list.length === 0 ? 'No active financing.' : null}>
          {list.map((x) => rowOf(x, card))}
        </ListBlock>
      )
    }
    screen = (
      <AppScreen screenKey={`ba?f=${card}`} head={{ kind: 'back', title: BA_TITLE[card], backLabel: 'Invoice Financing', onBack: backTo }} bar={bar}>
        <PageHead roman="II." eyebrow={card === 'limits' ? `Invoice Financing · ${hub.limitsCount}` : 'Fund · Invoice Financing'} title={BA_TITLE[card]} />
        {body}
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen
        screenKey="/fin-app/page/ba"
        head={{ kind: 'back', title: 'Invoice Financing', backLabel: 'Overview', onBack: leave }}
        bar={[...(recordBtn ? [recordBtn] : []), { key: 'calc', label: 'Calculator', onClick: () => setCalc(true) }]}
      >
        <BankHero value={hub.hero.value} label={hub.hero.label} chip={hub.chip} />
        <StackCards cards={hub.cards} onOpen={(k) => go({ kind: 'list', card: k as BaCard })} />
      </AppScreen>
    )
  }

  const upload = (file: File | null) => {
    if (!file || !r) return
    const fd = new FormData()
    // Sent ahead of the action (2026-10-23, lib/storage/stage.ts) — up to 100 MB, not a body's 4 MB.
    run(
      () =>
        stageInto(fd, 'file', file).then(
          () => uploadBaAttachment(r.id, fd),
          (err: unknown) => ({ error: err instanceof Error ? err.message : 'The document could not be sent.' }),
        ),
      () => 'Document filed',
    )
  }
  const confirmAsked = () => {
    if (!r) return
    setError(null)
    startBusy(async () => {
      try {
        if (asking === 'delete') {
          const res = await deleteBa(r.id)
          if (res?.error) return setError(res.error)
          setAsking(null)
          flash(`${r.ref} deleted`)
          router.refresh()
          backTo()
        } else if (asking === 'unfile' && doc) {
          const res = await deleteBaAttachment(doc.id)
          if (res?.error) return setError(res.error)
          setAsking(null)
          setDoc(null)
          after('Document removed')
        } else if (asking === 'bill') {
          const res = await generateBaInvoice(r.id)
          if (res?.error) return setError(res.error)
          setAsking(null)
          after(`Invoice ${res.invoiceNo ?? ''} created as draft — review and issue it in Invoices`)
        }
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  const closeAsk = () => {
    if (busy) return
    setAsking(null)
    setDoc(null)
  }

  return (
    <>
      {screen}
      <input
        ref={fileRef}
        type="file"
        hidden
        aria-label="Attach the bank’s document"
        accept={DOC_TYPES}
        onChange={(e) => {
          upload(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <BaFormSheet
        open={!!form}
        editing={form?.editing ?? null}
        companies={companies}
        limits={limits}
        autoRead={autoRead}
        today={today}
        onClose={() => setForm(null)}
        onDone={(id, words) => {
          setForm(null)
          flash(words)
          router.refresh()
          if (step.kind === 'record' && step.id === id) load(id)
          else go({ kind: 'record', id, from: step.kind === 'list' ? step.card : null })
        }}
      />
      <BaCalcSheet open={calc} today={today} onClose={() => setCalc(false)} />
      <BaPvSheet
        target={pv}
        banks={r?.banks ?? []}
        today={today}
        onClose={() => setPv(null)}
        onDone={(words) => {
          setPv(null)
          after(words)
        }}
      />
      <BaLimitSheet
        target={limitOf}
        others={hub.others}
        onClose={() => setLimitOf(null)}
        onDone={(words) => {
          setLimitOf(null)
          flash(words)
          router.refresh()
        }}
      />
      <FinDialog open={menu} onClose={() => setMenu(false)} title={r?.ref ?? 'Financing'}>
        <DialogMenu items={menuItems} />
      </FinDialog>
      <FinDialog open={!!doc && asking === null} onClose={() => setDoc(null)} title={doc?.name ?? 'Document'}>
        <DialogMenu
          items={[
            { key: 'view', label: 'View document', onClick: () => { if (doc) view(doc.id); setDoc(null) } },
            { key: 'remove', label: 'Remove document', danger: true, onClick: () => { setError(null); setAsking('unfile') } },
          ]}
        />
      </FinDialog>
      <FinDialog
        open={asking !== null}
        onClose={closeAsk}
        title={asking === 'bill' ? `Bill ${r?.borrower ?? 'the borrower'}?` : asking === 'delete' ? `Delete ${r?.ref ?? 'this financing'}?` : 'Remove this document?'}
        sub={asking === 'bill' && r ? `${r.ref} · RM ${f2(calcOf(r.row).chargeToBorrower)}` : undefined}
        locked={busy}
      >
        <DialogConfirm
          text={
            asking === 'bill'
              ? 'The interest goes out as a draft invoice (5028) to review and issue in Invoices.'
              : asking === 'delete'
                ? 'Its filed documents are removed too.'
                : `${doc?.name ?? 'The document'} comes off the financing.`
          }
          confirmLabel={
            busy
              ? asking === 'bill'
                ? 'Billing…'
                : asking === 'delete'
                  ? 'Deleting…'
                  : 'Removing…'
              : asking === 'bill'
                ? 'Bill interest'
                : asking === 'delete'
                  ? 'Delete financing'
                  : 'Remove document'
          }
          danger={asking !== 'bill'}
          busy={busy}
          error={error}
          onCancel={closeAsk}
          onConfirm={confirmAsked}
        />
      </FinDialog>
    </>
  )
}
