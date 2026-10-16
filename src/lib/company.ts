/**
 * The company's name wherever the portal prints it in full — a document's
 * issuer, a statement's letterhead, a payslip, a report's header, the Revenue
 * app's sign-in footer (2026-10-16, the user: "holding, without s is correct",
 * then "改成 这个houzs venture holding sdn bhd"). A page that writes it in
 * capitals (the payslips, Director Salary's and Director Pool's prints) prints
 * `COMPANY_NAME.toUpperCase()`. The brand's short name, *HOUZS Venture*, stays
 * as it is; the bank account's own name is the bank's (`PAYMENT_DETAILS`).
 * `src/lib/company.test.ts` refuses the old name (no *Holding*, or
 * *Holdings*) anywhere in `src/`.
 */
export const COMPANY_NAME = 'HOUZS Venture Holding Sdn Bhd'
