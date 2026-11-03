import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adAccountName, forgetAdAccounts } from './ad-account'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => forgetAdAccounts())

describe('Lead View › the ad account an ad runs from', () => {
  it('asks the ad for its account, then the account for its name — once per ad', async () => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('?fields=account_id') ? json(200, { account_id: '1234567890' }) : json(200, { name: "2990's Mini@Kelana Jaya" })) as unknown as typeof fetch
    expect(await adAccountName('120210000000101', 'SYS', f, 0)).toBe("2990's Mini@Kelana Jaya")
    expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0])).toContain('/act_1234567890?fields=name')
    expect(await adAccountName('120210000000101', 'SYS', f, 1)).toBe("2990's Mini@Kelana Jaya")
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('asks nothing without a token or for an id that is not one', async () => {
    const f = vi.fn() as unknown as typeof fetch
    expect(await adAccountName('120210000000101', undefined, f)).toBeNull()
    expect(await adAccountName('abc', 'SYS', f)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('answers null when Meta will not say (an ad the token cannot see) and asks again after ten minutes', async () => {
    const f = vi.fn(async () => json(400, { error: { code: 100, error_subcode: 33 } })) as unknown as typeof fetch
    expect(await adAccountName('120210000000202', 'SYS', f, 0)).toBeNull()
    expect(await adAccountName('120210000000202', 'SYS', f, 60_000)).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
    expect(await adAccountName('120210000000202', 'SYS', f, 11 * 60_000)).toBeNull()
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('never throws on a network failure', async () => {
    const f = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await adAccountName('120210000000303', 'SYS', f)).toBeNull()
  })
})
