'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import type { AccountType } from '@/lib/coa'
import PeriodSelector from './PeriodSelector'
import BillMenu from './BillMenu'
import CreateInvoiceButton from './CreateInvoiceButton'
import CreateMultiLineInvoiceButton from './CreateMultiLineInvoiceButton'
import GenerateInvoicesButton from './GenerateInvoicesButton'
import GenerateConsolidatedInvoicesButton from './GenerateConsolidatedInvoicesButton'
import ReconcilePayrollBillingButton from './ReconcilePayrollBillingButton'
import GenerateOwnShareInvoiceButton from './GenerateOwnShareInvoiceButton'

// Service Billing's head (2026-10-10, the handoff): the month control, then
// "From payroll ▼", "Export ▼" and "+ Create Invoice ▼" — Single invoice,
// Multi-line invoice and Generate Marketing invoices (it used to sit on the
// Marketing projects head). A pick closes its menu; the dialog it asks for is
// mounted here, already open, so closing the menu does not close the dialog
// (the old ActMenu unmounted what it held, dialog and all). On a phone the
// row is a grid: the month full width, From payroll and Export side by side,
// Create full width (CSS `.bil-tools`).

type DialogKind = 'single' | 'multi' | 'marketing' | 'payroll' | 'reconcile' | 'own-share'

interface Props {
  /** The page's month, `YYYY-MM-01`. */
  period: string
  /** Billing · Create — the payroll actions and the creating. */
  canCreate: boolean
  companies: Array<{ id: string; name: string; short_code: string }>
  departments: Array<{ id: string; name: string }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  extraModes: Array<{ value: string; label: string }>
}

export default function BillingTools({ period, canCreate, companies, departments, categories, extraModes }: Props) {
  const [dialog, setDialog] = useState<{ kind: DialogKind; nonce: number } | null>(null)
  // A fresh nonce remounts the dialog, so picking the same item again opens it again.
  const show = (kind: DialogKind) => () => setDialog({ kind, nonce: Date.now() })
  const month = dayjs(period).format('YYYY-MM')
  const key = dialog ? `${dialog.kind}:${dialog.nonce}` : ''

  return (
    <>
      <div className="bil-tools">
        <PeriodSelector currentPeriod={period} />
        {canCreate ? (
          <BillMenu
            label="From payroll"
            items={[
              { key: 'payroll', label: 'Generate payroll invoices', title: 'One consolidated draft invoice per subsidiary (HR + Finance + Director Office)', onSelect: show('payroll') },
              { key: 'reconcile', label: 'Reconcile payroll', title: 'Live payroll against the issued consolidated invoices — top up any gap', onSelect: show('reconcile') },
              { key: 'own-share', label: 'Own-share → Venture (Office)', title: "Bill HV's own share of payroll to Venture (Office) — one inter-billing invoice", onSelect: show('own-share') },
            ]}
          />
        ) : null}
        <BillMenu
          label="Export"
          items={[
            { key: 'xlsx', label: 'Excel', href: `/statements/export?format=xlsx&period=${month}` },
            { key: 'pdf', label: 'PDF · list', title: 'The invoice list as a single-page table', href: `/statements/export?format=pdf&period=${month}` },
            { key: 'docs', label: 'PDF · per invoice', title: 'Each invoice as its own document page', href: `/billing/invoice-doc?period=${month}`, newTab: true },
          ]}
        />
        {canCreate ? (
          <BillMenu
            label="+ Create Invoice"
            primary
            items={[
              { key: 'single', label: 'Single invoice', onSelect: show('single') },
              { key: 'multi', label: 'Multi-line invoice', title: 'One bill with several lines, each with its own description and category', onSelect: show('multi') },
              { key: 'marketing', label: 'Generate Marketing invoices', title: "Draft invoices for the month's active marketing projects", onSelect: show('marketing') },
            ]}
          />
        ) : null}
      </div>

      {dialog?.kind === 'single' ? (
        <CreateInvoiceButton key={key} autoOpen hideTrigger companies={companies} currentPeriod={period} departments={departments} categories={categories} extraModes={extraModes} />
      ) : dialog?.kind === 'multi' ? (
        <CreateMultiLineInvoiceButton key={key} autoOpen hideTrigger companies={companies} currentPeriod={period} departments={departments} categories={categories} extraModes={extraModes} />
      ) : dialog?.kind === 'marketing' ? (
        <GenerateInvoicesButton key={key} autoOpen hideTrigger currentPeriod={period} modes={['marketing_project']} label="Generate Marketing invoices" />
      ) : dialog?.kind === 'payroll' ? (
        <GenerateConsolidatedInvoicesButton key={key} autoOpen hideTrigger currentPeriod={period} categories={categories} />
      ) : dialog?.kind === 'reconcile' ? (
        <ReconcilePayrollBillingButton key={key} autoOpen hideTrigger currentPeriod={period} />
      ) : dialog?.kind === 'own-share' ? (
        <GenerateOwnShareInvoiceButton key={key} autoOpen hideTrigger currentPeriod={period} categories={categories} />
      ) : null}
    </>
  )
}
