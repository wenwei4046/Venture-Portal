import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { billingFromRow, clientBillFromRow, type BillingPage, type ClientBill } from './billing'
import { boardFromRow, type MktBoard } from './board'
import { chatListFromRow, type ChatList } from './chat'
import { adsPageFromRow, type AdsPage } from './ads'
import { draftsFromRow, openDraftFromRow, type DraftRow, type OpenDraft } from './drafts'
import { keyDatesFromRow, type MktKeyDate } from './key-dates'
import { reviewLogFromRow, type ChatReviewLog } from './chat-review'
import { libraryFromRow, taskFilesFromRow, type Library, type TaskFile } from './library'
import { mktNoticesFromRow, type MktNotice } from './shell'
import { minutesTemplatesFromRow, type MinutesTemplate } from './minutes'
import { optionListsFromRow, type OptionLists } from './options'
import { productBookFromRow, type ProductBook } from './products'
import { productPicksFromRow, productProjectFromRow, type ProductPick, type ProductProjectPage } from './project'
import { replaceCountsFromRow, replacePlacesFromRow, type ReplaceCount, type ReplacePlaces } from './replace'
import { lobbyFromRow, petStatsFromRow, spaceFromRow, visitFromRow, type LobbyPet, type PetStats, type Space, type Visit } from './space'
import { subFeedFromRow, type SubFeedEvent } from './subsidiary'
import { minutesPicksFromRow, type MinutesPick } from './task-minutes'
import { taskFromRow, type MktTaskPage } from './task'
import { workflowsFromRow, type WfTemplate } from './workflows'

// Marketing's reads on the page's own session (the DEFINER functions of mig 20261023214100 ask Marketing · View
// themselves). A refusal throws — the page's error boundary answers it.

const client = async () => (await createClient()) as unknown as SupabaseClient

/** The board: open projects and those of the last 60 days — and, given a window, those with a stage due in it. */
export async function readBoard(range?: { from: string; to: string }): Promise<MktBoard> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_board', range ? { p_from: range.from, p_to: range.to } : {})
  if (error) throw new Error(error.message)
  return boardFromRow(data)
}

/** The viewer's own Marketing notices, newest first. */
export async function readNotices(limit = 30): Promise<MktNotice[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_notices', { p_limit: limit })
  if (error) throw new Error(error.message)
  return mktNoticesFromRow(data)
}

/** The Workflow Builder's templates with their drafts (mig 20261023235500) — Marketing · Manage. */
export async function readWorkflows(): Promise<WfTemplate[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_workflows')
  if (error) throw new Error(error.message)
  return workflowsFromRow(data)
}

/** The Minutes Builder's templates with their drafts (mig 20261023235800) — Marketing · Manage. */
export async function readMinutesTemplates(): Promise<MinutesTemplate[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_minutes_templates')
  if (error) throw new Error(error.message)
  return minutesTemplatesFromRow(data)
}

/** Replace Person (④-5, mig 20261025036000) — Marketing · Manage: everybody who stands somewhere, and in how many places. */
export async function readReplaceCounts(): Promise<ReplaceCount[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_replace_people')
  if (error) throw new Error(error.message)
  return replaceCountsFromRow(data)
}

/** …one person's places, or null — nobody by that id. */
export async function readReplacePlaces(staff: string): Promise<ReplacePlaces | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_replace_places', { p_staff: staff })
  if (error) throw new Error(error.message)
  return replacePlacesFromRow(data)
}

/** The Product Builder's products, prices and versions, and the templates its pickers offer (mig 20261023235900) —
 * Marketing · Manage. */
export async function readProducts(): Promise<ProductBook> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_products')
  if (error) throw new Error(error.message)
  return productBookFromRow(data)
}

/** New Project's products on sale, each at its version in effect (mig 20261024002000) — Marketing · Manage. */
export async function readProductPicks(): Promise<ProductPick[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_picker')
  if (error) throw new Error(error.message)
  return productPicksFromRow(data)
}

/** New Project's meeting minutes (②a-3, mig 20261025221000): the templates published, each at its last version —
 * Marketing · Create. */
export async function readMinutesPicks(): Promise<MinutesPick[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_minutes_picker')
  if (error) throw new Error(error.message)
  return minutesPicksFromRow(data)
}

/** The viewer's New Project drafts, newest first, without their forms (mig 20261025211000) — Marketing · Create. */
export async function readNewDrafts(): Promise<DraftRow[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_new_drafts')
  if (error) throw new Error(error.message)
  return draftsFromRow(data)
}

