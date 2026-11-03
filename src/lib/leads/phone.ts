// Lead View (2026-10-16): a Malaysian mobile number, as customers type it.
//
// findPhone is the twin of the database's lead_find_phone (mig 20261016300200) — the database decides
// what is stored; the app uses this to say what it found before saving, and the tests hold both to the
// same examples. Stored and handed round as digits only (0123384721); shown as 012-338 4721.

const PHONE = /(?:^|[^0-9+])(\+?6?0?[\s-]?1[0-9](?:[\s-]?[0-9]){7,8})(?![0-9])/

/** The first Malaysian mobile number in the text, digits only, or null. */
export function findPhone(text: string | null | undefined): string | null {
  const m = PHONE.exec(text ?? '')
  if (!m) return null
  let d = m[1].replace(/[^0-9]/g, '')
  if (d.startsWith('60')) d = d.slice(1)
  else if (d.startsWith('1')) d = '0' + d
  return /^01[0-9]{8,9}$/.test(d) ? d : null
}

/** 0123384721 → 012-338 4721; 01120934471 → 011-2093 4471. Anything else as it is. */
export function formatPhone(digits: string | null | undefined): string {
  const d = digits ?? ''
  if (/^01[0-9]{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6)}`
  if (/^01[0-9]{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)} ${d.slice(7)}`
  return d
}

/** WhatsApp's link to a Malaysian mobile, the message filled in: https://wa.me/60123384721?text=… */
export function whatsAppLink(digits: string, text: string): string {
  const intl = '6' + digits.replace(/[^0-9]/g, '')
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}
