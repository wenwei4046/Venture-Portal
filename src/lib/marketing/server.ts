import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { boardFromRow, type MktBoard } from './board'
import { libraryFromRow, type Library } from './library'
import { mktNoticesFromRow, type MktNotice } from './shell'
import { minutesTemplatesFromRow, type MinutesTemplate } from './minutes'
import { productBookFromRow, type ProductBook } from './products'
import { productPicksFromRow, productProjectFromRow, type ProductPick, type ProductProjectPage } from './project'
import { subFeedFromRow, type SubFeedEvent } from './subsidiary'
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

/** A product project's page — its product, its minutes, its trail (mig 20261024002000); null when none. */
export async function readProductProject(key: string): Promise<ProductProjectPage | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_project', { p_key: key })
  if (error) throw new Error(error.message)
  return productProjectFromRow(data)
}

/** A subsidiary's ⚡ Recent activity: the newest lines of its projects' trails (mig 20261024005000). */
export async function readSubFeed(sub: string, limit = 20): Promise<SubFeedEvent[]> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_sub_feed', { p_sub: sub, p_limit: limit })
  if (error) throw new Error(error.message)
  return subFeedFromRow(data)
}

/** The Library — its folder types, folders, files and the Dustbin's last 30 days (mig 20261024007000). */
export async function readLibrary(): Promise<Library> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_library')
  if (error) throw new Error(error.message)
  return libraryFromRow(data)
}

/** One project by its id or Track ID — its stages' work, its trail, its series (mig 20261023234000); null when none. */
export async function readTask(key: string): Promise<MktTaskPage | null> {
  const db = await client()
  const { data, error } = await db.rpc('mkt_project', { p_key: key })
  if (error) throw new Error(error.message)
  return taskFromRow(data)
}
