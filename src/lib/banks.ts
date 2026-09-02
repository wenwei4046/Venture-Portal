// The banks a payroll account can sit at.
//
// One list, two readers: the InfoTech staff import turns the export's bank
// code into a name with it, and the staff forms offer the same names as
// suggestions — so "Hong Leong Bank" is spelled one way whichever door a
// person came in through.

export const BANK_CODES: Record<string, string> = {
  '7725': 'AmBank',
  '7747': 'Hong Leong Bank',
  '7766': 'Public Bank',
  '7798': 'Maybank',
  '7830': 'CIMB',
  '7832': 'RHB',
  '7844': 'Alliance Bank',
}

/** The names alone, alphabetical, for a form's suggestion list. */
export const BANK_NAMES: readonly string[] = Object.values(BANK_CODES).sort((a, b) =>
  a.localeCompare(b),
)

/**
 * The name for an export's bank code. A code the map does not know is kept
 * as typed — the file is the source of truth and a wrong guess would be worse
 * than a code somebody can look up.
 */
export function bankNameFromCode(code: string | null | undefined): string | null {
  const c = (code ?? '').trim()
  if (c === '') return null
  return BANK_CODES[c] ?? c
}
