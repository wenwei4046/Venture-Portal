import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { KnowledgeCard } from './ai'
import type { AgentDocument } from './ai-model'
import { agentCards, agentReads, answersPrompt, readable, settingsOf, settingsPrompt, fileStatus, type AgentMore, type DataFile } from './agent'
import { memoryCards, memoryOf, orderedPrompt, questionNotes, type AgentMemory } from './agent-memory'
import { knowledgeReads, linkDue, type DataFolder } from './data-center'
import { forBrand, isLive, type LeadInfo } from './info'
import { readLink } from './link-read'
import type { LeadOutlet } from './outlets'
import type { QuickReply } from './quick'

type Read<T> = { ok: true; data: T } | { ok: false }

async function read<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Read<T>> {
  const { data, error } = await client.rpc(fn, args)
  return error ? { ok: false } : { ok: true, data: data as T }
}

/** What Try it hands in from the page as it stands (saved or not). */
export type AgentOverride = Pick<AgentMore, 'settings' | 'answers' | 'playbook' | 'knowledge'> & Partial<Pick<AgentMemory, 'memory' | 'fileQs'>>

/** The conversation being answered, when there is one (not Try it). */
export interface AgentChat { contactId?: string; outletId?: string | null }

type Earlier = Array<{ brand: string; channel: string; lastAt: string; messages: Array<{ in: boolean; body: string }> }>

/**
 * The agent's knowledge for a brand: its settings, then every source How it learns lists, in that order (Lead View
 * v3 § 5 — Fixed memory, How to reach the goal and its lines, Fixed answers, This customer, Earlier chats with this
 * customer, the chat's outlet's lines, the Sales playbook, the files and links with their question instructions,
 * General info, Current promotions, Collected memory, and the brand's own sources), a source switched off left out.
 * The cards it may cite (General info, fixed answers, files, and the memory lines so a reply can name them), and the
 * files it reads attached — PDFs, pictures and text, at most six and 24 MB. Read with the client it is handed: a
 * person's session (a draft, Try it) or the webhook's service role (the AI Agent answering by itself). Null before mig
 * 20261023200000 (the draft runs as before).
 */
