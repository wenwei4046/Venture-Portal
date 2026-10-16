'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import { COST_MODEL_LABEL, switchConsequence, switchedNote, type CostModel, type DepartmentMode } from '@/lib/department-mode'
import { DEPT_CARDS, SEGMENT_KEY, modeWords, segmentKeyOf, slugOf, type DeptCard, type DeptLine, type DepartmentsModel } from '@/lib/fin-app/departments-model'
import { addDepartmentInWords, provisionDepartmentInWords, setDepartmentBillbackInWords } from '@/app/(portal)/settings/actions'
import { setDepartmentCostModel } from '@/app/(portal)/settings/department-mode-actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, Notice, StackCards, type ItemLine } from './parts'

// Profile › Admin › Departments in the Finance phone app (2026-10-15, part
// E3b — a page the design does not draw, in its style): Settings ›
// Departments — the departments over *Departments* and *Bill back salary*,
// each department its own screen with the desktop's steps on it: *Bill back
// salary* (one press, as the desktop's tick — it is taken back the same way),
// *Switch to …* (the person signed in, `canSwitch`; it says what it does and
// asks first, as the desktop's switch), *Provision* (asks for the segment key
// and says it cannot be undone). *+ New department* asks the name, which
// stays. Every write is the desktop's own action, answered in words.

type Step = { kind: 'hub' } | { kind: 'list'; card: DeptCard } | { kind: 'detail'; id: string; from: DeptCard | null }

const asCard = (v: string | null): DeptCard | null => (v && (DEPT_CARDS as readonly string[]).includes(v) ? (v as DeptCard) : null)

export function readDeptStep(q: URLSearchParams): Step {
  const d = q.get('d')
  if (d) return { kind: 'detail', id: d, from: asCard(q.get('f')) }
  const card = asCard(q.get('f'))
  return card ? { kind: 'list', card } : { kind: 'hub' }
}
const stepQuery = (s: Step) =>
  s.kind === 'detail' ? `${s.from ? `f=${s.from}&` : ''}d=${encodeURIComponent(s.id)}` : s.kind === 'list' ? `f=${s.card}` : ''
const TITLE: Record<DeptCard, string> = { all: 'Departments', billback: 'Bill back salary' }

