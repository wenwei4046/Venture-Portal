/**
 * Fair organisers — the register, and how a dropdown of it behaves.
 *
 * The ERP sends the VENUE on every sales order and nothing about who ran the
 * event, so the organiser is the portal's own fact. It used to be free text
 * typed per venue; since 2026-09-17 it is a register (`comm_organisers`)
 * picked from a dropdown, because the same name typed three ways —
 * `HOMEDEC` / `Homedec` / `Home Dec` — is three organisers with a third of
 * the sales each, and nobody notices until a report is wrong.
 *
 * The matching key must agree with SQL's `organiser_key()`: upper case, single
 * spaces, empty becomes nothing. Exactly `venueKey()`'s rule, one table over.
 */

export interface Organiser {
  id: string
  name: string
  notes: string | null
  isActive: boolean
}

/** An organiser with what it has actually run, over whatever months are shown. */
export interface OrganiserFairs extends Organiser {
  /** (venue × month) pairs this organiser is named for. */
  fairs: number
  bills: number
  total: number
}

/** `  home   dec ` → `HOME DEC`. Empty or blank is null. */
export function organiserKey(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null
  const squeezed = name.trim().replace(/\s+/g, ' ')
  return squeezed === '' ? null : squeezed.toUpperCase()
}

/** The tidy spelling an organiser is stored and shown under. */
export function organiserName(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null
  const squeezed = name.trim().replace(/\s+/g, ' ')
  return squeezed === '' ? null : squeezed
}

/**
 * What a "who ran this fair?" dropdown should offer.
 *
 * Retired organisers are out — the point of retiring one is to stop it being
 * picked again — EXCEPT the one this row already holds. A dropdown that omits
 * its own value renders as the first option instead, so a retired organiser
 * would make every cell it appears in look like somebody else's, and saving
 * that row would quietly reassign the fair.
 */
export function organiserOptions<T extends Organiser>(
  all: readonly T[],
  chosenId: string | null,
): T[] {
  return all
    .filter(o => o.isActive || o.id === chosenId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/**
 * The register's own list: active first, then by name.
 *
 * Retired ones stay visible — they are what explains last year's fairs — but
 * below the live ones rather than mixed in alphabetically.
 */
export function sortOrganisers<T extends Organiser>(all: readonly T[]): T[] {
  return [...all].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

/**
 * The register with each organiser's fairs attached.
 *
 * The totals come from the venue rows already on screen
 * (`organiserTotals` in venue-register.ts), so "4 fairs · RM 1.2m" is exactly
 * the rows listed below it — including when the page is narrowed to one month.
 */
export function withFairs(
  all: readonly Organiser[],
  totals: ReadonlyMap<string, { fairs: number; bills: number; total: number }>,
): OrganiserFairs[] {
  return sortOrganisers(
    all.map(o => ({
      ...o,
      fairs: totals.get(o.id)?.fairs ?? 0,
      bills: totals.get(o.id)?.bills ?? 0,
      total: totals.get(o.id)?.total ?? 0,
    })),
  )
}

/** The organiser a name refers to, matched the way the database matches it. */
export function findOrganiserByName<T extends Organiser>(
  all: readonly T[],
  name: string | null | undefined,
): T | null {
  const key = organiserKey(name)
  if (!key) return null
  return all.find(o => organiserKey(o.name) === key) ?? null
}
