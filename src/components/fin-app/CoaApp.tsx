'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { Select } from '@/components/hrv/select'
import { ACCOUNT_TYPES, CASH_FLOW_CATEGORIES, defaultCashFlowCategoryFor, rangeFor, typeLabel, type AccountType, type CashFlowCategory } from '@/lib/coa'
import { accountEdit, parentChoices, type CoaAccount } from '@/lib/coa-edit'
import { CFC_WORDS, coaLine, coaModel, rangeWords, searchKeep } from '@/lib/fin-app/coa-model'
import { createAccount, updateAccount } from '@/app/(portal)/settings/actions'
import AppScreen, { PageHead, type BarButton } from './AppScreen'
import { canStepBack, setIntent, useStep } from './nav'
import { BankHero, ItemGroup, Notice, SearchRow, StackCards, type ItemLine } from './parts'

// Report › Chart of Account in the Finance phone app (2026-10-15, part E3b —
// a page the design does not draw, in its style): Settings › Chart of
// Accounts — the active accounts over a card per account type, a type's
// accounts as the desktop's tree (search by code or name, *Show inactive*),
// an account its own screen: its code, type, cash flow, parent and sub-
// accounts. *+ New account* (the code given in the type's range) and *Edit*
// (sending only what changed — the user's rule; a new type or code re-points
// every past transaction, so it is asked first) are the desktop's own actions,
// which answer in words.

type Step = { kind: 'hub' } | { kind: 'list'; type: AccountType } | { kind: 'account'; code: string; type: AccountType | null }

const asType = (v: string | null): AccountType | null => (v && (ACCOUNT_TYPES as readonly string[]).includes(v) ? (v as AccountType) : null)

export function readCoaStep(q: URLSearchParams): Step {
  const a = q.get('a')
  const t = asType(q.get('f'))
  if (a) return { kind: 'account', code: a, type: t }
  return t ? { kind: 'list', type: t } : { kind: 'hub' }
}
const stepQuery = (s: Step) =>
  s.kind === 'account' ? `${s.type ? `f=${s.type}&` : ''}a=${encodeURIComponent(s.code)}` : s.kind === 'list' ? `f=${s.type}` : ''

