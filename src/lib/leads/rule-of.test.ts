import { describe, expect, it } from 'vitest'
import { answeringNow, ruleReply, ruleSource, type RuleOf } from './rule-of'

const base: RuleOf = { source: null, when: null, open: true, reply: null, templateName: null, adId: '52647010140608', adName: null, headline: 'Sofas', brand: '2990s', channel: 'messenger' }

describe('the chat’s Rule chip (2026-11-02, mig 20261102240000)', () => {
  it('names what the rule does', () => {
    expect(ruleReply(base)).toBe('No rule')
    expect(ruleReply({ reply: 'cs', templateName: null })).toBe('Customer Service')
    expect(ruleReply({ reply: 'ai', templateName: null })).toBe('AI Agent')
    expect(ruleReply({ reply: 'f1', templateName: 'ky testing' })).toBe('Template · ky testing')
  })
  it('says where it comes from', () => {
    expect(ruleSource({ ...base, source: 'ad', when: 'any', reply: 'ai', adName: 'Video Ads-15/10' })).toBe('This ad’s rule — Video Ads-15/10 · any time')
    expect(ruleSource({ ...base, source: 'page', when: 'closed', reply: 'cs' })).toBe('2990s · Messenger row (no rule for this ad) · after hours')
    expect(ruleSource({ ...base, adId: null, source: 'page', when: 'open', reply: 'cs' })).toBe('2990s · Messenger row (no rule for organic chats) · working hours')
    expect(ruleSource(base)).toContain('No rule')
  })
  it('says who answers now', () => {
    expect(answeringNow({ aiOn: true })).toBe('The AI Agent answers this chat now')
    expect(answeringNow({ flowState: 'running', flowName: 'ky testing' })).toBe('Template · ky testing is waiting on the customer')
    expect(answeringNow({ flowState: 'done' })).toBe('Customer Service answers this chat now')
  })
})
