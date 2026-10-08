'use client'

import { useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import { officeMonth } from '@/lib/office-time'
import { createDeptInvoice } from '../actions'

// Dept-manager 开单 (2026-08-20): creates a DRAFT invoice for the manager's
// own segment. Finance/Principal approve + issue it from /billing afterwards
// — the modal says so, so nobody waits for revenue that hasn't been posted.

interface Props {
  deptName: string
  companies: Array<{ id: string; name: string }>
  contracts: Array<{ id: string; description: string | null; company_id: string | null }>
}

const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border disabled:opacity-50'

export default function CreateDeptInvoiceButton({ deptName, companies, contracts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState('')
  const [freetext, setFreetext] = useState('')
  const [contractId, setContractId] = useState('')
  const [period, setPeriod] = useState(officeMonth())
  const [amount, setAmount] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [description, setDescription] = useState('')

  function reset() {
    setCompanyId('')
    setFreetext('')
    setContractId('')
    setPeriod(officeMonth())
    setAmount('')
    setInvoiceDate('')
    setDescription('')
    setError(null)
    setDone(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('company_id', companyId)
      fd.set('billable_to_freetext_name', freetext)
      fd.set('contract_id', contractId)
      fd.set('period_month', period)
      fd.set('amount', amount)
      fd.set('invoice_date', invoiceDate)
      fd.set('description', description)
      const r = await createDeptInvoice(fd)
      if (r.error) setError(r.error)
      else {
        setDone(r.invoiceNo ?? '')
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        + 开单 New invoice
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4"
          {...backdropDismiss(() => !isPending && setOpen(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">New invoice · {deptName}</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  存成 draft,由 Finance/Principal 审批开出 (issue) 后才入账。
                </p>
              </div>
              <button
                onClick={() => !isPending && setOpen(false)}
                className="text-muted hover:text-ink text-2xl leading-none pt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {done !== null ? (
              <div className="p-6">
                <div className="bg-surface border border-hairline rounded-md p-4 text-sm font-serif text-ink">
                  已建立 draft 发票 <span className="font-mono">{done}</span>。等 Finance/Principal issue 后就会出现在应收里。
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setOpen(false)}
                    className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">Bill to · 公司</div>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="">— 选公司,或在下面填名字 —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!companyId ? (
                  <label className="block">
                    <div className="text-xs font-sans font-medium text-graphite mb-1">或 Bill to 名字 (外部客户)</div>
                    <input
                      value={freetext}
                      onChange={(e) => setFreetext(e.target.value)}
                      disabled={isPending}
                      placeholder="e.g. Rygis Private Gym"
                      className={inputCls}
                    />
                  </label>
                ) : null}
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">Contract (可选)</div>
                  <select
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="">— 不挂合同 —</option>
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.description ?? c.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-xs font-sans font-medium text-graphite mb-1">Period 账期</div>
                    <input
                      type="month"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      disabled={isPending}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs font-sans font-medium text-graphite mb-1">Amount (RM)</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                      disabled={isPending}
                      placeholder="0.00"
                      className={inputCls + ' font-mono tabular text-right'}
                    />
                  </label>
                </div>
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">
                    Invoice date (留空 = 账期月底)
                  </div>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={isPending}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">Description</div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    disabled={isPending}
                    placeholder="Marketing Service — …"
                    className={inputCls + ' resize-y'}
                  />
                </label>

                {error ? (
                  <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                    {error}
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => !isPending && setOpen(false)}
                    disabled={isPending}
                    className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                  >
                    {isPending ? 'Creating…' : 'Create draft'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