export default function CoaApp({ accounts, search, canManage }: { accounts: CoaAccount[]; search: string; canManage: boolean }) {
  const router = useRouter()
  const [step, open, back] = useStep(readCoaStep, search)
  const go = (s: Step) => open(stepQuery(s))
  const backTo = () => back(step.kind === 'account' && step.type ? `f=${step.type}` : '')
  const leave = () => {
    if (canStepBack()) {
      window.history.back()
      return
    }
    setIntent('pop')
    router.replace('/fin-app')
  }

  const [showInactive, setShowInactive] = useState(false)
  const [query, setQuery] = useState('')
  const model = useMemo(() => coaModel(accounts, showInactive), [accounts, showInactive])
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CoaAccount | null>(null)

  const inactiveBtn: BarButton = { key: 'inactive', label: showInactive ? 'Hide inactive' : 'Show inactive', onClick: () => setShowInactive((v) => !v) }
  const newBtn: BarButton[] = canManage ? [{ key: 'new', label: '+ New account', kind: 'primary', onClick: () => setCreating(true) }] : []

  let screen: ReactNode
  if (step.kind === 'account') {
    const acc = byCode.get(step.code) ?? null
    const parent = acc?.parent_code ? byCode.get(acc.parent_code) ?? null : null
    const subs = acc ? accounts.filter((a) => a.parent_code === acc.code).sort((a, b) => a.code.localeCompare(b.code)) : []
    screen = (
      <AppScreen
        screenKey={`coa?a=${step.code}`}
        head={{ kind: 'back', title: acc?.name ?? 'Account', backLabel: step.type ? `${typeLabel(step.type)} accounts` : 'Chart of Account', onBack: backTo }}
        bar={acc && canManage ? [{ key: 'edit', label: 'Edit', kind: 'primary', onClick: () => setEditing(acc) }] : []}
      >
        <PageHead roman="III." eyebrow={acc ? `${typeLabel(acc.type)} · ${acc.code}` : 'Chart of Account'} title={acc?.name ?? 'Account'} />
        {acc ? (
          <>
            <ItemGroup
              title="Account"
              count=""
              items={[
                { key: 'code', label: 'Code', value: acc.code },
                { key: 'type', label: 'Type', sub: `${typeLabel(acc.type)} · ${rangeWords(acc.type)}` },
                { key: 'cfc', label: 'Cash flow', sub: CFC_WORDS[acc.cash_flow_category] },
                { key: 'parent', label: 'Parent', sub: parent ? `${parent.code} · ${parent.name}` : acc.parent_code ?? '— top level' },
                { key: 'status', label: 'Status', sub: acc.is_active ? 'Active' : 'Inactive' },
              ]}
            />
            {subs.length > 0 ? (
              <ItemGroup
                title="Sub-accounts"
                count={String(subs.length)}
                items={subs.map((s) => ({
                  key: s.code,
                  label: s.name,
                  sub: `${CFC_WORDS[s.cash_flow_category]}${s.is_active ? '' : ' · inactive'}`,
                  value: s.code,
                  tone: s.is_active ? null : ('muted' as const),
                  onOpen: () => go({ kind: 'account', code: s.code, type: s.type }),
                }))}
              />
            ) : null}
          </>
        ) : (
          <Notice>This account is not there any more.</Notice>
        )}
      </AppScreen>
    )
  } else if (step.kind === 'list') {
    const t = model.types.find((x) => x.type === step.type)!
    const keep = searchKeep(accounts, showInactive ? accounts : accounts.filter((a) => a.is_active), query)
    const rows = keep ? t.rows.filter((r) => keep.has(r.acc.code)) : t.rows
    const items: ItemLine[] = rows.map((r) => {
      const l = coaLine(r)
      return { key: r.acc.code, label: l.label, sub: l.sub, value: l.value, tone: l.muted ? 'muted' : null, onOpen: () => go({ kind: 'account', code: r.acc.code, type: step.type }) }
    })
    screen = (
      <AppScreen screenKey={`coa?f=${step.type}`} head={{ kind: 'back', title: t.label, backLabel: 'Chart of Account', onBack: backTo }} bar={[...newBtn, inactiveBtn]}>
        <PageHead roman="III." eyebrow="Report · Chart of Account" title={t.label} />
        <SearchRow value={query} onChange={setQuery} placeholder="Search code or name…" />
        <ItemGroup title={t.range} count={String(items.length)} items={items} empty={query ? 'No account matches.' : 'No accounts of this type yet.'} />
      </AppScreen>
    )
  } else {
    screen = (
      <AppScreen screenKey="/fin-app/page/coa" head={{ kind: 'back', title: 'Chart of Account', backLabel: 'Overview', onBack: leave }} bar={[...newBtn, inactiveBtn]}>
        <BankHero value={model.hero.value} label={model.hero.label} chip={model.chip} />
        <StackCards cards={model.cards} onOpen={(k) => go({ kind: 'list', type: k as AccountType })} />
      </AppScreen>
    )
  }

  const saved = (words: string) => {
    flash(words)
    router.refresh()
  }
  return (
    <>
      {screen}
      <NewAccountSheet
        open={creating}
        accounts={accounts}
        startType={step.kind === 'list' ? step.type : step.kind === 'account' ? (byCode.get(step.code)?.type ?? 'expense') : 'expense'}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false)
          saved('Account added')
        }}
      />
      <EditAccountSheet
        account={editing}
        accounts={accounts}
        onClose={() => setEditing(null)}
        onDone={(words, moved) => {
          setEditing(null)
          saved(words)
          // A new code is a new address: back to the type's list, where the account stands under its code.
          if (moved) backTo()
        }}
      />
    </>
  )
}

