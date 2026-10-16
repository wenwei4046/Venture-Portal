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

/**
 * Its SSM registration number, the new twelve digits and the old number in
 * brackets (2026-10-16, the user: "202501008262 (1609676-A)") — under the name
 * on the monthly statement's letterhead, which printed a placeholder until then.
 */
export const COMPANY_REG_NO = '202501008262 (1609676-A)'

/**
 * Its address, as the letterhead prints it — two lines, the letterhead's
 * capitals (2026-10-16, the user: "E-28-02 AND E-28-03,E-28-03A, MENARA
 * SUEZCAP 2, KL GATEWAY, NO. 2, JALAN KERINCHI, GERBANG KERINCHI LESTARI,
 * 59200 KUALA LUMPUR, W.P KUALA LUMPUR"); the statement printed a made-up one
 * until then.
 */
export const COMPANY_ADDRESS: readonly string[] = [
  'E-28-02 and E-28-03, E-28-03A, Menara Suezcap 2, KL Gateway',
  'No. 2, Jalan Kerinchi, Gerbang Kerinchi Lestari, 59200 Kuala Lumpur, W.P. Kuala Lumpur',
]
