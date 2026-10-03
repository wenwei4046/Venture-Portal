import { paperRef } from '@/lib/commission/paper-ref'
import s from './commission-workbench.module.css'

const CHECKED_AS = 'The double-claim check reads the first paper number in the Ref No. as this bill’s own.'
const UNCHECKED = 'The double-claim check matches bills by the paper number in the ERP’s Ref No. This bill has none, so a second bill on the same paper cannot be found — key the handwritten bill’s number into the Ref No. in the ERP.'

/**
 * A bill's Ref No. — the handwritten bill's number, HC13369 on HC-SO-2609-400
 * — in the Ref No. column of All bills and the ledgers (2026-10-03, user:
 * 在 table list 全部列出来的时候，其实也需要一个 column 放这个 reference). Says
 * which number the double-claim check reads when the Ref No. carries more than
 * one, and says so when it can read none.
 */
export default function PaperRefCell({ refNo, paperNo }: { refNo: string | null; paperNo: string | null }) {
  const ref = paperRef(refNo, paperNo)
  if (ref.kind === 'paper') {
    return <>{ref.text}{ref.checkedAs && <small className={s.muted} title={CHECKED_AS}>Checked as {ref.checkedAs}</small>}</>
  }
  if (ref.kind === 'unreadable') {
    return <>{ref.text}<small className="text-alert" title={UNCHECKED}>Not a paper number</small></>
  }
  return <><span className={s.muted}>—</span><small className="text-alert" title={UNCHECKED}>No Ref No. in the ERP</small></>
}