/** One of the viewer's New Project drafts with its form (?draft=); null when it is not theirs, or not there. */
export async function readNewDraft(id: string): Promise<OpenDraft | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const db = await client()
  const { data, error } = await db.rpc('mkt_new_draft', { p_id: id })
  if (error) throw new Error(error.message)
  return openDraftFromRow(data)
}

/** A product project's page — its product, its minutes, its trail (mig 20261024002000); null when none. */
export async function readProductProject(key: string): Promise<ProductProjectPage | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_project', { p_key: key })
  if (error) throw new Error(error.message)
  return productProjectFromRow(data)
}

/** The month's billing (②b-2b, mig 20261025121000) — the manager's: its lines, their clients, the months still open. */
export async function readBilling(month: string | null): Promise<BillingPage | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_billing', month ? { p_month: month } : {})
  if (error) throw new Error(error.message)
  return billingFromRow(data)
}

/** An outside client's billing details, for its page's Edit — the manager's; null for a group company. */
export async function readClientBill(sub: string): Promise<ClientBill | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_client_bill', { p_sub: sub })
  if (error) throw new Error(error.message)
  return clientBillFromRow(data)
}

/** A subsidiary's ⚡ Recent activity: the newest lines of its projects' trails (mig 20261024005000). */
export async function readSubFeed(sub: string, limit = 20): Promise<SubFeedEvent[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_sub_feed', { p_sub: sub, p_limit: limit })
  if (error) throw new Error(error.message)
  return subFeedFromRow(data)
}

/** A project's Ads report — its setup, its reports, whether the PIC has a link (mig 20261025235800) — Marketing · View. */
export async function readAdsPage(project: string): Promise<AdsPage> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_ads_page', { p_project: project })
  if (error) throw new Error(error.message)
  return adsPageFromRow(data)
}

/** A subsidiary's own key dates, by day (mig 20261025235500) — Marketing · View. */
export async function readSubKeyDates(sub: string): Promise<MktKeyDate[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_key_dates', { p_sub: sub })
  if (error) throw new Error(error.message)
  return keyDatesFromRow(data)
}

/** The Library — its folder types, folders, files and the Dustbin's last 30 days (mig 20261024007000). */
export async function readLibrary(): Promise<Library> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_library')
  if (error) throw new Error(error.message)
  return libraryFromRow(data)
}

/** A task's files from the Library (⑥-4), newest first. */
/** The shared option lists by their names (③d-2, mig 20261025191000) — a choice that names one offers its options. */
export async function readOptionLists(): Promise<OptionLists> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_option_lists')
  if (error) throw new Error(error.message)
  return optionListsFromRow(data)
}

export async function readTaskFiles(project: string): Promise<TaskFile[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_task_library', { p_project: project })
  if (error) throw new Error(error.message)
  return taskFilesFromRow(data)
}

/** The viewer's own space (⑦-1, mig 20261024007500) — the design's default before the first save. */
export async function readSpace(): Promise<Space> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_space')
  if (error) throw new Error(error.message)
  return spaceFromRow(data)
}

/** The viewer's pet in numbers — its XP, energy, snacks, today's workouts and this quarter's trophies (⑦-5, mig
 * 20261025037000); null off Marketing's roster. */
export async function readPet(): Promise<PetStats | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_pet')
  if (error) throw new Error(error.message)
  return petStatsFromRow(data)
}

/** The viewer's chats (⑦-3, mig 20261025039000): the lobby's last message, each teammate's last with them, unread. */
export async function readChatList(): Promise<ChatList> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_chat_list')
  if (error) throw new Error(error.message)
  return chatListFromRow(data)
}

/** Chat review (⑦-3b, mig 20261025039500): the people whose chat may be opened and every record — a full-access title's
 * own login only. Null for anybody else (the page is not theirs). */
export async function readChatReviewLog(): Promise<ChatReviewLog | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_chat_review_log')
  if (error?.code === '42501') return null
  if (error) throw new Error(error.message)
  return reviewLogFromRow(data)
}

/** The lobby (⑦-4, mig 20261025038000): the pets of Marketing's roster — those with a login and their pet set up. */
export async function readLobby(): Promise<LobbyPet[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_lobby')
  if (error) throw new Error(error.message)
  return lobbyFromRow(data)
}

/** A teammate's space for a visit (⑦-4): null for anybody off the roster or without a login. */
export async function readVisit(staff: string): Promise<Visit | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_space_of', { p_staff: staff })
  if (error) throw new Error(error.message)
  return visitFromRow(data)
}

/** One project by its id or Track ID — its stages' work, its trail, its series (mig 20261023234000); null when none. */
export async function readTask(key: string): Promise<MktTaskPage | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_project', { p_key: key })
  if (error) throw new Error(error.message)
  return taskFromRow(data)
}
