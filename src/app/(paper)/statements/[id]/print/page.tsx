import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { opensPage } from '@/lib/page-tabs'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './PrintButton'
import { HandoffSections, type PrintLine } from './PrintSections'
import FinSwitch from '@/app/(portal)/statements/_components/FinSwitch'
import { FinViewProvider } from '@/components/layout/fin-view'
import { isFinanceView } from '@/lib/finance-view'
import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_REG_NO } from '@/lib/company'

interface Props {
  params: Promise<{ id: string }>
}

// A statement on paper (2026-10-16): outside the (portal) route group on
// purpose, as /print/director-pool is — the portal frame does not wrap a print
// view, and the Finance phone app opens it (Print statement) though the
// portal's pages are the computer's (lib/one-app.ts). Its address, its tabs
// (page-tabs: STATEMENTS) and its gate are the same.
/** The tab's title — Save as PDF names its file by it (2026-10-16): "Statement — CONTS — September 2026". */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await requirePermission('treasury')
  // The page asks its tabs (requirePage); the title asks them the same way.
  if (!opensPage(user.tabs, '/statements/[id]/print')) return {}
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('monthly_statements').select('period_month, companies(name, short_code)').eq('id', id).maybeSingle()
  if (!data) return {}
  const company = data.companies as { name: string; short_code: string | null } | null
  return { title: `Statement — ${company?.short_code ?? company?.name ?? ''} — ${dayjs(data.period_month).format('MMMM YYYY')}` }
}

