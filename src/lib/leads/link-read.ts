import 'server-only'

// Lead View › Data Center › Web links (2026-11-02, mig 20261102140000): reading a link's page for the agent — Check now,
// and a link the agent is about to read whose last check is older than its frequency. One page: its address, fetched
// by the server, 8 s at most, 2 MB at most, its words without the markup. Only https, and never an address inside a
// network (localhost, a bare IP of a private range) — the page's address is typed by somebody with Lead View · Manage.

const MAX_BYTES = 2_000_000
const MAX_TEXT = 200_000

/** Not an address this server should ask: not https, a local name, or a private or link-local IP. */
export function refusedAddress(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return 'That is not a web address.' }
  if (u.protocol !== 'https:') return 'A link is an https address.'
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return 'That address is inside a network.'
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return 'That address is inside a network.'
  }
  if (h.includes(':') && (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:'))) return 'That address is inside a network.'
  return null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** A page's words: scripts, styles and markup gone, entities read, blank lines folded. */
export function pageText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const body = html
    .replace(/<(script|style|noscript|svg|template|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .split('\n').map(l => l.replace(/[ \t\f\v ]+/g, ' ').trim()).filter(Boolean).join('\n')
  return ((title && !body.startsWith(title) ? `${title}\n` : '') + body).slice(0, MAX_TEXT)
}

/** Read one link's page. Never throws: `{ text }` or `{ error }` in words. */
export async function readLink(url: string): Promise<{ text: string } | { error: string }> {
  const bad = refusedAddress(url)
  if (bad) return { error: bad }
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'LeadView/1.0 (+data center link check)', accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.5' } })
    if (res.url && refusedAddress(res.url)) return { error: 'The page sent us inside a network.' }
    if (!res.ok) return { error: `The page answered ${res.status}.` }
    const type = res.headers.get('content-type') ?? ''
    if (!/text\/|xhtml|xml|json/.test(type)) return { error: 'That address is not a web page (a file Lead View cannot read as text).' }
    const reader = res.body?.getReader()
    if (!reader) return { error: 'The page sent nothing.' }
    const chunks: Uint8Array[] = []
    let n = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      n += value.byteLength
      chunks.push(value)
      if (n > MAX_BYTES) { await reader.cancel(); break }
    }
    const raw = new TextDecoder().decode(Buffer.concat(chunks))
    const text = /html|xml/.test(type) ? pageText(raw) : raw.slice(0, MAX_TEXT)
    return text.trim() ? { text } : { error: 'The page has no words to read.' }
  } catch (e) {
    return { error: e instanceof Error && e.name === 'TimeoutError' ? 'The page took too long to answer.' : 'The page could not be reached.' }
  }
}
