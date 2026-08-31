/**
 * Parser for the Product List bulk paste (Settings → Product List).
 *
 * Keying several hundred product costs one field at a time is not realistic, so
 * the Principal pastes a block straight out of a spreadsheet. This turns that
 * block into rows; the Server Action does the writing.
 *
 * Pure on purpose — Server Actions drag in next/cache and the Supabase SSR
 * cookie jar, so the project convention is to test the helper, not the action.
 */

export interface ProductDraft {
  itemCode: string
  productName: string | null
  brandCode: string | null
  itemGroup: string | null
  /** null = a known product whose cost has not been keyed in yet. NOT zero. */
  unitCost: number | null
}

export interface ProductPasteResult {
  parsed: ProductDraft[]
  skipped: Array<{ line: number; text: string; reason: string }>
}

/** Split on tabs, or on commas that are not inside double quotes. */
function splitCells(line: string): string[] {
  return line
    .split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(c => c.trim().replace(/^"|"$/g, '').trim())
}

/**
 * Accepts, in the order a spreadsheet paste produces them:
 *
 *   Item Code [, Product Name] [, Brand] [, Item Group] [, Unit Cost]
 *
 * The cost is taken from the LAST cell that reads as a number, so a paste with
 * fewer columns still lands the cost in the right place rather than silently
 * reading a product name as money. A header row is skipped, blank lines are
 * ignored, and a duplicate code inside one paste is reported instead of letting
 * the last one quietly win.
 */
export function parseProductPaste(raw: string): ProductPasteResult {
  const parsed: ProductDraft[] = []
  const skipped: ProductPasteResult['skipped'] = []
  const seen = new Set<string>()

  raw.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const cells = splitCells(trimmed)
    const itemCode = cells[0] ?? ''
    if (!itemCode) {
      skipped.push({ line: i + 1, text: trimmed, reason: 'No item code' })
      return
    }
    if (/^item\s*code$/i.test(itemCode)) return // header row

    const key = itemCode.toUpperCase()
    if (seen.has(key)) {
      skipped.push({ line: i + 1, text: trimmed, reason: 'Duplicate item code in this paste' })
      return
    }
    seen.add(key)

    let unitCost: number | null = null
    let costCell = -1
    for (let c = cells.length - 1; c >= 1; c--) {
      if (cells[c] === '') continue
      const n = Number(cells[c].replace(/,/g, ''))
      if (Number.isFinite(n)) {
        unitCost = n
        costCell = c
        break
      }
    }

    if (unitCost !== null && unitCost < 0) {
      skipped.push({ line: i + 1, text: trimmed, reason: 'Negative cost' })
      return
    }

    // Only treat a cell as a label if it is not the one we read the cost from.
    const label = (idx: number) => (idx !== costCell && cells[idx] ? cells[idx] : null)

    parsed.push({
      itemCode,
      productName: label(1),
      brandCode: label(2)?.toUpperCase() ?? null,
      itemGroup: label(3)?.toUpperCase() ?? null,
      unitCost,
    })
  })

  return { parsed, skipped }
}
