// Every report shares the Cash Flow skin (user 2026-09-18: "report 那边的颜色
// 等等弄到和 cash flow 的一样"). One scope class puts the navy / gold tokens
// over the section, and globals.css restyles any `ledger-table` inside it —
// navy header, flat white rows, gold rules — so Trial Balance, Ledger, Aging,
// Loan Monitor, Company Statement and the GL statements all read as one set.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <div className="cf-scope">{children}</div>
}
