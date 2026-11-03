// Lead View › Automations (2026-10-16 — the user: "我更希望的是客服可以创建属于自己的 workplace，可以分为 general、
// 广告 etc；这个树状图不容易理解", pointing at Meta's "create automation"; the design canvas's "自動化" row).
//
// A template is a short form; `compile` turns the form into the steps the database runs (lead_flow_on_message,
// mig 20261016320000), with the trigger it starts on. `custom` keeps the step editor for whoever wants it.

import type { FlowStep, FlowTrigger } from './flow'

export type TemplateId = 'faq' | 'welcome' | 'away' | 'keyword' | 'ad' | 'custom'
export type GoalId = 'greet' | 'info' | 'ads' | 'manage'
export type SaveAs = 'interest' | 'budget' | 'showroom' | 'preferredTime'

export interface FaqConfig { intro: string; items: Array<{ q: string; a: string }>; handoffButton: boolean; repeat: boolean }
export interface WelcomeConfig { message: string; buttons: Array<{ label: string; reply: string }> }
export interface Day { day: number; from: string; to: string; off: boolean }
export interface AwayConfig { hours: Day[]; message: string; askPhone: boolean; after: string }
export interface KeywordConfig { keywords: string[]; reply: string; askPhone: boolean; phoneAsk: string; after: string }
export interface AdConfig { ad: string; intro: string; questions: Array<{ text: string; options: string[]; saveAs: SaveAs | null }>; phoneAsk: string; after: string }

export type TemplateConfig =
  | ({ template: 'faq' } & FaqConfig)
  | ({ template: 'welcome' } & WelcomeConfig)
  | ({ template: 'away' } & AwayConfig)
  | ({ template: 'keyword' } & KeywordConfig)
  | ({ template: 'ad' } & AdConfig)
  | { template: 'custom' }

export interface TemplateCard {
  /** A gallery card: a template, or a preset of one (Location and Hours are keyword replies). */
  key: string
  template: TemplateId
  goal: GoalId
  en: string
  zh: string
  descEn: string
  descZh: string
  glyph: string
  tone: 'blue' | 'plum' | 'clay' | 'olive' | 'rose' | 'ink'
  soon?: boolean
}

export const GOALS: ReadonlyArray<{ id: GoalId; en: string; zh: string }> = [
  { id: 'greet', en: 'Greet customers', zh: '问候客户' },
  { id: 'info', en: 'Share information', zh: '分享信息' },
  { id: 'ads', en: 'Ads', zh: '广告' },
  { id: 'manage', en: 'Manage messages', zh: '管理消息' },
]

export const TEMPLATE_CARDS: readonly TemplateCard[] = [
  { key: 'welcome', template: 'welcome', goal: 'greet', en: 'Welcome message', zh: '欢迎消息', descEn: 'Greet someone the first time they message you, with optional buttons.', descZh: '客户第一次发消息时自动问候，可附上按钮。', glyph: 'Hi', tone: 'blue' },
  { key: 'away', template: 'away', goal: 'greet', en: 'Away message', zh: '离开消息', descEn: 'Reply for you outside opening hours, and ask for a phone number.', descZh: '下班或休息时间自动回复，并请客户留电话。', glyph: '☾', tone: 'plum' },
  { key: 'faq', template: 'faq', goal: 'info', en: 'FAQ', zh: '常见问题', descEn: 'List the questions customers ask; tapping one sends its answer.', descZh: '列出常见问题，客户点问题就收到答案。', glyph: '?', tone: 'clay' },
  { key: 'location', template: 'keyword', goal: 'info', en: 'Location', zh: '位置', descEn: 'Reply with the showroom address when someone asks where you are.', descZh: '客户问地址时，自动回复门市地址和 Waze。', glyph: '⌖', tone: 'olive' },
  { key: 'hours', template: 'keyword', goal: 'info', en: 'Opening hours', zh: '营业时间', descEn: 'Reply with your opening hours when someone asks.', descZh: '客户问几点开门时，自动回复营业时间。', glyph: '◷', tone: 'rose' },
  { key: 'keyword', template: 'keyword', goal: 'info', en: 'Custom keywords', zh: '自定义关键词', descEn: 'Reply when a message contains a word you choose.', descZh: '消息里有指定的字，就回复指定内容。', glyph: '#', tone: 'olive' },
  { key: 'ad', template: 'ad', goal: 'ads', en: 'Ad Q&A', zh: '广告问答', descEn: 'People from an ad get 2–3 tap-to-answer questions, then are asked for a phone.', descZh: '从广告进来，自动问 2–3 题（按钮），最后请客户留电话。', glyph: 'Ad', tone: 'ink' },
  { key: 'unanswered', template: 'custom', goal: 'manage', en: 'Unanswered reminder', zh: '未回复提醒', descEn: 'Remind Customer Service when a customer has waited too long.', descZh: '客户等太久没人回复时，提醒客服。', glyph: '!', tone: 'rose', soon: true },
]

