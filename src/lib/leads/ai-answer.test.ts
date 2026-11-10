import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const askModel = vi.fn()
vi.mock('./ai-model', () => ({ AI_NOT_CONNECTED: 'not connected', askModel: (...a: unknown[]) => askModel(...a) }))
vi.mock('./agent-read', () => ({ agentMore: async () => null, usedMemory: (used: Array<{ id: string }>) => used.filter(u => u.id.startsWith('mem-')).map(u => u.id.slice(4)) }))
const sendLeadOutbox = vi.fn(async () => 1)
vi.mock('./messenger-outbox', () => ({ sendLeadOutbox: (...a: unknown[]) => sendLeadOutbox(...(a as [])) }))

import { answerLeads, lastingFailure } from './ai-answer'
import { systemPrompt, type Persona } from './ai'

const persona = { brandName: '2990s', agentName: 'Aina', personality: '', tone: 'warm', goal: '', dos: '', donts: '', examples: '', mode: 'copilot' } as unknown as Persona
const context = {
  persona, knowledge: [], today: '2026-11-02', messages: [{ direction: 'in', sender: 'customer', body: 'price?' }],
  contact: { brandId: 'b1', name: 'Ray', channel: 'messenger', sourceAd: '', phone: null, interest: '', budget: '', showroom: '', preferredTime: '' },
}

function fakeClient(ctx: { error?: { message: string } } = {}) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args])
    if (fn === 'lead_ai_claim') return { data: ['c1'], error: null }
    if (fn === 'lead_ai_context') return ctx.error ? { data: null, error: ctx.error } : { data: context, error: null }
    return { data: 1, error: null }
  })
  return { client: { rpc } as never, calls }
}

beforeEach(() => {
  askModel.mockReset()
  sendLeadOutbox.mockClear()
})

describe('answerLeads', () => {
  it('keeps the model’s reply and sends it', async () => {
    askModel.mockResolvedValue({ ok: true, model: 'm', text: JSON.stringify({ reply: 'RM 2,990.', usedCardIds: [], handoff: false, note: '' }) })
    const { client, calls } = fakeClient()
    expect(await answerLeads(client, ['c1'], 'tok')).toBe(1)
    expect(calls.find(c => c[0] === 'lead_ai_answered')?.[1]).toEqual({ p_contact: 'c1', p_body: 'RM 2,990.', p_name: 'Aina', p_handoff: false, p_note: '', p_max: null })
    expect(sendLeadOutbox).toHaveBeenCalledWith(client, ['c1'], 'tok')
  })

  it('passes the model’s hand-over on', async () => {
    askModel.mockResolvedValue({ ok: true, model: 'm', text: JSON.stringify({ reply: 'Thanks! A colleague will call.', usedCardIds: [], handoff: true, note: 'Got the phone' }) })
    const { client, calls } = fakeClient()
    await answerLeads(client, ['c1'], 'tok')
    expect(calls.find(c => c[0] === 'lead_ai_answered')?.[1]).toMatchObject({ p_handoff: true, p_note: 'Got the phone' })
  })

  it('hands the customer to CS when the AI is not connected', async () => {
    askModel.mockResolvedValue({ ok: false, reason: 'not connected' })
    const { client, calls } = fakeClient()
    expect(await answerLeads(client, ['c1'], 'tok')).toBe(0)
    expect(calls.find(c => c[0] === 'lead_ai_stop')?.[1]).toEqual({ p_contact: 'c1', p_why: 'the AI is not connected (no API key)', p_keep: false })
    expect(sendLeadOutbox).not.toHaveBeenCalled()
  })

  it('lets the claim go on a passing failure', async () => {
    askModel.mockResolvedValue({ ok: false, reason: 'The model is busy' })
    const { client, calls } = fakeClient()
    await answerLeads(client, ['c1'], 'tok')
    expect(calls.find(c => c[0] === 'lead_ai_stop')?.[1]).toMatchObject({ p_keep: true })
  })

  it('hands over when the brand’s agent is off', async () => {
    const { client, calls } = fakeClient({ error: { message: 'The AI agent is off for this brand — switch it on in AI Agent.' } })
    await answerLeads(client, ['c1'], 'tok')
    expect(askModel).not.toHaveBeenCalled()
    expect(calls.find(c => c[0] === 'lead_ai_stop')?.[1]).toMatchObject({ p_why: 'the AI Agent is not set up for this brand', p_keep: false })
  })
})

describe('lastingFailure', () => {
  it('names only failures the next message would meet again', () => {
    expect(lastingFailure('not connected')).toBe('the AI is not connected (no API key)')
    expect(lastingFailure('timeout')).toBeNull()
  })
})

describe('systemPrompt alone', () => {
  it('says nobody reads the reply first and when to hand over', () => {
    const alone = systemPrompt(persona, [], '2026-11-02', true)
    expect(alone).toContain('nobody reads it first')
    expect(alone).toContain('when your goal is reached')
    expect(systemPrompt(persona, [], '2026-11-02')).toContain('A person reads every draft')
    expect(systemPrompt(persona, [], '2026-11-02')).not.toContain('when your goal is reached')
  })
})
