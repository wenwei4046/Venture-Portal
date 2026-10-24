'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { btn, hv } from '@/components/hrv/kit'
import { FLASH_LONG, flash } from '@/components/hrv/toast'
import { failedWords, filedWords, lettersRefusal, lettersToFile, startingLetters, type LetterChoice, type PendingLetter } from '@/lib/documentation/attach'
import { fileLetters } from '@/lib/documentation/file-letters'
import AttachLetters from '../../_components/AttachLetters'
import { BANK_NAMES } from '@/lib/banks'
import { revenuePath } from '@/lib/revenue'
import { defaultHireDate, missingFields, transferBanner, transferRefusal, type TransferInput, type WaitingTransferFacts } from '@/lib/commission/waiting-transfer'
import {
  CONTRACT_MONTH_CHOICES,
  DEFAULT_CONTRACT_MONTHS,
  DEFAULT_PROBATION_MONTHS,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_STATUS_LABEL,
  PROBATION_MONTH_CHOICES,
  contractEnd,
  dayLabel,
  monthsLabel,
  probationEnd,
} from '@/lib/employment-status'
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
  letterTypes = null,
}: {
  facts: WaitingTransferFacts
  subSlug: string
  titles: TransferChoice[]
  managers: Array<TransferChoice & { submittedIt: boolean }>
  /** The office's today (YYYY-MM-DD). */
  today: string
  /** Why it cannot be sent at all (the sub-department is full, the title cannot see NRIC) — or null. */
  blocked: string | null
  /** The Data center's letter types, for the letters filed with the status (2026-10-24); null: none asked. */
  letterTypes?: readonly LetterChoice[] | null
}) {
  const router = useRouter()
  const [name, setName] = useState(facts.newPerson ?? '')
  const [titleId, setTitleId] = useState(titles[0]?.id ?? '')
  const [reportsTo, setReportsTo] = useState<string | null>(managers.find(m => m.submittedIt)?.id ?? null)
  const [hireDate, setHireDate] = useState(defaultHireDate(facts.start, today))
  // Probation, Contract, Permanent or Part time (2026-10-23; Contract 2026-10-24) — asked as on Add Staff; a probation
  // or a contract with its period.
  const [employmentStatus, setEmploymentStatus] = useState('')
  const [probationMonths, setProbationMonths] = useState<number>(DEFAULT_PROBATION_MONTHS)
  const [contractMonths, setContractMonths] = useState<number>(DEFAULT_CONTRACT_MONTHS)
  // The letters filed with the status (2026-10-24), as on Add Staff: a row for each compulsory type to start.
  const [letters, setLetters] = useState<PendingLetter[]>(() => (letterTypes ? startingLetters(letterTypes) : []))
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
    employmentStatus,
    probationMonths: employmentStatus === 'probation' ? probationMonths : null,
    contractMonths: employmentStatus === 'contract' ? contractMonths : null,
  }
  const probationEnds = employmentStatus === 'probation' ? probationEnd(hireDate, probationMonths) : null
  const contractEnds = employmentStatus === 'contract' ? contractEnd(hireDate, contractMonths) : null
  const missing = tried ? new Set(missingFields(input)) : new Set<string>()

  async function add() {
    if (busy || blocked) return
    const refused = transferRefusal(input)
    if (refused) {
      setTried(true)
      setError(refused)
      return
    }
    const refusedLetters = letterTypes ? lettersRefusal(letters) : null
    if (refusedLetters) {
      setError(refusedLetters)
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
    const added = `${name.trim()} is now an employee in ${sub}${done.code ? ` · ${done.code}` : ''}`
    // An employee now: the letters go to their record — one that does not is said, and left for the Data center.
    if (letterTypes && lettersToFile(letters).length > 0) {
      const filed = await fileLetters(done.staffId, letters, letterTypes)
      const failed = failedWords(filed.failed)
      if (failed) flash(`${added}. ${failed}`, FLASH_LONG)
      else flash([added, filedWords(filed.filed, name.trim())].filter(Boolean).join(' · '))
    } else {
      flash(added)
    }
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

            <span className={s.label} id="transfer-status">Employment status</span>
            <div className={s.choices} role="group" aria-labelledby="transfer-status">
              {EMPLOYMENT_STATUSES.map(st => (
                <button key={st} type="button" className={hv.choice} aria-pressed={employmentStatus === st} onClick={() => setEmploymentStatus(st)}>
                  {EMPLOYMENT_STATUS_LABEL[st]}
                </button>
              ))}
            </div>

            {employmentStatus === 'probation' ? (
              <>
                <span className={s.label} id="transfer-probation">Probation period</span>
                <div className={s.choices} role="group" aria-labelledby="transfer-probation">
                  {PROBATION_MONTH_CHOICES.map(n => (
                    <button key={n} type="button" className={hv.choice} aria-pressed={probationMonths === n} onClick={() => setProbationMonths(n)}>
                      {monthsLabel(n)}
                    </button>
                  ))}
                  {probationEnds ? <span className={s.basisNote}>ends {dayLabel(probationEnds)}</span> : null}
                </div>
              </>
            ) : null}

            {employmentStatus === 'contract' ? (
              <>
                <span className={s.label} id="transfer-contract">Contract period</span>
                <div className={s.choices} role="group" aria-labelledby="transfer-contract">
                  {CONTRACT_MONTH_CHOICES.map(n => (
                    <button key={n} type="button" className={hv.choice} aria-pressed={contractMonths === n} onClick={() => setContractMonths(n)}>
                      {monthsLabel(n)}
                    </button>
                  ))}
                  {contractEnds ? <span className={s.basisNote}>ends {dayLabel(contractEnds)}</span> : null}
                </div>
              </>
            ) : null}

            {letterTypes ? (
              <>
                <span className={s.label}>Letters</span>
                <AttachLetters types={letterTypes} rows={letters} onChange={setLetters} idPrefix="transfer-letter" disabled={busy} />
              </>
            ) : null}

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