const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const dayName = (d: number) => DAYS_EN[d] ?? String(d)

/** A form to start from, per gallery card. */
export function starterConfig(key: string): TemplateConfig {
  switch (key) {
    case 'welcome':
      return { template: 'welcome', message: 'Hi! Thanks for messaging us 🙌 What would you like to know? Tap a button below or just leave a message.', buttons: [{ label: 'Promotions', reply: "This month's promotions: [Promo]" }, { label: 'Showroom', reply: 'We are at [address], open daily 10:00–22:00.' }] }
    case 'away':
      return { template: 'away', hours: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, from: '10:00', to: '22:00', off: false })), message: "Thanks for your message! We're closed right now and will reply first thing at 10:00 🙏 Leave your phone number and we'll call you.", askPhone: true, after: "Got it — we'll call you soon 🙏" }
    case 'faq':
      return { template: 'faq', intro: 'How can we help? Tap a question 👇', items: [{ q: 'Instalments?', a: 'Yes — [instalment plans], details at the showroom.' }, { q: 'Delivery time?', a: 'Usually [7–14] days depending on your area.' }, { q: 'Showroom address?', a: '[address], open daily 10:00–22:00 👉 [Waze link]' }], handoffButton: true, repeat: true }
    case 'location':
      return { template: 'keyword', keywords: ['address', 'location', 'where', '地址', '在哪', '门市'], reply: 'We are at [address] 👉 [Waze link]. Open daily 10:00–22:00.', askPhone: false, phoneAsk: '', after: '' }
    case 'hours':
      return { template: 'keyword', keywords: ['open', 'hours', 'time', '几点', '营业', '开门'], reply: 'We are open daily 10:00–22:00 😊', askPhone: false, phoneAsk: '', after: '' }
    case 'keyword':
      return { template: 'keyword', keywords: ['11.11'], reply: '11.11 sale starts next week: [deal]! Want to book a visit?', askPhone: true, phoneAsk: "Leave your phone number and we'll arrange it 😊", after: "Got it — we'll call you soon 🙏" }
    case 'ad':
      return { template: 'ad', ad: '', intro: 'Hi! Thanks for your interest 🙌', questions: [{ text: 'Which one are you looking for?', options: ['3-seater', 'L-shape', 'Sofa bed'], saveAs: 'interest' }, { text: "What's your budget?", options: ['Below 2,000', '2,000–4,000', 'Above 4,000'], saveAs: 'budget' }], phoneAsk: "Want to see it in person? Leave your phone and we'll book you a time 😊", after: "Got it — we'll call you soon 🙏" }
    default:
      return { template: 'custom' }
  }
}

export interface Compiled {
  steps: FlowStep[]
  triggerKind: FlowTrigger
  triggerValue: string
}

const clip = (s: string, n: number) => Array.from(s.trim()).slice(0, n).join('')