export async function agentMore(client: SupabaseClient, brandId: string, today: string, override?: AgentOverride, chat?: AgentChat) {
  const [more, info, dataFiles, folders, quick, outlets, earlier] = await Promise.all([
    read<AgentMore & Partial<AgentMemory>>(client, 'lead_ai_more', { p_brand: brandId }),
    read<LeadInfo>(client, 'lead_info', {}),
    read<DataFile[]>(client, 'lead_data_files', {}),
    read<DataFolder[]>(client, 'lead_data_folders', {}),
    read<QuickReply[]>(client, 'lead_quick_replies', {}),
    chat?.outletId ? read<LeadOutlet[]>(client, 'lead_outlets', {}) : Promise.resolve({ ok: false } as Read<LeadOutlet[]>),
    chat?.contactId ? read<Earlier>(client, 'lead_ai_earlier', { p_contact: chat.contactId }) : Promise.resolve({ ok: false } as Read<Earlier>),
  ])
  if (!more.ok) return null
  const m = { ...more.data, ...(override ?? {}) }
  const mem = memoryOf(m)
  const settings = settingsOf(m.settings)
  const on = (k: string) => k === 'fixed' || !settings.learn.off[k]
  const all = dataFiles.ok ? dataFiles.data : []
  const allFolders = folders.ok ? folders.data : []
  // What AI Agent › Knowledge picked (mig 20261102140000) — the whole line above each pick (v3 § 5) — on and in date;
  // before it, the brand's folder and Shared.
  const picked = m.knowledge ? knowledgeReads(m.knowledge, all, allFolders) : agentReads(all, brandId)
  const files: DataFile[] = on('know') ? picked.filter(s => !s.paused && fileStatus(s.file, today).usable).map(s => s.file) : []
  const documents: AgentDocument[] = []
  let total = 0
  for (const f of files) {
    const how = readable(f)
    if (!f.path || !how || how === 'link' || documents.length >= 6 || f.sizeBytes > 10_000_000 || total + f.sizeBytes > 24_000_000) continue
    const { data } = await client.storage.from('lead-data').download(f.path)
    if (!data) continue
    total += f.sizeBytes
    const buf = Buffer.from(await data.arrayBuffer())
    if (how === 'pdf') documents.push({ kind: 'pdf', title: f.name, base64: buf.toString('base64') })
    else if (how === 'text') documents.push({ kind: 'text', title: f.name, text: buf.toString('utf8').slice(0, 200_000) })
    else documents.push({ kind: 'image', title: f.name, base64: buf.toString('base64'), mediaType: (f.mime as 'image/png') || 'image/png' })
  }
  const links = await linkPages(client, files.filter(f => f.kind === 'link'))
  // ASKED ABOUT: a file's own instructions, then those of each folder above it.
  const folderLine = (id: string | null | undefined): string[] => {
    const out: string[] = []
    for (let d = id ? allFolders.find(x => x.id === id) : undefined; d && out.length < 50; d = d.parentId ? allFolders.find(x => x.id === d!.parentId) : undefined) out.push(d.id)
    return out
  }
  const asks = files.map(f => ({ f, notes: questionNotes(mem.fileQs, [f.id, ...folderLine(f.folderId)]) })).filter(x => x.notes.length)
  const knowledge = [
    documents.length ? 'The documents attached before the conversation are the brand’s files; cite one by its card id (file-…).' : '',
    asks.length ? `How to answer questions about these files:\n${asks.map(x => `- ${x.f.name}\n${x.notes.map(n => `  - ${n}`).join('\n')}`).join('\n')}` : '',
    links.length ? `Web pages the brand keeps (their words as last read):\n${links.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n')
  // Current promotions: General info cards of a promotions category, live today, for this brand.
  const promos = info.ok
    ? info.data.cards.filter(c => isLive(c, today) && forBrand(c, brandId) && /promo/i.test(info.data.cats.find(k => k.id === c.catId)?.label ?? ''))
    : []
  const earlierText = earlier.ok && earlier.data.length
    ? earlier.data.map(e => `<earlier brand="${e.brand}" channel="${e.channel}" last="${e.lastAt.slice(0, 10)}">\n${e.messages.map(x => `[${x.in ? 'Customer' : 'Us'}] ${x.body}`).join('\n')}\n</earlier>`).join('\n')
    : ''
  const outletName = outlets.ok ? outlets.data.find(o => o.id === chat?.outletId)?.name : undefined
  // The Data Center's quick replies are CS's own words; the agent may use them as fixed answers (the handoff).
  const quickLines = (quick.ok ? quick.data : []).filter(q => q.brandId === null || q.brandId === brandId).map(q => `- ${q.body}`)
  const system = [
    settingsPrompt(settings),
    orderedPrompt(settings.learn, {
      howGoal: settings.howGoal, memory: mem.memory, outletId: chat?.outletId ?? null, outletName,
      answers: answersPrompt(m.answers, []), playbook: answersPrompt([], m.playbook), knowledge,
      earlier: earlierText, promotions: promos.map(c => `- ${c.name}: ${[...c.fields.filter(x => x.value.trim()).map(x => `${x.label} ${x.value}`), c.note.trim()].filter(Boolean).join('; ')}`).join('\n'),
    }),
    quickLines.length ? `# Quick replies Customer Service uses (reuse them word for word when they answer the question)\n${quickLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  // Knowledge › General info: the cards switched off for this brand's agent; none when General info is not read.
  const infoFor = info.ok && on('gen') ? { ...info.data, cards: info.data.cards.filter(c => !settings.infoOff.includes(c.id)) } : null
  const memCards = memoryCards(mem.memory, chat?.outletId).filter(c => {
    const line = mem.memory.find(x => `mem-${x.id}` === c.id)
    return line && (line.kind === 'fixed' || on(line.kind === 'goal' ? 'how' : line.kind === 'outlet' ? 'outlet' : 'col'))
  }) as KnowledgeCard[]
  return {
    settings,
    ask: { system, documents },
    /** This customer switched off: the conversation is sent without what we know about them. */
    factsOff: !on('cust'),
    cards: (old: KnowledgeCard[]) => [...agentCards(old, infoFor, brandId, today, on('faq') ? m.answers : [], files), ...memCards],
  }
}

/** The memory lines a reply named (`mem-…` in its used cards), for the figures. */
export function usedMemory(used: Array<{ id: string }>): string[] {
  return used.filter(u => u.id.startsWith('mem-')).map(u => u.id.slice(4))
}

/**
 * The agent's web links: each one's words as Check now last kept them, read again (not kept — only the Data Center's
 * Check now keeps) when that reading is older than the link's frequency. Five links, 20,000 characters each at most.
 */
async function linkPages(client: SupabaseClient, links: DataFile[]): Promise<string[]> {
  if (!links.length) return []
  const pick = links.slice(0, 5)
  const kept = await read<Array<{ id: string; content: string; checkedAt: string | null }>>(client, 'lead_link_text', { p_ids: pick.map(l => l.id) })
  const now = Date.now()
  return Promise.all(pick.map(async l => {
    let text = (kept.ok ? kept.data.find(k => k.id === l.id)?.content : '') ?? ''
    if (linkDue(l, now) || !text) {
      const fresh = await readLink(l.url ?? '')
      if ('text' in fresh) text = fresh.text
    }
    return text ? `<page url="${l.url}">\n${text.slice(0, 20_000)}\n</page>` : `- ${l.url} (could not be read)`
  }))
}
