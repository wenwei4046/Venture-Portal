import { describe, expect, it, vi } from 'vitest'
import { b64url, encrypt, fromB64url, sendPush, vapidAuthorization } from './webpush'

// RFC 8291, Appendix A — the standard's own example, byte for byte.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const enc = new TextEncoder()
const xy = (p: Uint8Array) => ({ x: b64url(p.subarray(1, 33)), y: b64url(p.subarray(33, 65)) })

/** What the device does: its private key, the auth secret, the header's key and salt → the message. */
async function decrypt(body: Uint8Array, uaPrivate: string, uaPublic: string, auth: string): Promise<string> {
  const salt = body.subarray(0, 16)
  const idlen = body[20]
  const asPublic = body.subarray(21, 21 + idlen)
  const sealed = body.subarray(21 + idlen)
  const ua = fromB64url(uaPublic)
  const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: uaPrivate, ...xy(ua), ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const asKey = await crypto.subtle.importKey('raw', asPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, priv, 256))
  const hk = async (ikm: Uint8Array, s: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']), n * 8))
  const ikm = await hk(shared, fromB64url(auth), new Uint8Array([...enc.encode('WebPush: info\0'), ...ua, ...asPublic]), 32)
  const cek = await hk(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hk(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt'])
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, sealed as BufferSource))
  let end = record.length - 1
  while (end > 0 && record[end] === 0) end--
  expect(record[end]).toBe(2)
  return new TextDecoder().decode(record.subarray(0, end))
}

describe('a push message, encrypted (RFC 8291)', () => {
  it('is the standard’s own example, byte for byte', async () => {
    const body = await encrypt(enc.encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { asPrivate: RFC.asPrivate, asPublic: RFC.asPublic, salt: RFC.salt })
    expect(b64url(body)).toBe(RFC.body)
  })

  it('opens on the device with a fresh key and salt each time', async () => {
    const sub = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const a = await encrypt(enc.encode('Grace Lim booked Meeting Room 1 for you'), sub)
    const b = await encrypt(enc.encode('Grace Lim booked Meeting Room 1 for you'), sub)
    expect(b64url(a)).not.toBe(b64url(b))
    expect(await decrypt(a, RFC.uaPrivate, RFC.uaPublic, RFC.auth)).toBe('Grace Lim booked Meeting Room 1 for you')
    expect(await decrypt(b, RFC.uaPrivate, RFC.uaPublic, RFC.auth)).toBe('Grace Lim booked Meeting Room 1 for you')
  })

  it('refuses a subscription whose auth secret is not 16 bytes', async () => {
    await expect(encrypt(enc.encode('x'), { p256dh: RFC.uaPublic, auth: 'AAAA' })).rejects.toThrow(/16 bytes/)
  })
})

describe('the VAPID token (RFC 8292)', () => {
  it('names the push service, expires in twelve hours, and verifies with the public key', async () => {
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { publicKey: RFC.asPublic, privateKey: RFC.asPrivate }, 'https://venture.example', 1_760_000_000)
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!
    expect(m[4]).toBe(RFC.asPublic)
    expect(JSON.parse(new TextDecoder().decode(fromB64url(m[1])))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(fromB64url(m[2])))).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_760_000_000 + 12 * 3600, sub: 'https://venture.example' })
    const pub = await crypto.subtle.importKey('raw', fromB64url(RFC.asPublic) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(m[3]) as BufferSource, enc.encode(`${m[1]}.${m[2]}`) as BufferSource)).toBe(true)
  })
})

describe('sending', () => {
  const sub = { endpoint: 'https://web.push.apple.com/QGuQ', p256dh: RFC.uaPublic, auth: RFC.auth }
  const keys = { publicKey: RFC.asPublic, privateKey: RFC.asPrivate }

  it('posts the encrypted message with the headers a push service asks', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }))
    expect(await sendPush(sub, { title: 'Meeting booked', body: 'Room 1', url: '/member' }, keys, 'https://venture.example', { fetcher })).toEqual({ ok: true })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(sub.endpoint)
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'normal' })
    expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^vapid t=.+, k=/)
    expect(JSON.parse(await decrypt(init.body as Uint8Array, RFC.uaPrivate, RFC.uaPublic, RFC.auth))).toEqual({ title: 'Meeting booked', body: 'Room 1', url: '/member' })
  })

  it('says a subscription is gone on 404 and 410, and only then', async () => {
    for (const [status, gone] of [[410, true], [404, true], [429, false], [500, false]] as const) {
      const fetcher = vi.fn(async () => new Response(null, { status }))
      expect(await sendPush(sub, { title: 't', body: 'b', url: '/' }, keys, 's', { fetcher })).toEqual({ ok: false, gone, status })
    }
  })
})