/** The form's steps and trigger. Throws a sentence when the form is not finished. */
export function compile(c: TemplateConfig): Compiled {
  switch (c.template) {
    case 'faq': {
      const items = c.items.filter(i => i.q.trim() && i.a.trim())
      if (items.length === 0) throw new Error('Add at least one question and its answer.')
      if (items.length > (c.handoffButton ? 12 : 13)) throw new Error('Messenger shows 13 buttons at most.')
      const buttons = items.map((it, i) => ({ label: clip(it.q, 20), next: `a${i}` }))
      if (c.handoffButton) buttons.push({ label: 'Talk to us', next: 'h' })
      const steps: FlowStep[] = [{ id: 's1', kind: 'question', text: c.intro.trim() || 'How can we help?', buttons }]
      items.forEach((it, i) => steps.push(c.repeat
        ? { id: `a${i}`, kind: 'question', text: it.a.trim(), buttons }
        : { id: `a${i}`, kind: 'message', text: it.a.trim(), next: null }))
      if (c.handoffButton) steps.push({ id: 'h', kind: 'handoff', text: "Sure — someone from our team will reply shortly 🙏" })
      return { steps, triggerKind: 'first', triggerValue: '' }
    }
    case 'welcome': {
      if (!c.message.trim()) throw new Error('Write the welcome message.')
      const buttons = c.buttons.filter(b => b.label.trim() && b.reply.trim()).slice(0, 3)
      if (buttons.length === 0) return { steps: [{ id: 's1', kind: 'message', text: c.message.trim(), next: null }], triggerKind: 'first', triggerValue: '' }
      return {
        steps: [
          { id: 's1', kind: 'question', text: c.message.trim(), buttons: buttons.map((b, i) => ({ label: clip(b.label, 20), next: `r${i}` })) },
          ...buttons.map((b, i): FlowStep => ({ id: `r${i}`, kind: 'message', text: b.reply.trim(), next: null })),
        ],
        triggerKind: 'first',
        triggerValue: '',
      }
    }
    case 'away': {
      if (!c.message.trim()) throw new Error('Write the away message.')
      const steps: FlowStep[] = c.askPhone
        ? [{ id: 's1', kind: 'phone', text: c.message.trim(), next: 'h' }, { id: 'h', kind: 'handoff', text: c.after.trim() || 'Got it 🙏' }]
        : [{ id: 's1', kind: 'message', text: c.message.trim(), next: null }]
      return { steps, triggerKind: 'away', triggerValue: '' }
    }
    case 'keyword': {
      const words = c.keywords.map(w => w.trim()).filter(Boolean)
      if (words.length === 0) throw new Error('Add at least one keyword.')
      if (!c.reply.trim()) throw new Error('Write the reply.')
      const steps: FlowStep[] = [{ id: 's1', kind: 'message', text: c.reply.trim(), next: c.askPhone ? 'p' : null }]
      if (c.askPhone) {
        steps.push({ id: 'p', kind: 'phone', text: c.phoneAsk.trim() || 'Leave your phone number and we will call you 😊', next: 'h' })
        steps.push({ id: 'h', kind: 'handoff', text: c.after.trim() || 'Got it 🙏' })
      }
      return { steps, triggerKind: 'keyword', triggerValue: words.join(', ').slice(0, 120) }
    }
    case 'ad': {
      if (!c.ad.trim()) throw new Error('Say which ad this is for.')
      const qs = c.questions.filter(q => q.text.trim() && q.options.some(o => o.trim())).slice(0, 3)
      if (qs.length === 0) throw new Error('Ask at least one question with options.')
      const steps: FlowStep[] = qs.map((q, i) => ({
        id: `q${i}`,
        kind: 'question',
        text: i === 0 && c.intro.trim() ? `${c.intro.trim()}\n${q.text.trim()}` : q.text.trim(),
        saveAs: q.saveAs,
        buttons: q.options.map(o => o.trim()).filter(Boolean).slice(0, 13).map(o => ({ label: clip(o, 20), next: i + 1 < qs.length ? `q${i + 1}` : 'p' })),
      }))
      steps.push({ id: 'p', kind: 'phone', text: c.phoneAsk.trim() || 'Leave your phone number and we will call you 😊', next: 'h' })
      steps.push({ id: 'h', kind: 'handoff', text: c.after.trim() || 'Got it 🙏' })
      return { steps, triggerKind: 'ad', triggerValue: c.ad.trim() }
    }
    default:
      throw new Error('A custom automation is edited step by step.')
  }
}

/** Is the office closed at this moment by these hours (Asia/Kuala_Lumpur)? Twin of lead_is_away. */
export function isAway(hours: Day[], at: Date = new Date()): boolean {
  const local = new Date(at.getTime() + 8 * 3600 * 1000)
  const day = local.getUTCDay()
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
  const h = hours.find(x => x.day === day)
  if (!h || h.off || !h.from || !h.to) return true
  return !(time >= h.from && time < h.to)
}
