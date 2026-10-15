import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import EditPaymentForm from './_components/EditPaymentForm'
import { readVoucherEdit } from './_lib/edit-read'

interface Props {
  params: Promise<{ id: string }>
}

// A voucher's Edit. Its reads are `readVoucherEdit`'s (2026-10-16) — the
// Finance phone app's Edit sheet reads them too.
export default async function EditPaymentPage({ params }: Props) {
  await requirePage('/payments/[id]/edit')
  const user = await requireActionOn('/payments/[id]/edit', 'treasury', 'edit')
  const { id } = await params
  const supabase = await createClient()

  const read = await readVoucherEdit(supabase, user, id)
  if (!read.ok) {
    if (read.reason === 'missing') notFound()
    // Only editable in draft / pending_approval — otherwise bounce back to detail
    redirect(`/payments/${id}`)
  }
  const edit = read.data
  const voucher = edit.voucher

  return (
    <div>
      <Link href={`/payments/${id}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to voucher
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {voucher.direction === 'credit' ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'} · EDIT
          </div>
          <h1 className="page-title">Edit {voucher.voucher_no ?? 'draft'}</h1>
        </div>
      </div>

      <EditPaymentForm
        statutoryDetailsLocked={edit.statutoryDetailsLocked}
        salaryDetailsLocked={edit.salaryDetailsLocked}
        voucher={voucher}
        initialSources={edit.initialSources}
        extraPools={edit.extraPools}
        fundSourceAccount={edit.fundSourceAccount}
        initialCreditAccountCode={edit.initialCreditAccountCode}
        companies={edit.companies}
        bankAccounts={edit.bankAccounts}
        glAccounts={edit.glAccounts}
      />
    </div>
  )
}
