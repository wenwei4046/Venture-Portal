import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './PrintButton'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StatementPrintPage({ params }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()
  const { id } = await params

  const { data: statement } = await supabase
    .from('monthly_statements')
    .select('*')
    .eq('id', id)
    .single()

  if (!statement) notFound()

  const [{ data: company }, { data: lines }] = await Promise.all([
    supabase
      .from('companies')
      .select('name, short_code, tier')
      .eq('id', statement.company_id)
      .single(),
    supabase
      .from('monthly_statement_lines')
      .select('*')
      .eq('statement_id', statement.id)
      .order('line_type')
      .order('created_at'),
  ])

  const lineList = lines ?? []
  const invoiceLines = lineList.filter((l) => l.line_type === 'invoice')
  const contraLines = lineList.filter((l) => l.line_type === 'contra')
  const netAmount = Number(statement.net_amount)

  const categoryLabels: Record<string, string> = {
    hr_pool: 'HR Pool',
    finance_staff: 'Finance Staff',
    finance_mgmt_fee: 'Finance Mgmt Fee',
    marketing_project: 'Marketing Project',
    rent: 'Rent',
    utility: 'Utility',
    loan_repayment: 'Loan Repayment',
    loan_interest: 'Loan Interest',
    loan_principal: 'Loan Principal',
    other: 'Other',
  }

  return (
    <html lang="en-MY">
      <head>
        <title>
          Statement — {company?.short_code} — {dayjs(statement.period_month).format('MMMM YYYY')}
        </title>
        <style>{`
          @media print {
            body { margin: 0; padding: 15mm 20mm; }
            .no-print { display: none !important; }
            @page { size: A4; margin: 15mm 20mm; }
          }
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1A1613;
            max-width: 720px;
            margin: 0 auto;
            padding: 40px;
            line-height: 1.6;
            font-size: 13px;
          }
          .header {
            text-align: center;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 2px solid #1A1613;
          }
          .header .company-name {
            font-size: 20px;
            font-weight: bold;
            letter-spacing: 3px;
            text-transform: uppercase;
          }
          .header .company-reg {
            font-size: 11px;
            color: #6B5F52;
            margin-top: 2px;
            letter-spacing: 1px;
          }
          .header .doc-title {
            font-size: 15px;
            font-weight: bold;
            margin-top: 16px;
            letter-spacing: 1px;
          }
          .meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 1px solid #DFD4BE;
          }
          .meta-left, .meta-right { font-size: 12px; }
          .meta-label { color: #6B5F52; font-style: italic; }
          .meta-value { font-weight: bold; }
          h2 {
            font-size: 13px;
            margin: 24px 0 8px;
            color: #6B5F52;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: normal;
            font-style: italic;
          }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 5px 0; font-size: 12px; }
          th { text-align: left; font-weight: normal; color: #6B5F52; font-style: italic; border-bottom: 1px solid #DFD4BE; }
          th:last-child, td:last-child { text-align: right; font-family: 'Courier New', monospace; }
          .line-desc { font-size: 11px; color: #9E8F7F; font-style: italic; }
          .separator { border-top: 1px solid #DFD4BE; }
          .double-separator { border-top: 2px solid #1A1613; }
          .total td { font-weight: bold; padding-top: 8px; }
          .grand-total td { font-size: 15px; font-weight: bold; padding-top: 12px; }
          .negative { color: #A3371A; }
          .positive { color: #3D6B45; }
          .footer {
            margin-top: 48px;
            padding-top: 16px;
            border-top: 1px solid #DFD4BE;
            font-size: 10px;
            color: #9E8F7F;
            text-align: center;
          }
          .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .status-draft { background: #FFF8E7; color: #9E8F7F; }
          .status-issued { background: #FFF1E0; color: #CC5A2E; }
          .status-paid { background: #EDF5EE; color: #3D6B45; }
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

        {/* Letterhead */}
        <div className="header">
          <div className="company-name">HOUZS Venture Sdn Bhd</div>
          <div className="company-reg">Registration No. 202401000000 (1234567-X)</div>
          <div className="company-reg">
            Level 8, Menara HOUZS, Jalan Ampang, 50450 Kuala Lumpur
          </div>
          <div className="doc-title">Monthly Consolidated Statement</div>
        </div>

        {/* Meta info */}
        <div className="meta">
          <div className="meta-left">
            <div><span className="meta-label">To: </span><span className="meta-value">{company?.name}</span></div>
            <div><span className="meta-label">Code: </span>{company?.short_code} · Tier {company?.tier}</div>
          </div>
          <div className="meta-right" style={{ textAlign: 'right' }}>
            <div><span className="meta-label">Period: </span><span className="meta-value">{dayjs(statement.period_month).format('MMMM YYYY')}</span></div>
            <div>
              <span className="meta-label">Status: </span>
              <span className={`status-badge status-${statement.status}`}>{statement.status}</span>
            </div>
            {statement.issued_at && (
              <div><span className="meta-label">Issued: </span>{dayjs(statement.issued_at).format('D MMM YYYY')}</div>
            )}
          </div>
        </div>

        {/* Invoice items */}
        <h2>Invoice Items (Billable)</h2>
        {invoiceLines.length === 0 ? (
          <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#9E8F7F' }}>No invoice items this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {invoiceLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {categoryLabels[line.category_code] ?? line.category_code}
                    {line.description && <div className="line-desc">{line.description}</div>}
                  </td>
                  <td>{Number(line.amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr className="separator total">
                <td>Subtotal Invoice</td>
                <td>{Number(statement.total_invoice).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Contra items */}
        <h2>Contra Items (Non-Billable)</h2>
        {contraLines.length === 0 ? (
          <p style={{ fontSize: '12px', fontStyle: 'italic', color: '#9E8F7F' }}>No contra items this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {contraLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {categoryLabels[line.category_code] ?? line.category_code}
                    {line.description && <div className="line-desc">{line.description}</div>}
                  </td>
                  <td className="negative">
                    ({Number(line.amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </td>
                </tr>
              ))}
              <tr className="separator total">
                <td>Subtotal Contra</td>
                <td className="negative">
                  ({Number(statement.total_contra).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Grand total */}
        <table style={{ marginTop: '20px' }}>
          <tbody>
            <tr className="double-separator grand-total">
              <td>{netAmount >= 0 ? 'Net Payable' : 'Net Credit'}</td>
              <td className={netAmount >= 0 ? '' : 'negative'}>
                {netAmount >= 0
                  ? `RM ${netAmount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `(RM ${Math.abs(netAmount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="footer">
          <div>This is a computer-generated document. No signature is required.</div>
          <div style={{ marginTop: '4px' }}>
            Generated by HOUZS Venture Portal · {dayjs().format('D MMM YYYY HH:mm')} · Confidential
          </div>
        </div>
      </body>
    </html>
  )
}
