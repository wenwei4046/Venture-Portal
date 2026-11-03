import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { KnowledgeCard } from './ai'
import type { AgentDocument } from './ai-model'
import { agentCards, agentReads, answersPrompt, readable, settingsOf, settingsPrompt, fileStatus, type AgentMore, type DataFile } from './agent'
import { knowledgeReads, linkDue, type DataFolder } from './data-center'
import type { LeadInfo } from './info'
import { readLink } from './link-read'
import type { QuickReply } from './quick'

type Read<T> = { ok: true; data: T } | { ok: false }

async function read<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Read<T>> {
  const { data, error } = await client.rpc(fn, args)
  return error ? { ok: false } : { ok: true, data: data as T }
}

/**
 * The agent's v2 knowledge for a brand: its settings and answers as a second instruction block, the cards it may cite
 * (General info, fixed answers, files) and the files it reads attached — PDFs, pictures and text, at most six and
 * 24 MB. Read with the client it is handed: a person's session (a draft, Try it) or the webhook's service role (the
 * AI Agent answering by itself, mig 20261102170000). Null before mig 20261023200000 (the draft runs as before).
 */
export async function agentMore(client: SupabaseClient, brandId: string, today: string, override?: Pick<AgentMore, 'settings' | 'answers' | 'playbook' | 'knowledge'>) {
  const [more, info, dataFiles, folders, quick] = await Promise.all([
    read<AgentMore>(client, 'lead_ai_more', { p_brand: brandId }),
    read<LeadInfo>(client, 'lead_info', {}),
    read<DataFile[]>(client, 'lead_data_files', {}),
    read<DataFolder[]>(client, 'lead_data_folders', {}),
    read<QuickReply[]>(client, 'lead_quick_replies', {}),
  ])
  if (!more.ok) return null
  const m = { ...more.data, ...(override ?? {}) }
  const settings = settingsOf(m.settings)
  const all = dataFiles.ok ? dataFiles.data : []
  // What AI Agent › Knowledge picked (mig 20261102140000), on and in date; before it, the brand's folder and Shared.
  const picked = m.knowledge ? knowledgeReads(m.knowledge, all, folders.ok ? folders.data : []) : agentReads(all, brandId)
  const files: DataFile[] = picked.filter(s => !s.paused && fileStatus(s.file, today).usable).map(s => s.file)
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
  // The Data Center's quick replies are CS's own words; the agent may use them as fixed answers (the handoff).
  const quickLines = (quick.ok ? quick.data : []).filter(q => q.brandId === null || q.brandId === brandId).map(q => `- ${q.body}`)
  const system = [
    settingsPrompt(settings),
    answersPrompt(m.answers, m.playbook),
    documents.length ? `# Files you read\nThe documents attached before the conversation are the brand's files; cite one by its card id (file-…).` : '',
    links.length ? `# Web pages the brand keeps (their words as last read)\n${links.join('\n\n')}` : '',
    quickLines.length ? `# Quick replies Customer Service uses (reuse them word for word when they answer the question)\n${quickLines.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  // Knowledge › General info: the cards switched off for this brand's agent.
  const infoFor = info.ok ? { ...info.data, cards: info.data.cards.filter(c => !settings.infoOff.includes(c.id)) } : null
  return {
    settings,
    ask: { system, documents },
    cards: (old: KnowledgeCard[]) => agentCards(old, infoFor, brandId, today, m.answers, files),
  }
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
