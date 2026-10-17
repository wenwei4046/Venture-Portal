/**
 * A person's first and last name (2026-10-17 — the user, on the Revenue app's "Hello, LOO WEN": "我希望只放一个字就好，
 * 也就是他们的姓 … 大家的名字需要拆分为 first name 和 last name。在这里的层面上就只放 first name"). The full name stays
 * the one on their IC; the two are what the apps call them — `hr_staff_costs.first_name` / `last_name`, filled from
 * the full name by the database (`person_name_parts`, mig 20261017153000) and HR's to change on the person's page.
 * Pure.
 */

/** "LOO WEN WEI" → LOO · WEN WEI; "PETER" → PETER · none — the database's own split (`person_name_parts`). */
export function nameParts(name: string | null | undefined): { first: string | null; last: string | null } {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return { first: words[0] ?? null, last: words.length > 1 ? words.slice(1).join(' ') : null }
}

/** The two as a page shows them: what the record keeps — or, for a row with neither (read before they were filled), the full name's parts. */
export function keptParts(row: { employee_name: string; first_name?: string | null; last_name?: string | null }): { first: string | null; last: string | null } {
  if (row.first_name == null && row.last_name == null) return nameParts(row.employee_name)
  return { first: row.first_name ?? null, last: row.last_name ?? null }
}

/** What an app greets them by: one word — the first name the record keeps, else the full name's first. */
export function greetingName(name: string | null | undefined, first?: string | null): string {
  return first?.trim() || nameParts(name).first || ''
}
