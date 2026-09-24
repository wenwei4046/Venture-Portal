/**
 * What a sales line says it is — the TypeScript twin of `catalogue_line_facts`
 * (migration 20260924030000 §3).
 *
 * The feed does not carry the ERP's structured `variants`; it carries
 * `description2`, which for every line the ERP wrote itself is its own
 * `buildVariantSummary` (scm/shared/variant-summary.ts):
 *
 *   BO315-01 PEARL / SEAT 35 / LEG DEFAULT / SPECIAL: Nylon Fabric   — a sofa module
 *   NB-04 / DIVAN 8" + LEG 4" / GAP 12" / T.Heights 24"               — a bed frame
 *   PC151-01 / DIVAN 10" + NO LEG / GAP 14" / T.Heights 24"
 *
 * That grammar is parsed. When the raw line DOES carry `variants` they win.
 * Hand-typed AutoCount-era text (`Divan:10”+NoLeg/Gap:12”/Col:TBC`) matches
 * none of it and parses to nothing — `parsedFrom: null` — and such a line is
 * costed on its SKU alone.
 */

export interface LineFacts {
  fabric: string | null
  seat: string | null
  leg: string | null
  divan: string | null
  gap: string | null
  total: string | null
  specials: string[]
  parsedFrom: 'variants' | 'description2' | null
}

const EMPTY: LineFacts = {
  fabric: null,
  seat: null,
  leg: null,
  divan: null,
  gap: null,
  total: null,
  specials: [],
  parsedFrom: null,
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function fromVariants(v: Record<string, unknown>): LineFacts {
  const specials = Array.isArray(v.specials)
    ? v.specials.map(text).filter((s): s is string => s !== null)
    : text(v.specials) !== null
      ? [text(v.specials)!]
      : []
  return {
    fabric: text(v.fabricCode) ?? text(v.fabricColor),
    seat: text(v.seatHeight) ?? text(v.depth),
    leg: text(v.legHeight) ?? text(v.sofaLegHeight),
    divan: text(v.divanHeight),
    gap: text(v.gap),
    total: text(v.totalHeight),
    specials,
    parsedFrom: 'variants',
  }
}

export function parseLineFacts(description2: string | null | undefined, raw?: unknown): LineFacts {
  const variants =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).variants
      : undefined
  if (variants && typeof variants === 'object' && !Array.isArray(variants)) {
    return fromVariants(variants as Record<string, unknown>)
  }

  const d2 = description2 ?? ''
  if (d2.trim() === '') return { ...EMPTY, specials: [] }

  const out: LineFacts = { ...EMPTY, specials: [] }
  let hit = false
  // Split BEFORE trimming, as the SQL does: a leading " / " leaves an empty
  // first segment and a trailing one an empty last, never "30 /" as a seat.
  d2.split(/\s+\/\s+/).forEach((part, i) => {
    const seg = part.trim()
    let m: RegExpMatchArray | null
    if (/^SEAT\s+/i.test(seg)) {
      out.seat = seg.replace(/^SEAT\s+/i, '').trim()
      hit = true
    } else if (/^DIVAN\s+/i.test(seg)) {
      m = seg.match(/^DIVAN\s+(.+?)\s*\+\s*(?:LEG\s+(.+)|(NO\s*LEG))\s*$/i)
      if (m) {
        out.divan = m[1].trim()
        out.leg = m[2] !== undefined ? m[2].trim() : 'No Leg'
      } else {
        out.divan = seg.replace(/^DIVAN\s+/i, '').trim()
      }
      hit = true
    } else if (/^LEG\s+/i.test(seg)) {
      out.leg = seg.replace(/^LEG\s+/i, '').trim()
      hit = true
    } else if (/^NO\s*LEG$/i.test(seg)) {
      out.leg = 'No Leg'
      hit = true
    } else if (/^GAP\s+/i.test(seg)) {
      out.gap = seg.replace(/^GAP\s+/i, '').trim()
      hit = true
    } else if (/^T\.\s*Heights?\s+/i.test(seg)) {
      out.total = seg.replace(/^T\.\s*Heights?\s+/i, '').trim()
      hit = true
    } else if (/^SPECIAL:\s*/i.test(seg)) {
      out.specials = seg
        .replace(/^SPECIAL:\s*/i, '')
        .split(/\s+\+\s+/)
        .map(s => s.trim())
        .filter(Boolean)
      hit = true
    } else if (/^FREE\b/i.test(seg)) {
      // A campaign marker, not a specification.
    } else if (i === 0) {
      out.fabric = seg.split(' ')[0] || null
    }
  })

  if (!hit) return { ...EMPTY, specials: [] }
  out.parsedFrom = 'description2'
  return out
}