export default function DepartmentsApp({ model, search, canManage }: { model: DepartmentsModel; search: string; canManage: boolean }) {
  const router = useRouter()
  const [step, open, back] = useStep(readDeptStep, search)
  const go = (s: Step) => open(stepQuery(s))
  const backTo = () => back(step.kind === 'detail' && step.from ? `f=${step.from}` : '')
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app/profile')
  }
  const byId = useMemo(() => new Map(model.depts.map((d) => [d.id, d])), [model.depts])

  // ── The steps: a press (Bill back), or a sheet that asks (new, provision, mode) ──
  const [busy, startBusy] = useTransition()
  const [said, setSaid] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [provisioning, setProvisioning] = useState<DeptLine | null>(null)
  const [switching, setSwitching] = useState<DepartmentMode | null>(null)
  const done = (words: string) => {
    flash(words)
    router.refresh()
  }
  const billback = (d: DeptLine) => {
    setSaid(null)
    startBusy(async () => {
      try {
        const res = await setDepartmentBillbackInWords(d.id, !d.billback)
        if (!res.ok) return setSaid(res.reason)
        done(d.billback ? `${d.name} keeps its own-share salary` : `${d.name} bills its own-share salary back`)
      } catch {
        setSaid('That did not go through. Try again.')
      }
    })
  }

  const newBtn: BarButton[] = canManage ? [{ key: 'new', label: '+ New department', kind: 'primary', onClick: () => setAdding(true) }] : []
  let screen: ReactNode
  if (step.kind === 'detail') {
    const d = byId.get(step.id) ?? null
    const target: CostModel | null = d?.mode ? (d.mode.costModel === 'centralized' ? 'cost_center' : 'centralized') : null
    const bar: BarButton[] = d
      ? [
          ...(canManage && !d.full && !d.internal ? [{ key: 'provision', label: 'Provision', kind: 'primary' as const, disabled: busy, onClick: () => setProvisioning(d) }] : []),
          ...(canManage && d.billsBack
            ? [{ key: 'billback', label: d.billback ? 'Stop billing back' : 'Bill back salary', disabled: busy, onClick: () => billback(d) }]
            : []),
          ...(d.mode?.canSwitch && target ? [{ key: 'mode', label: `Switch to ${COST_MODEL_LABEL[target]}`, disabled: busy, onClick: () => setSwitching(d.mode) }] : []),
        ]
      : []
    screen = (
      <AppScreen
        screenKey={`depts?d=${step.id}`}
        head={{ kind: 'back', title: d?.name ?? 'Department', backLabel: step.from ? TITLE[step.from] : 'Departments', onBack: backTo }}
        bar={bar}
      >
        <PageHead roman="" eyebrow="Admin · Departments" title={d?.name ?? 'Department'} />
        {said ? <Notice>{said}</Notice> : null}
        {d ? (
          <ItemGroup
            title={d.kind}
            count=""
            items={[
              { key: 'segment', label: 'Segment', sub: d.segment },
              { key: 'pool', label: 'Pool GL', sub: d.pool },
              { key: 'billing', label: 'Billing mode', sub: d.billing },
              { key: 'mode', label: 'Mode', sub: modeWords(d.mode) },
              { key: 'billback', label: 'Bill back salary', sub: d.billsBack ? (d.billback ? 'Yes · to Venture Office' : 'No · stays in its own pool') : '—' },
            ]}
          />
        ) : (
          <Notice>This department is not there any more.</Notice>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const card = step.card
    const list = card === 'billback' ? model.depts.filter((d) => d.billsBack) : model.depts
    const items: ItemLine[] = list.map((d) => ({
      key: d.id,
      label: d.name,
      sub: card === 'billback' ? (d.billback ? 'Bills back · to Venture Office' : 'Stays in its own pool') : d.internal ? 'Internal' : `${d.segment} · ${modeWords(d.mode)}`,
      value: card === 'billback' ? (d.billback ? 'Yes' : 'No') : undefined,
      onOpen: () => go({ kind: 'detail', id: d.id, from: card }),
    }))
    screen = (
      <AppScreen screenKey={`depts?f=${card}`} head={{ kind: 'back', title: TITLE[card], backLabel: 'Departments', onBack: backTo }} bar={newBtn}>
        <PageHead roman="" eyebrow="Admin · Departments" title={TITLE[card]} />
        {said ? <Notice>{said}</Notice> : null}
        <ItemGroup title={card === 'billback' ? 'Full departments' : 'All departments'} count={String(items.length)} items={items} empty="No departments yet." />
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="/fin-app/page/depts" head={{ kind: 'back', title: 'Departments', backLabel: 'Profile', onBack: leave }} bar={newBtn}>
        <BankHero value={model.hero.value} label={model.hero.label} chip={model.chip} />
        <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', card: k as DeptCard })} />
      </AppScreen>
    )
  }

  return (
    <>
      {screen}
      <AddSheet open={adding} onClose={() => setAdding(false)} onAdded={(name) => { setAdding(false); done(`${name} added`) }} />
      <ProvisionSheet dept={provisioning} onClose={() => setProvisioning(null)} onDone={(name) => { setProvisioning(null); done(`${name} is a full department`) }} />
      <SwitchSheet mode={switching} onClose={() => setSwitching(null)} onDone={(words) => { setSwitching(null); done(words) }} />
    </>
  )
}

/** + New department: the name — it stays (names drive the core mappings). */
function AddSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (name: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const close = () => {
    if (busy) return
    setName('')
    setError(null)
    onClose()
  }
  const add = () => {
    const n = name.trim()
    if (!n) return setError('Name the department.')
    setError(null)
    start(async () => {
      try {
        const res = await addDepartmentInWords(n)
        if (!res.ok) return setError(res.reason)
        setName('')
        onAdded(n)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={open} onClose={close} title="New department" locked={busy}>
      <DialogForm
        onSubmit={add}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" disabled={busy}>
              {busy ? 'Adding…' : 'Add department'}
            </DialogButton>
          </>
        }
      >
        <Field label="Department name" htmlFor="dept-new-name">
          <Input id="dept-new-name" maxLength={40} placeholder="e.g. Operations" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Hint>The name cannot be changed once it is added.</Hint>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Provision (转正): its own segment, billing mode and pool account — for good. */
function ProvisionSheet({ dept, onClose, onDone }: { dept: DeptLine | null; onClose: () => void; onDone: (name: string) => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  // Each opening starts from the desktop's own suggestion, the name as a key.
  useEffect(() => {
    if (!dept) return
    setKey(slugOf(dept.name))
    setError(null)
  }, [dept])
  const close = () => {
    if (busy) return
    onClose()
  }
  const ok = SEGMENT_KEY.test(key)
  const provision = () => {
    if (!dept || !ok) return
    setError(null)
    start(async () => {
      try {
        const res = await provisionDepartmentInWords(dept.id, key)
        if (!res.ok) return setError(res.reason)
        onDone(dept.name)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={dept !== null} onClose={close} title={`Provision ${dept?.name ?? 'the department'}?`} locked={busy}>
      <DialogForm
        onSubmit={provision}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" off={!ok} disabled={busy}>
              {busy ? 'Provisioning…' : 'Provision'}
            </DialogButton>
          </>
        }
      >
        <Field label="Segment key" htmlFor="dept-segment-key">
          <Input id="dept-segment-key" mono value={key} onChange={(e) => setKey(segmentKeyOf(e.target.value))} placeholder="segment key" />
        </Field>
        <Hint>
          Billing mode · {key || '…'}_attribution — pool account · opened (10xx)
        </Hint>
        <Hint danger={!ok && key !== ''}>{ok ? 'This cannot be undone — the segment stays.' : '3–31 letters, digits or _, a letter first.'}</Hint>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Cost center ↔ centralized: what it does, then the switch (the desktop's question). */
function SwitchSheet({ mode, onClose, onDone }: { mode: DepartmentMode | null; onClose: () => void; onDone: (words: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const target: CostModel = mode?.costModel === 'centralized' ? 'cost_center' : 'centralized'
  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }
  const confirm = () => {
    if (!mode) return
    setError(null)
    start(async () => {
      try {
        const res = await setDepartmentCostModel(mode.id, target)
        if (!res.ok) return setError(res.reason)
        onDone(switchedNote(mode.name, target, res.clearedPeople))
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={mode !== null} onClose={close} title={`Switch ${mode?.name ?? 'the department'} to ${COST_MODEL_LABEL[target]}?`} locked={busy}>
      <DialogConfirm
        text={mode ? switchConsequence(mode, target) : ''}
        confirmLabel={busy ? 'Switching…' : `Switch to ${COST_MODEL_LABEL[target]}`}
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      />
    </FinDialog>
  )
}
