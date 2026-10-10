'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { btn, hv } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { BANK_NAMES } from '@/lib/banks'
import { revenuePath } from '@/lib/revenue'
import { defaultHireDate, missingFields, transferBanner, transferRefusal, type TransferInput, type WaitingTransferFacts } from '@/lib/commission/waiting-transfer'
import { transferFromWaitingList } from '../../waiting-transfer-actions'
import type { TransferChoice } from '../_lib/waiting-transfer'
import s from './waiting-transfer.module.css'

/**
 * Transfer from the waiting list (2026-10-10, the HR revamp): People
 * Management's employee form with the applicant already in it. The
 * department is the one the waiting list was sent for; HR picks the joining
 * title and the direct manager, and fills in NRIC and the bank account —
 * "Add to company" files the employee and takes them off the list together.
 */
export default function WaitingTransferForm({
  facts,
  subSlug,
  titles,
  managers,
  today,
  blocked,
}: {
  facts: WaitingTransferFacts
  subSlug: string
  titles: TransferChoice[]
  managers: Array<TransferChoice & { submittedIt: boolean }>
  /** The office's today (YYYY-MM-DD). */
  today: string
  /** Why it cannot be sent at all (the sub-department is full, the title cannot see NRIC) — or null. */
  blocked: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(facts.newPerson ?? '')
  const [titleId, setTitleId] = useState(titles[0]?.id ?? '')
  const [reportsTo, setReportsTo] = useState<string | null>(managers.find(m => m.submittedIt)?.id ?? null)
  const [hireDate, setHireDate] = useState(defaultHireDate(facts.start, today))
  const [nric, setNric] = useState('')
  const [phone, setPhone] = useState(facts.contact ?? '')
  const [email, setEmail] = useState('')
  const [bankName, setBankName] = useState('')
  const [account, setAccount] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sub = facts.subDepartment ?? '—'
  const backHref = `${revenuePath(subSlug, 'hierarchy')}?tab=waiting`
  const input: TransferInput = {
    requestId: facts.requestId, name, titleId, reportsTo, hireDate, nric, bankName, bankAccountNo: account, contact: phone, email,
  }
  const missing = tried ? new Set(missingFields(input)) : new Set<string>()

  async function add() {
    if (busy || blocked) return
    const refused = transferRefusal(input)
    if (refused) {
      setTried(true)
      setError(refused)
      return
    }
    setBusy(true)
    setError(null)
    const done = await transferFromWaitingList(input)
    if (!done.ok) {
      setBusy(false)
      setError(done.reason)
      return
    }
    flash(`${name.trim()} is now an employee in ${sub}${done.code ? ` · ${done.code}` : ''}`)
    router.push('/team/people')
  }

  return (
    <div>
      <div className={s.banner}>
        <span className={s.bannerDot} aria-hidden="true" />
        {transferBanner(facts)}
      </div>

      <div className={s.grid}>
        <section className={`${s.card} ${s.cardWide}`} aria-labelledby="transfer-placement">
          <h2 id="transfer-placement" className={s.cardTitle}>Placement</h2>
          <div className={s.placement}>
            <span className={s.label}>Department</span>
            <span className={s.dept}>
              <span className={s.deptChip}>Revenue · {sub}</span>
              <span className={s.deptNote}>set when the waiting list was submitted</span>
            </span>

            <span className={s.label} id="transfer-title">Joining title</span>
            <div className={s.choices} role="group" aria-labelledby="transfer-title">
              {titles.map(t => (
                <button key={t.id} type="button" className={hv.choice} aria-pressed={titleId === t.id} onClick={() => setTitleId(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>

            <span className={s.label} id="transfer-manager">Direct manager</span>
            <div className={s.choices} role="group" aria-labelledby="transfer-manager">
              {managers.length === 0 ? <span className={s.none}>Nobody in {sub} leads a team yet.</span> : null}
              {managers.map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={hv.choice}
                  aria-pressed={reportsTo === m.id}
                  onClick={() => setReportsTo(reportsTo === m.id ? null : m.id)}
                >
                  {m.name}
                  {m.submittedIt ? ' · submitted it' : ''}
                </button>
              ))}
            </div>

            <label className={s.label} htmlFor="transfer-hire">Hire date</label>
            <input id="transfer-hire" type="date" className={s.date} value={hireDate} onChange={e => setHireDate(e.target.value)} />

            <span className={s.label}>Pay basis</span>
            <span>
              Fully commission based <span className={s.basisNote}>— none of the pay is basic</span>
            </span>
          </div>
        </section>

        <Section title="Identity">
          <Field label="Full name" value={name} onChange={setName} placeholder="Full name" from={facts.newPerson ? 'waiting list' : undefined} />
          <Field label="NRIC" required mono value={nric} onChange={setNric} placeholder="900101-14-5678" missing={missing.has('nric')} />
        </Section>
        <Section title="Contact">
          <Field label="Phone" mono value={phone} onChange={setPhone} placeholder="012-345 6789" from={facts.contact ? 'waiting list' : undefined} />
          <Field label="Email" value={email} onChange={setEmail} placeholder="name@example.com" type="email" />
        </Section>
        <Section title="Bank">
          <Field label="Account 1 bank" required value={bankName} onChange={setBankName} placeholder="Maybank" list="transfer-banks" missing={missing.has('bankName')} />
          <datalist id="transfer-banks">
            {BANK_NAMES.map(b => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <Field label="Account 1 number" required mono value={account} onChange={setAccount} placeholder="1234567890" inputMode="numeric" missing={missing.has('bankAccountNo')} />
        </Section>
      </div>

      <div className={s.foot}>
        <span className={s.footErr} role={error || blocked ? 'alert' : undefined}>{error ?? blocked ?? ''}</span>
        <Link href={backHref} className={`${btn('outline')} ${s.back}`}>
          Back to waiting list
        </Link>
        <button type="button" className={`${btn('primary')} ${s.add}`} onClick={add} disabled={busy || blocked !== null}>
          {busy ? 'Adding…' : 'Add to company'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `transfer-${title.toLowerCase()}`
  return (
    <section className={s.card} aria-labelledby={id}>
      <h2 id={id} className={s.cardTitle}>{title}</h2>
      <div className={s.fields}>{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  mono = false,
  from,
  missing = false,
  type = 'text',
  list,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  required?: boolean
  mono?: boolean
  /** Carried over from — "waiting list". */
  from?: string
  missing?: boolean
  type?: 'text' | 'email'
  list?: string
  inputMode?: 'numeric'
}) {
  return (
    <label className={s.field}>
      <span className={s.fieldTop}>
        <span>
          {label}
          {required ? ' *' : ''}
        </span>
        <span className={s.fieldErr}>{missing ? 'Required' : ''}</span>
      </span>
      <input
        type={type}
        className={`${s.input}${mono ? ` ${s.mono}` : ''}`}
        data-from={from ? 'true' : undefined}
        data-error={missing ? 'true' : undefined}
        aria-invalid={missing || undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        inputMode={inputMode}
        autoComplete="off"
      />
      {from ? <span className={s.from}>from the {from}</span> : null}
    </label>
  )
}
