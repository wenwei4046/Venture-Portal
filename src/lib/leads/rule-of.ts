/**
 * Which reply rule a conversation follows, and who answers it now (2026-11-02 — the user: "是否能显示目前这个对话是用
 * 什么回复规则呢？是根据reply rules"). `lead_rule_of` (mig 20261102240000) says what the rules decide; the card says
 * whether the AI Agent or a template has the chat right now. The chat header's Rule chip draws both.
 */

export interface RuleOf {
  /** 'ad' — the ad's own rule; 'page' — the brand and channel's row; null — no rule. */
  source: 'ad' | 'page' | null
  /** The window the rule is for: 'any', 'open' (working hours) or 'closed' (after hours). */
  when: 'any' | 'open' | 'closed' | null
  /** Working hours now. */
  open: boolean
  /** 'cs', 'ai' or a template's id; null with no rule. */
  reply: string | null
  templateName: string | null
  adId: string | null
  adName: string | null
  headline: string
  brand: string | null
  channel: string
}

/** What the rule does, in a word or two: the chip's label. */
export function ruleReply(r: Pick<RuleOf, 'reply' | 'templateName'>): string {
  if (!r.reply) return 'No rule'
  if (r.reply === 'cs') return 'Customer Service'
  if (r.reply === 'ai') return 'AI Agent'
  return r.templateName ? `Template · ${r.templateName}` : 'A template that is gone'
}

const WHEN: Readonly<Record<string, string>> = { any: 'any time', open: 'working hours', closed: 'after hours' }
const CHANNEL: Readonly<Record<string, string>> = { messenger: 'Messenger', instagram: 'Instagram' }

/** Where the rule comes from: this ad's rule, or the brand and channel's row on Reply rules. */
export function ruleSource(r: RuleOf): string {
  if (r.source === 'ad') return `This ad’s rule — ${r.adName || r.headline || `Ad ${r.adId}`} · ${WHEN[r.when ?? 'any']}`
  if (r.source === 'page') return `${r.brand ?? 'The brand'} · ${CHANNEL[r.channel] ?? r.channel} row (no rule for ${r.adId ? 'this ad' : 'organic chats'}) · ${WHEN[r.when ?? 'open']}`
  return 'No rule on Reply rules for this chat — Customer Service answers'
}

/** Who has the chat right now, which can differ from the rule (the AI handed it over, a template waits …). */
export function answeringNow(c: { aiOn?: boolean; flowState?: string | null; flowName?: string | null }): string {
  if (c.aiOn) return 'The AI Agent answers this chat now'
  if (c.flowState === 'running') return `Template · ${c.flowName?.trim() || 'Automation'} is waiting on the customer`
  return 'Customer Service answers this chat now'
}
