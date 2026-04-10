import PrintButton from './PrintButton'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'

interface Props {
  params: Promise<{ directorId: string }>
  searchParams: Promise<{ period?: string }>
}

export default async function PrintPayoutPage({ params, searchParams }: Props) {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { directorId } = await params
  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')

  const [{ data: director }, { data: payout }] = await Promise.all([
    supabase.from('directors').select('*').eq('id', directorId).single(),
    supabase.from('director_payouts').select('*').eq('director_id', directorId).eq('period_month', period).maybeSingle(),
  ])

  // Fire-and-forget access log for sensitive print action
  void supabase.rpc('log_data_access', {
    p_resource_type: 'director_salary_print',
    p_resource_id: directorId,
    p_action: 'print',
    p_metadata: { period },
  })

  if (!director || !payout) {
    return <div className="p-10 font-serif text-danger">Data not found.</div>
  }

  const n = (v: number | null) => Number(v ?? 0)

  return (
    <html lang="en-MY">
      <head>
        <title>Director Statement — {director.code} — {dayjs(period).format('MMMM YYYY')}</title>
        <style>{`
          @media print {
            body { margin: 0; padding: 20mm; }
            .no-print { display: none; }
          }
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1A1613;
            max-width: 700px;
            margin: 0 auto;
            padding: 40px;
            line-height: 1.6;
          }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 20px 0 8px; color: #6B5F52; text-transform: uppercase; letter-spacing: 1px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 1px solid #DFD4BE; padding-bottom: 20px; }
          .header .company { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
          .header .subtitle { font-size: 12px; color: #6B5F52; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin: 8px 0; }
          td { padding: 4px 0; font-size: 13px; }
          td:last-child { text-align: right; font-family: 'Courier New', monospace; }
          .separator { border-top: 1px solid #DFD4BE; }
          .total td { font-weight: bold; padding-top: 8px; }
          .negative { color: #A3371A; }
          .positive { color: #3D6B45; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #DFD4BE; font-size: 11px; color: #9E8F7F; }
          .print-btn {
            position: fixed; top: 20px; right: 20px;
            background: #CC5A2E; color: white; border: none;
            padding: 10px 20px; border-radius: 6px; cursor: pointer;
            font-family: Georgia, serif; font-style: italic; font-size: 14px;
          }
          .print-btn:hover { background: #B54A22; }
        `}</style>
      </head>
      <body>
        <PrintButton />

        <div className="header">
          <div className="company">HOUZS VENTURE SDN BHD</div>
          <div className="subtitle">Director Monthly Statement — {dayjs(period).format('MMMM YYYY')}</div>
          <div className="subtitle">Director: {director.name} ({director.code})</div>
        </div>

        <table>
          <tbody>
            <tr>
              <td>Gross Allocation</td>
              <td>{formatMoney(n(payout.gross_amount))}</td>
            </tr>
            <tr>
              <td>5% Saving</td>
              <td className="negative">-{formatMoney(n(payout.saving_amount)).replace('RM ', '')}</td>
            </tr>
          </tbody>
        </table>

        <h2>75% Payroll</h2>
        <table>
          <tbody>
            <tr>
              <td>Payroll Gross</td>
              <td>{formatMoney(n(payout.payroll_gross))}</td>
            </tr>
            <tr><td>- EPF (ER+EE)</td><td className="negative">-{formatMoney(n(payout.payroll_epf_er) + n(payout.payroll_epf_ee)).replace('RM ', '')}</td></tr>
            <tr><td>- SOCSO (ER+EE)</td><td className="negative">-{formatMoney(n(payout.payroll_socso_er) + n(payout.payroll_socso_ee)).replace('RM ', '')}</td></tr>
            <tr><td>- EIS (ER+EE)</td><td className="negative">-{formatMoney(n(payout.payroll_eis_er) + n(payout.payroll_eis_ee)).replace('RM ', '')}</td></tr>
            <tr><td>- PCB</td><td className="negative">-{formatMoney(n(payout.payroll_pcb)).replace('RM ', '')}</td></tr>
            <tr className="separator total">
              <td>Net Take Home</td>
              <td>{formatMoney(n(payout.payroll_net))}</td>
            </tr>
          </tbody>
        </table>

        <h2>25% Invoice</h2>
        <table>
          <tbody>
            <tr className="total">
              <td>Invoice Total</td>
              <td>{formatMoney(n(payout.invoice_total))}</td>
            </tr>
          </tbody>
        </table>

        <h2>Tracking</h2>
        <table>
          <tbody>
            <tr><td>Advance Balance</td><td>{formatMoney(n(payout.advance_balance))}</td></tr>
            <tr><td>Saving Accumulated</td><td className="positive">{formatMoney(n(payout.saving_amount))}</td></tr>
          </tbody>
        </table>

        <div className="footer">
          Generated by HOUZS Venture Portal · {dayjs().format('D MMM YYYY HH:mm')} · Confidential
        </div>
      </body>
    </html>
  )
}
