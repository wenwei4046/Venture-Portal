import { describe, expect, it, vi } from 'vitest'
import { AR_PARENT, accountFamily, resolveArGlCode } from './ar-accounts'

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }>

function client(rpc: Rpc, children: string[] = []) {
  return {
    rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
    from: () => ({
      select: () => ({
        eq: async () => ({ data: children.map((code) => ({ code })) }),
      }),
    }),
  } as never
}

describe('resolveArGlCode', () => {
  it('asks the invoice first — the invoice names the customer', async () => {
    const calls: string[] = []
    const code = await resolveArGlCode(
      client(async (name) => {
        calls.push(name)
        return { data: name === 'ar_account_for_invoice' ? '3031' : '3039' }
      }),
      { invoiceId: 'inv-1', companyId: 'other-co' },
    )
    expect(code).toBe('3031')
    expect(calls).toEqual(['ar_account_for_invoice'])
  })

  it('falls back to the party when there is no invoice', async () => {
    const seen: Record<string, unknown>[] = []
    const code = await resolveArGlCode(
      client(async (_n, args) => {
        seen.push(args)
        return { data: '3073' }
      }),
      { departmentId: 'dept-1' },
    )
    expect(code).toBe('3073')
    expect(seen[0]).toMatchObject({ p_company_id: null, p_department_id: 'dept-1', p_freetext: null })
  })

  it('never returns nothing — an unresolved party lands on the parent', async () => {
    const code = await resolveArGlCode(client(async () => ({ data: null })), { companyId: 'x' })
    expect(code).toBe(AR_PARENT)
  })
})

describe('accountFamily', () => {
  it('is the parent plus its children — reading the parent alone reads zero', async () => {
    const family = await accountFamily(client(async () => ({ data: null }), ['3031', '3032']), '3030')
    expect(family).toEqual(['3030', '3031', '3032'])
  })

  it('a childless parent is just itself', async () => {
    expect(await accountFamily(client(async () => ({ data: null })), '3040')).toEqual(['3040'])
  })
})
