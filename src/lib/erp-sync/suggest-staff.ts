import { normaliseName } from '@/lib/import/staff-match'

/**
 * Which salesperson an ERP name is probably about.
 *
 * The ERP names a salesperson in free text and the portal cannot place it
 * until a human says who it is. That was fine for a name a month; the
 * back-fill made it 55 at once, so the obvious ones arrive already chosen
 * and the human's job is to confirm rather than to hunt.
 *
 * ONE RULE: the same name, spelled the same once case and punctuation are
 * ignored, held by exactly one person on the list. Nothing looser. The real
 * data is the argument — "Lim" is the only ERP name that a substring rule
 * would resolve, and it would resolve it to LIM YAU WEI, who may well not be
 * the Lim who sold it. A wrong guess pays one person's commission to another
 * and cannot be taken back through this page, so a name two people share, or
 * a name nobody on the list has, stays a question.
 *
 * The candidates are the same list the row's dropdown renders, which is what
 * keeps a suggestion from ever naming somebody who is not offered.
 */
export function suggestStaffByName(
  agentName: string,
  staff: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  const wanted = normaliseName(agentName ?? '')
  if (wanted === '') return null
  const hits = staff.filter(s => normaliseName(s.name) === wanted)
  return hits.length === 1 ? hits[0].id : null
}
