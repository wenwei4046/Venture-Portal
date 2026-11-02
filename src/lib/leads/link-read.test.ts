import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { pageText, refusedAddress } = await import('./link-read')

describe('refusedAddress', () => {
  it('takes a public https page', () => expect(refusedAddress('https://2990s.com.my/sofas')).toBeNull())
  it('refuses http, local names and private IPs', () => {
    for (const u of ['http://2990s.com.my', 'https://localhost/x', 'https://intranet/x', 'https://10.0.0.5/', 'https://192.168.1.1/', 'https://172.20.0.1/', 'https://169.254.169.254/latest', 'https://127.0.0.1/', 'https://[::1]/', 'not a url']) {
      expect(refusedAddress(u), u).not.toBeNull()
    }
  })
})

describe('pageText', () => {
  it('keeps the words, drops scripts and markup, reads entities', () => {
    const t = pageText('<html><head><title>Sofas | 2990s</title><style>p{}</style></head><body><script>x()</script><h1>L-shape sofas</h1><p>From RM&nbsp;2,990 &amp; up</p><ul><li>Oslo</li><li>Bergen</li></ul></body></html>')
    expect(t).toBe('Sofas | 2990s\nL-shape sofas\nFrom RM 2,990 & up\nOslo\nBergen')
  })
})