export default async function StatementPrintPage({ params }: Props) {
  await requirePage('/statements/[id]/print')
  const user = await requirePermission('treasury')
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
      .select('name, short_code')
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
    marketing_project: 'Marketing Project',
    rent: 'Rent',
    utility: 'Utility',
    loan_repayment: 'Loan Repayment',
    loan_interest: 'Loan Interest',
    loan_principal: 'Loan Principal',
    other: 'Other',
  }
  const printLine = (l: (typeof lineList)[number]): PrintLine => ({
    id: l.id,
    category: categoryLabels[l.category_code] ?? l.category_code,
    description: l.description ?? null,
    amount: Number(l.amount),
  })

  return (
    // Outside the portal, so the portal's frame does not say which view it is: the page asks as the frame would.
    // The root layout draws the document (2026-10-16): a second html element here broke hydration (#418)
    // and left the tab's title empty — the title is generateMetadata's.
    <FinViewProvider value={isFinanceView(`/statements/${id}/print`, user.role)}>
        <style>{`
          @media print {
            body { margin: 0; padding: 15mm 20mm; }
            .no-print { display: none !important; }
            @page { size: A4; margin: 15mm 20mm; }
          }
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            color: #1C160F;
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
            border-bottom: 2px solid #1C160F;
          }
          .header .company-name {
            font-size: 20px;
            font-weight: bold;
            letter-spacing: 3px;
            text-transform: uppercase;
          }
          .header .company-reg {
            font-size: 11px;
            color: #5A4E40;
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
            border-bottom: 1px solid #C6B99E;
          }
          .meta-left, .meta-right { font-size: 12px; }
          .meta-label { color: #5A4E40; font-style: italic; }
          .meta-value { font-weight: bold; }
          h2 {
            font-size: 13px;
            margin: 24px 0 8px;
            color: #5A4E40;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: normal;
            font-style: italic;
          }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 5px 0; font-size: 12px; }
          th { text-align: left; font-weight: normal; color: #5A4E40; font-style: italic; border-bottom: 1px solid #C6B99E; }
          th:last-child, td:last-child { text-align: right; font-family: 'Courier New', monospace; color: #1A130B; font-variant-numeric: tabular-nums slashed-zero; }
          .line-desc { font-size: 11px; color: #85775F; font-style: italic; }
          .separator { border-top: 1px solid #C6B99E; }
          .double-separator { border-top: 2px solid #1C160F; }
          .total td { font-weight: bold; padding-top: 8px; }
          .grand-total td { font-size: 15px; font-weight: bold; padding-top: 12px; color: #1A130B; }
          .negative { color: #A3371A; }
          .positive { color: #3D6B45; }
          .footer {
            margin-top: 48px;
            padding-top: 16px;
            border-top: 1px solid #C6B99E;
            font-size: 10px;
            color: #85775F;
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
          /* A phone (2026-10-16 — the Finance app's Print statement opens this page): the button
             stands in the page's flow over the letterhead instead of on it, the margins narrower. */
          @media screen and (max-width: 640px) {
            body { padding: max(16px, env(safe-area-inset-top, 0px)) 16px 24px; }
            .print-btn { position: static; display: block; margin: 0 0 16px auto; }
          }
          /* The handoff's two sides and net (2026-10-10, PrintSections). */
          .bil-ps-box { margin: 18px 0; border: 1px solid rgba(21,110,78,0.3); border-left: 4px solid #156E4E; border-radius: 6px; padding: 12px 14px 4px; background: rgb(246,251,248); }
          .bil-ps-box.b { border-color: rgba(176,40,34,0.3); border-left-color: #B02822; background: rgb(253,246,245); }
          .bil-ps-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; margin-bottom: 6px; }
          .bil-ps-head h2 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-weight: 400; font-style: normal; text-transform: none; letter-spacing: 0; color: #000; }
          .bil-ps-box.b .bil-ps-head h2 { color: #B02822; }
          .bil-ps-tag { font-family: Inter, 'Noto Sans SC', sans-serif; font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #156E4E; }
          .bil-ps-box.b .bil-ps-tag { color: #B02822; }
          .bil-ps-box table { margin-bottom: 14px; }
          .bil-ps-box th { padding: 7px 8px; border-bottom: 1px solid #000; color: #000; font-style: normal; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; }
          .bil-ps-box td { padding: 7px 8px; border-bottom: 1px solid rgb(229,228,223); }
          .bil-ps-box tfoot td { border-bottom: 0; padding: 8px; font-weight: 600; }
          .bil-ps-box.b tfoot td, .bil-ps-box.b tfoot td:last-child { color: #B02822; }
          .bil-ps-none { margin: 0 0 14px; font-size: 12px; font-style: italic; color: #9E8F7F; }
          .bil-ps-net { margin-top: 6px; }
          .bil-ps-net td { padding: 12px 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; vertical-align: top; }
          .bil-ps-net-l { font-family: Georgia, 'Times New Roman', serif; font-size: 15px; }
          .bil-ps-why { margin-top: 3px; font-size: 10.5px; font-style: italic; color: #5A4E40; }
          .bil-ps-net td:last-child { font-size: 16px; font-weight: 500; }
          .bil-ps-net .pos { color: #156E4E; }
          .bil-ps-net .neg { color: #B02822; }
        `}</style>
        <PrintButton />

        {/* Letterhead */}
        <div className="header">
          <div className="company-name">{COMPANY_NAME}</div>
          <div className="company-reg">Registration No. {COMPANY_REG_NO}</div>
          {COMPANY_ADDRESS.map((line) => (
            <div key={line} className="company-reg">
              {line}
            </div>
          ))}
          <div className="doc-title">Monthly Consolidated Statement</div>
        </div>

        {/* Meta info */}
        <div className="meta">
          <div className="meta-left">
            <div><span className="meta-label">To: </span><span className="meta-value">{company?.name}</span></div>
            <div><span className="meta-label">Code: </span>{company?.short_code}</div>
          </div>
          <div className="meta-right" style={{ textAlign: 'right' }}>
            <div><span className="meta-label">Period: </span><span className="meta-value">{dayjs(statement.period_month).format('MMMM YYYY')}</span></div>
            <div>
              <span className="meta-label">Status: </span>
              <span className={`status-badge status-${statement.status}`}>{statement.status}</span>
            </div>
            {statement.issued_at && (
              <div><span className="meta-label">Issued: </span>{officeTime(statement.issued_at).format('D MMM YYYY')}</div>
            )}
          </div>
        </div>

        <FinSwitch
          fin={
            <HandoffSections
              company={company?.name ?? '—'}
              code={company?.short_code ?? company?.name ?? '—'}
              invoiceLines={invoiceLines.map(printLine)}
              contraLines={contraLines.map(printLine)}
              totalInvoice={Number(statement.total_invoice)}
              totalContra={Number(statement.total_contra)}
              net={netAmount}
            />
          }
          other={
        <>
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
        </>
          }
        />

        <div className="footer">
          <div>This is a computer-generated document. No signature is required.</div>
          <div style={{ marginTop: '4px' }}>
            Generated by HOUZS Venture Portal · {officeTime().format('D MMM YYYY HH:mm')} · Confidential
          </div>
        </div>
    </FinViewProvider>
  )
}
