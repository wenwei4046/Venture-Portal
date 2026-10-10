// The printed statement's two sides and its net, the handoff's way
// (2026-10-10): "A · Invoice Items (Billable)" in a green box tagged with who
// owes whom, "B · Contra Items (Non-Billable)" in a red one — deducted — and
// the net naming the direction: "Net Payable · <company> pays HOUZS Venture"
// over "A x − B y = net · why". The page's own <style> dresses the classes.
// Finance and the Principal print this; a Director keeps the plain layout.

export interface PrintLine {
  id: string
  category: string
  description: string | null
  amount: number
}

const fmt = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Lines({ lines, contra }: { lines: PrintLine[]; contra: boolean }) {
  return (
    <tbody>
      {lines.map((line) => (
        <tr key={line.id}>
          <td>
            {line.category}
            {line.description ? <div className="line-desc">{line.description}</div> : null}
          </td>
          <td>{contra ? `(${fmt(line.amount)})` : fmt(line.amount)}</td>
        </tr>
      ))}
    </tbody>
  )
}

export function HandoffSections({
  company,
  code,
  invoiceLines,
  contraLines,
  totalInvoice,
  totalContra,
  net,
}: {
  company: string
  /** The company's short code — "CAR" in "CAR owes HV". */
  code: string
  invoiceLines: PrintLine[]
  contraLines: PrintLine[]
  totalInvoice: number
  totalContra: number
  net: number
}) {
  const pays = net >= 0
  return (
    <>
      <div className="bil-ps-box a">
        <div className="bil-ps-head">
          <h2>
            <b>A</b> · Invoice Items (Billable)
          </h2>
          <span className="bil-ps-tag">
            {code} owes HV · {code} → HV
          </span>
        </div>
        {invoiceLines.length === 0 ? (
          <p className="bil-ps-none">No invoice items this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount (RM)</th>
              </tr>
            </thead>
            <Lines lines={invoiceLines} contra={false} />
            <tfoot>
              <tr>
                <td>Subtotal Invoice (A)</td>
                <td>{fmt(totalInvoice)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="bil-ps-box b">
        <div className="bil-ps-head">
          <h2>
            <b>B</b> · Contra Items (Non-Billable)
          </h2>
          <span className="bil-ps-tag">
            HV owes {code} · HV → {code} · deducted
          </span>
        </div>
        {contraLines.length === 0 ? (
          <p className="bil-ps-none">No contra items this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount (RM)</th>
              </tr>
            </thead>
            <Lines lines={contraLines} contra />
            <tfoot>
              <tr>
                <td>Subtotal Contra (B)</td>
                <td>({fmt(totalContra)})</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <table className="bil-ps-net">
        <tbody>
          <tr>
            <td>
              <div className="bil-ps-net-l">
                {pays ? 'Net Payable' : 'Net Credit'} · <b>{pays ? `${company} pays HOUZS Venture` : `HOUZS Venture pays ${company}`}</b>
              </div>
              <div className="bil-ps-why">
                A {fmt(totalInvoice)} − B {fmt(totalContra)} = {net < 0 ? '−' : ''}
                {fmt(Math.abs(net))} ·{' '}
                {pays
                  ? 'Invoices are more than contra — the balance is due to HV.'
                  : 'Contra (interest HV owes you) is more than the invoices — HV owes you the balance.'}
              </div>
            </td>
            <td>
              <span className={pays ? 'pos' : 'neg'}>RM {fmt(Math.abs(net))}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
