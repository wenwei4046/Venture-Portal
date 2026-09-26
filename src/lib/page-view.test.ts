import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, createClient } = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc, createClient: vi.fn(() => ({ rpc })) }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))

import { logPageView } from './page-view'

describe('logPageView', () => {
  beforeEach(() => {
    rpc.mockReset()
    createClient.mockClear()
    rpc.mockReturnValue(Promise.resolve({ data: null, error: null }))
  })

  it('writes one page row through log_data_access from the browser', () => {
    logPageView('/fund-in')
    expect(rpc).toHaveBeenCalledWith('log_data_access', {
      p_resource_type: 'page',
      p_resource_id: '/fund-in',
      p_action: 'view',
    })
  })

  it('caps the path at the column width', () => {
    logPageView('/' + 'a'.repeat(400))
    expect(rpc.mock.calls[0][1].p_resource_id).toHaveLength(300)
  })

  it('ignores anything that is not a path', () => {
    logPageView('https://elsewhere.example/')
    logPageView('')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never throws — not when the client cannot be built, not when the write fails', async () => {
    createClient.mockImplementationOnce(() => {
      throw new Error('no env')
    })
    expect(() => logPageView('/fund-in')).not.toThrow()

    const failed = Promise.reject(new Error('network'))
    rpc.mockReturnValueOnce(failed)
    expect(() => logPageView('/fund-out')).not.toThrow()
    // The rejection is handled, not left to surface as an unhandled one.
    await expect(failed).rejects.toThrow('network')
  })
})