function TypeOptions() {
  return (
    <>
      {ACCOUNT_TYPES.map((t) => (
        <option key={t} value={t}>
          {typeLabel(t)} ({rangeFor(t)[0]}–{rangeFor(t)[1]})
        </option>
      ))}
    </>
  )
}

function CfcOptions() {
  return (
    <>
      {CASH_FLOW_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {CFC_WORDS[c]}
        </option>
      ))}
    </>
  )
}

/** + New account: its type, name, cash flow and parent — the code is given in the type's range. */
function NewAccountSheet({ open, accounts, startType, onClose, onDone }: { open: boolean; accounts: CoaAccount[]; startType: AccountType; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<AccountType>(startType)
  const [name, setName] = useState('')
  const [cfc, setCfc] = useState<CashFlowCategory>(defaultCashFlowCategoryFor(startType))
  const [parent, setParent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!open) return
    setType(startType)
    setName('')
    setCfc(defaultCashFlowCategoryFor(startType))
    setParent('')
    setError(null)
  }, [open, startType])
  const parents = useMemo(() => parentChoices(accounts, type, null), [accounts, type])
  const close = () => !busy && onClose()
  const create = () => {
    if (!name.trim()) return setError('Name the account.')
    setError(null)
    const fd = new FormData()
    fd.set('type', type)
    fd.set('name', name.trim())
    fd.set('cash_flow_category', cfc)
    if (parent) fd.set('parent_code', parent)
    start(async () => {
      try {
        const res = await createAccount(fd)
        if (res?.error) return setError(res.error)
        onDone()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  return (
    <FinDialog open={open} onClose={close} title="New account" locked={busy}>
      <DialogForm
        onSubmit={create}
        buttons={
          <>
            <DialogButton onClick={close} disabled={busy}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </DialogButton>
          </>
        }
      >
        <div className={fm.duo}>
          <Field label="Account type" htmlFor="coa-new-type">
            <Select
              id="coa-new-type"
              round={12}
              className={fm.select}
              value={type}
              onChange={(e) => {
                const t = e.target.value as AccountType
                setType(t)
                setCfc(defaultCashFlowCategoryFor(t))
                setParent('')
              }}
            >
              <TypeOptions />
            </Select>
          </Field>
          <Field label="Code" htmlFor="coa-new-code">
            <Input id="coa-new-code" mono value="Given on save" disabled readOnly />
          </Field>
        </div>
        <Field label="Account name" htmlFor="coa-new-name">
          <Input id="coa-new-name" placeholder="e.g. Office Rent Expense" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cash flow category" htmlFor="coa-new-cfc">
          <Select id="coa-new-cfc" round={12} className={fm.select} value={cfc} onChange={(e) => setCfc(e.target.value as CashFlowCategory)}>
            <CfcOptions />
          </Select>
        </Field>
        <Field label="Parent account" htmlFor="coa-new-parent">
          <Select id="coa-new-parent" round={12} className={fm.select} value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— None (top level) —</option>
            {parents.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <Hint danger>{error}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** Edit: what changed only; a new type or a new code is asked first (every past transaction is re-pointed). */
function EditAccountSheet({
  account,
  accounts,
  onClose,
  onDone,
}: {
  account: CoaAccount | null
  accounts: CoaAccount[]
  onClose: () => void
  onDone: (words: string, moved: boolean) => void
}) {
  const [type, setType] = useState<AccountType>('expense')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [cfc, setCfc] = useState<CashFlowCategory>('operating')
  const [parent, setParent] = useState('')
  const [active, setActive] = useState(true)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!account) return
    setType(account.type)
    setCode(account.code)
    setName(account.name)
    setCfc(account.cash_flow_category)
    setParent(account.parent_code ?? '')
    setActive(account.is_active)
    setAsking(false)
    setError(null)
  }, [account])
  const parents = useMemo(() => parentChoices(accounts, type, account?.code ?? null), [accounts, type, account])
  const close = () => !busy && onClose()
  const edit = account ? accountEdit(account, { type, code, name, cashFlow: cfc, parent, active }) : null

  const send = () => {
    if (!account || !edit) return
    setError(null)
    start(async () => {
      try {
        const res = await updateAccount(edit.form)
        if (res?.error) {
          setAsking(false)
          return setError(res.error)
        }
        onDone(res?.message ?? 'Account saved', edit.typeChange || edit.codeChange)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }
  const save = () => {
    if (!account || !edit) return
    if (!name.trim()) return setError('Name the account.')
    if (edit.nothing) return onClose()
    if (edit.codeChange && !/^\d{4}$/.test(code.trim())) return setError('A code is four digits.')
    if (edit.typeChange || edit.codeChange) return setAsking(true)
    send()
  }

  const [lo, hi] = rangeFor(type)
  const question = !account
    ? ''
    : edit?.typeChange
      ? `${account.code} gets a new code in the ${lo}–${hi} range, every past transaction is re-pointed to it, and it leaves its parent. This cannot be undone.`
      : `Every past transaction posted to ${account.code} is re-pointed to ${code.trim()}. This cannot be undone.`

  return (
    <FinDialog
      open={account !== null}
      onClose={close}
      title={asking ? (edit?.typeChange ? `Change ${account?.code} to ${typeLabel(type)}?` : `Change code ${account?.code} → ${code.trim()}?`) : `Edit ${account?.code ?? ''}`}
      locked={busy}
    >
      {asking ? (
        <DialogConfirm
          text={question}
          confirmLabel={busy ? 'Saving…' : edit?.typeChange ? 'Change type' : 'Change code'}
          busy={busy}
          error={error}
          onCancel={() => setAsking(false)}
          onConfirm={send}
        />
      ) : (
        <DialogForm
          onSubmit={save}
          buttons={
            <>
              <DialogButton onClick={close} disabled={busy}>
                Cancel
              </DialogButton>
              <DialogButton kind="primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </DialogButton>
            </>
          }
        >
          <div className={fm.duo}>
            <Field label="Account type" htmlFor="coa-edit-type">
              <Select
                id="coa-edit-type"
                round={12}
                className={fm.select}
                value={type}
                onChange={(e) => {
                  const t = e.target.value as AccountType
                  setType(t)
                  setCfc(t === account?.type ? account.cash_flow_category : defaultCashFlowCategoryFor(t))
                  setParent(t === account?.type ? account.parent_code ?? '' : '')
                }}
              >
                <TypeOptions />
              </Select>
            </Field>
            <Field label="Code" htmlFor="coa-edit-code">
              <Input
                id="coa-edit-code"
                mono
                inputMode="numeric"
                maxLength={4}
                value={account && type !== account.type ? 'New in range' : code}
                disabled={!!account && type !== account.type}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <Field label="Account name" htmlFor="coa-edit-name">
            <Input id="coa-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className={fm.duo}>
            <Field label="Cash flow category" htmlFor="coa-edit-cfc">
              <Select id="coa-edit-cfc" round={12} className={fm.select} value={cfc} onChange={(e) => setCfc(e.target.value as CashFlowCategory)}>
                <CfcOptions />
              </Select>
            </Field>
            <Field label="Status" htmlFor="coa-edit-active">
              <Select id="coa-edit-active" round={12} className={fm.select} value={active ? 'on' : 'off'} onChange={(e) => setActive(e.target.value === 'on')}>
                <option value="on">Active</option>
                <option value="off">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Parent account" htmlFor="coa-edit-parent">
            <Select id="coa-edit-parent" round={12} className={fm.select} value={parent} onChange={(e) => setParent(e.target.value)} disabled={!!account && type !== account.type}>
              <option value="">— None (top level) —</option>
              {parents.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {error ? <Hint danger>{error}</Hint> : null}
        </DialogForm>
      )}
    </FinDialog>
  )
}
