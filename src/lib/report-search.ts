// Account search for the GL statements and the month matrices.
//
// The reports run to a few hundred rows across a collapsible tree, so finding
// one account meant expanding by hand and eyeballing. This drives a search box
// that HIGHLIGHTS matches and auto-expands to reveal them — deliberately never
// hides a row (user 2026-07-31): a statement with rows filtered out invites
// reading a subtotal as if it covered only what's on screen.
//
// Match rule: the trimmed, case-folded query is a substring of the account CODE
// or of its NAME. That covers all three ways Finance looks something up —
// "9030", "salary", "salary expense".

export interface HighlightPart {
  text: string
  hit: boolean
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** Does this account match? `query` may be raw — it is normalized here. */
export function matchesAccount(
  query: string,
  code: string | null | undefined,
  name: string | null | undefined,
): boolean {
  const q = normalizeQuery(query)
  if (!q) return false
  return (
    (code ?? '').toLowerCase().includes(q) || (name ?? '').toLowerCase().includes(q)
  )
}

/**
 * Split `text` into runs so the matched ones can render as <mark>.
 * Returns a single non-hit part when the query is empty or absent.
 */
export function highlight(text: string, query: string): HighlightPart[] {
  const q = normalizeQuery(query)
  if (!q || !text) return [{ text, hit: false }]

  const haystack = text.toLowerCase()
  const parts: HighlightPart[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(q, from)
    if (at === -1) break
    if (at > from) parts.push({ text: text.slice(from, at), hit: false })
    parts.push({ text: text.slice(at, at + q.length), hit: true })
    from = at + q.length
  }
  if (parts.length === 0) return [{ text, hit: false }]
  if (from < text.length) parts.push({ text: text.slice(from), hit: false })
  return parts
}
