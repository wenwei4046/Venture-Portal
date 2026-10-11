/**
 * Web Push, by the standards and nothing else (2026-10-11 — the user: "铃铛 + 手机推送").
 *
 * - RFC 8291 + RFC 8188 (`aes128gcm`): the message is encrypted for the one
 *   device that subscribed — an ephemeral P-256 key agreed with the device's
 *   key, the device's auth secret mixed in through HKDF, AES-128-GCM.
 * - RFC 8292 (VAPID): the push service is shown a short ES256-signed token,
 *   so only this server's key may send to subscriptions made with its public key.
 *
 * WebCrypto only (`crypto.subtle`): the same code runs in Node and in workerd,
 * and no package reaches the server bundle. Pure but for the clock and the
 * random salt / ephemeral key, which a test may hand in.
 */

const enc = new TextEncoder()

export function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** An uncompressed P-256 point (65 bytes, 0x04 ‖ x ‖ y) as a JWK's x and y. */
function pointXY(point: Uint8Array): { x: string; y: string } {
  if (point.length !== 65 || point[0] !== 4) throw new Error('A P-256 public key is 65 bytes, starting 0x04.')
  return { x: b64url(point.subarray(1, 33)), y: b64url(point.subarray(33, 65)) }
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8))
}

export interface Subscription {
  endpoint: string
  /** The device's P-256 key, base64url (65 bytes uncompressed). */
  p256dh: string
  /** The device's 16-byte auth secret, base64url. */
  auth: string
}

/** For a test: the ephemeral key and salt RFC 8291's example uses. */
export interface Fixed {
  /** The application server's ephemeral private key, base64url (32 bytes). */
  asPrivate: string
  /** Its public key, base64url (65 bytes). */
  asPublic: string
  salt: string
}

/** The message, encrypted for the subscription (`aes128gcm`, one record). */
export async function encrypt(plaintext: Uint8Array, sub: Pick<Subscription, 'p256dh' | 'auth'>, fixed?: Fixed): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh)
  const authSecret = fromB64url(sub.auth)
  if (authSecret.length !== 16) throw new Error('A subscription’s auth secret is 16 bytes.')
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  let asPrivate: CryptoKey
  let asPublic: Uint8Array
  if (fixed) {
    asPublic = fromB64url(fixed.asPublic)
    asPrivate = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: fixed.asPrivate, ...pointXY(asPublic), ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    asPrivate = pair.privateKey
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }
  const salt = fixed ? fromB64url(fixed.salt) : crypto.getRandomValues(new Uint8Array(16))

  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256))
  const ikm = await hkdf(shared, authSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12)

  // One record: the message, then the last-record delimiter 0x02.
  const record = concat(plaintext, new Uint8Array([2]))
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, record as BufferSource))

  // The header: salt ‖ record size (4096) ‖ key id length ‖ key id (the ephemeral public key).
  const rs = new Uint8Array([0, 0, 0x10, 0])
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed)
}

/** The VAPID `Authorization` header for one push service (its origin), signed with the server's key. */
export async function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string }, subject: string, nowSeconds: number): Promise<string> {
  const aud = new URL(endpoint).origin
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: nowSeconds + 12 * 3600, sub: subject })))
  const pub = fromB64url(keys.publicKey)
  const signer = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: keys.privateKey, ...pointXY(pub), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, enc.encode(`${head}.${body}`) as BufferSource))
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${keys.publicKey}`
}

export interface PushMessage {
  title: string
  body: string
  /** Where a tap opens. */
  url: string
  /** A later message with the same tag replaces this one on the device. */
  tag?: string
}

export type SendOutcome = { ok: true } | { ok: false; gone: boolean; status: number }

/** Send one message to one device. `gone` — the subscription is no more (404 / 410): forget it. */
export async function sendPush(
  sub: Subscription,
  message: PushMessage,
  keys: { publicKey: string; privateKey: string },
  subject: string,
  opts: { ttlSeconds?: number; now?: number; fetcher?: typeof fetch } = {},
): Promise<SendOutcome> {
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub)
  const res = await (opts.fetcher ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject, Math.floor((opts.now ?? Date.now()) / 1000)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttlSeconds ?? 24 * 3600),
      Urgency: 'normal',
    },
    body: body as BodyInit,
  })
  if (res.ok) return { ok: true }
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status }
}
