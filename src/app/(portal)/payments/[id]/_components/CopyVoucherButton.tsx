'use client'

import { useTransition } from 'react'
import { copyPaymentVoucher } from '../../actions'

export default function CopyVoucherButton({
  voucherId,
  voucherNo,
}: {
  voucherId: string
  voucherNo: string | null
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      title="复制为新草稿 · Copy into a new draft to edit"
      onClick={() => {
        if (!confirm(`复制 ${voucherNo ?? '此凭单'} 为新草稿?复制后会进编辑页,可改资料再提交审批。`)) return
        startTransition(async () => {
          const fd = new FormData()
          fd.set('voucher_id', voucherId)
          try {
            await copyPaymentVoucher(fd)
          } catch (e) {
            if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
            alert(e instanceof Error ? e.message : 'Copy failed')
          }
        })
      }}
      className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
    >
      {isPending ? '复制中…' : 'Copy'}
    </button>
  )
}
