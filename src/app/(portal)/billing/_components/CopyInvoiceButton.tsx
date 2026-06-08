'use client'

import { useTransition } from 'react'
import { copyInvoice } from '../actions'

export default function CopyInvoiceButton({
  id,
  invoiceNo,
}: {
  id: string
  invoiceNo: string | null
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      title="复制为本月新草稿 · Copy as a new draft for this month"
      onClick={() => {
        if (!confirm(`复制 ${invoiceNo ?? '此发票'} 为本月新草稿?复制后可在草稿里改金额/描述再 issue。`)) return
        startTransition(async () => {
          const fd = new FormData()
          fd.set('invoice_id', id)
          try {
            await copyInvoice(fd)
          } catch (e) {
            if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
            alert(e instanceof Error ? e.message : 'Copy failed')
          }
        })
      }}
      className="text-xs text-graphite hover:text-accent font-serif italic disabled:opacity-50"
    >
      {isPending ? '复制中…' : 'Copy'}
    </button>
  )
}
