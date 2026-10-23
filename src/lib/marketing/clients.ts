// A client's details as the manager edits them on its page (②b-2d-2a, mig 20261025034000 — the user's answer 29:
// "Clients may be renamed, their PIC changed; a company may carry one or two PICs"): its name (Marketing's own clients
// only — a group company keeps its own), its PIC and their WhatsApp, its second PIC and theirs. Only what changed goes
// to mkt_sub_edit, and what it would refuse is said before Save. Pure.

import type { MktSub } from './board'

export interface ClientEdit {
  name: string
  pic: string
  whatsapp: string
  pic2: string
  whatsapp2: string
}

export type ClientKey = keyof ClientEdit
const KEYS: readonly ClientKey[] = ['name', 'pic', 'whatsapp', 'pic2', 'whatsapp2']

/** As the database keeps a name: trimmed, its spaces single. */
const tidy = (v: string) => v.trim().replace(/\s+/g, ' ')

export const clientEditOf = (s: MktSub): ClientEdit =>
  ({ name: s.name, pic: s.pic ?? '', whatsapp: s.whatsapp ?? '', pic2: s.pic2 ?? '', whatsapp2: s.whatsapp2 ?? '' })

/** Only what changed, as mkt_sub_edit takes it (a field emptied: null) — never a group company's name; null when
 * nothing did. */
export function clientPatch(saved: ClientEdit, now: ClientEdit, client: boolean): Partial<Record<ClientKey, string | null>> | null {
  const patch: Partial<Record<ClientKey, string | null>> = {}
  for (const k of KEYS) {
    if (k === 'name' && !client) continue
    const v = k === 'whatsapp' || k === 'whatsapp2' ? now[k].trim() : tidy(now[k])
    if (v === (k === 'whatsapp' || k === 'whatsapp2' ? saved[k].trim() : tidy(saved[k]))) continue
    patch[k] = v || (k === 'name' ? '' : null)
  }
  return Object.keys(patch).length ? patch : null
}

const WHATSAPP = /^[+0-9 ()-]*$/

/** What mkt_sub_edit would refuse, in its words. */
export function clientProblems(now: ClientEdit, client: boolean): string[] {
  const out: string[] = []
  const name = tidy(now.name), pic = tidy(now.pic), pic2 = tidy(now.pic2)
  if (client && !name) out.push('Name the client')
  if (client && name.length > 80) out.push('A name of at most 80 characters')
  if (pic.length > 80 || pic2.length > 80) out.push('A PIC’s name of at most 80 characters')
  if (!WHATSAPP.test(now.whatsapp.trim()) || !WHATSAPP.test(now.whatsapp2.trim())) out.push('A WhatsApp number, digits only')
  if (pic2 && !pic) out.push('Name the first PIC before a second')
  if (pic2 && pic && pic2.toLowerCase() === pic.toLowerCase()) out.push('The second PIC is somebody else')
  return out
}

/** "Kelvin", "Kelvin and Hana" — the PICs as a line names them. */
export function picNames(pic: string | null | undefined, pic2?: string | null): string {
  const a = (pic ?? '').trim(), b = (pic2 ?? '').trim()
  return a && b ? `${a} and ${b}` : a || b
}
