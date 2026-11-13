'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { catalogItemFromRow, columnFromRow, type CatalogItem, type ItemColumn } from './catalog'
import { productBookFromRow, type ProductBook, type ProductStatus } from './products'
import { quoteBookFromRow, quoteFromRow, type Quote, type QuoteBook } from './quotes'

/**
 * The Product Builder's three tabs (mig 20261113100000, docs/design_handoff_product_builder/): the Product List,
 * quotations — saved as typed, sent as versions, accepted, their work assigned as quick tasks, duplicated — and a
 * product duplicated or its status changed from the list's right-click menu. Marketing · Manage, as every price is; the
 * database asks it again. A refusal answers `{ ok: false, reason }` in words (production masks a thrown message).
 */
export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)
const PAGE = '/marketing/products'

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}
async function freshQuotes(db: SupabaseClient): Promise<QuoteBook | null> {
  const { data, error } = await db.rpc('mkt_quote_book')
  return error ? null : quoteBookFromRow(data)
}
async function freshProducts(db: SupabaseClient): Promise<ProductBook | null> {
  const { data, error } = await db.rpc('mkt_products')
  return error ? null : productBookFromRow(data)
}

/** A Product List item made (`id` null, its catalogue given) or changed — only the keys sent. A new name renames it in
 * every product and quotation, so both books come back then. */
export async function saveMktItem(id: string | null, patch: Record<string, unknown>): Promise<Done<{ item: CatalogItem; book: QuoteBook | null; products: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That item is not on the Product List any more.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_item_save', { p_id: id, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The item could not be saved. Please try again.') }
  revalidatePath(PAGE)
  const renamed = id !== null && 'name' in patch
  return { ok: true, item: catalogItemFromRow(data), book: renamed ? await freshQuotes(db) : null, products: renamed ? await freshProducts(db) : null }
}

/** One of the manager's own Product List columns made (`id` null) or changed — its name, what it holds, its options,
 * where its values follow the item. A kind changed or an option taken off clears the values that no longer fit, so the
 * Product List comes back too. */
export async function saveMktItemColumn(id: string | null, patch: Record<string, unknown>): Promise<Done<{ column: ItemColumn; book: QuoteBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That column is not there any more.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_item_column_save', { p_id: id, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The column could not be saved. Please try again.') }
  revalidatePath('/marketing/products')
  return { ok: true, column: columnFromRow(data), book: 'kind' in patch || 'options' in patch ? await freshQuotes(db) : null }
}

/** A column taken off the Product List, its values with it. */
export async function deleteMktItemColumn(id: string): Promise<Done> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: true }
  const { error } = await (await client()).rpc('mkt_item_column_delete', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The column could not be removed. Please try again.') }
  revalidatePath('/marketing/products')
  return { ok: true }
}

/** The columns in the order given — every one of them. */
export async function orderMktItemColumns(ids: string[]): Promise<Done> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!Array.isArray(ids) || ids.some(x => !isId(x))) return { ok: false, reason: 'Reload the Product List and try again.' }
  const { error } = await (await client()).rpc('mkt_item_columns_order', { p_ids: ids })
  if (error) return { ok: false, reason: words(error, 'The columns could not be moved. Please try again.') }
  revalidatePath('/marketing/products')
  return { ok: true }
}

/** An item nothing uses, deleted — refused while a product or a quotation holds it. */
export async function deleteMktItem(id: string): Promise<Done> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: true }
  const { error } = await (await client()).rpc('mkt_item_delete', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The item could not be removed. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true }
}

/** A catalogue renamed for every item in it. */
export async function renameMktCatalogue(from: string, to: string): Promise<Done> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (typeof from !== 'string' || typeof to !== 'string') return { ok: false, reason: 'Name the catalogue.' }
  const { error } = await (await client()).rpc('mkt_catalogue_rename', { p_from: from, p_to: to })
  if (error) return { ok: false, reason: words(error, 'The catalogue could not be renamed. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true }
}

/** A quotation made (`id` null) or what changed of it saved, on the count the page last saw. */
export async function saveMktQuote(id: string | null, rev: number | null, patch: Record<string, unknown>): Promise<Done<{ quote: Quote }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (id !== null && !isId(id)) return { ok: false, reason: 'That quotation is not there any more.' }
  if (id !== null && !Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: 'Nothing to save.' }
  const { data, error } = await (await client()).rpc('mkt_quote_save', { p_id: id, p_rev: id === null ? null : rev, p_patch: patch })
  if (error) return { ok: false, reason: words(error, 'The quotation could not be saved. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true, quote: quoteFromRow(data) }
}

/** Its next version sent (kept whole), or — `accept` — the client's confirmation of the version last sent. */
export async function moveMktQuote(id: string, rev: number, to: 'send' | 'accept'): Promise<Done<{ quote: Quote }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That quotation is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  if (to !== 'send' && to !== 'accept') return { ok: false, reason: 'Send or accept.' }
  const { data, error } = await (await client()).rpc(to === 'send' ? 'mkt_quote_send' : 'mkt_quote_accept', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The quotation could not be changed. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true, quote: quoteFromRow(data) }
}

export interface AssignRow { name: string; from: string; team: string; who: string | null; start: string; due: string; days: number | null; eta: string | null }

/** An accepted quotation's work: a quick task a row, made once. */
export async function assignMktQuote(id: string, rows: AssignRow[]): Promise<Done<{ quote: Quote }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That quotation is not there any more.' }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 300) return { ok: false, reason: 'Nothing to assign.' }
  if (rows.some(r => !isId(r.who))) return { ok: false, reason: 'Pick someone for every task first' }
  const { data, error } = await (await client()).rpc('mkt_quote_assign', { p_id: id, p_rows: rows })
  if (error) return { ok: false, reason: words(error, 'The tasks could not be made. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, quote: quoteFromRow(data) }
}

/** A draft quotation deleted (the user, 2026-11-14: "只有 Draft 能删"), on the count the page last saw. */
export async function deleteMktQuote(id: string, rev: number): Promise<Done> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That quotation is not there any more.' }
  if (!Number.isInteger(rev)) return { ok: false, reason: 'Reload the page and try again.' }
  const { error } = await (await client()).rpc('mkt_quote_delete', { p_id: id, p_rev: rev })
  if (error) return { ok: false, reason: words(error, 'The quotation could not be deleted. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true }
}

/** A new draft from a quotation — its history empty. */
export async function duplicateMktQuote(id: string): Promise<Done<{ quote: Quote }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That quotation is not there any more.' }
  const { data, error } = await (await client()).rpc('mkt_quote_duplicate', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The quotation could not be duplicated. Please try again.') }
  revalidatePath(PAGE)
  return { ok: true, quote: quoteFromRow(data) }
}

/** A product's draft copied as a new draft, "<name> (copy)". */
export async function duplicateMktProduct(id: string): Promise<Done<{ id: string; book: ProductBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  const db = await client()
  const { data, error } = await db.rpc('mkt_product_duplicate', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The product could not be duplicated. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, id: String((data as { id?: string } | null)?.id ?? ''), book: await freshProducts(db) }
}

/** Active · Draft · Retired from the list's right-click menu — Active only for a product published. */
export async function setMktProductStatusTo(id: string, to: ProductStatus): Promise<Done<{ book: ProductBook | null; quotes: QuoteBook | null }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  if (!isId(id)) return { ok: false, reason: 'That product is not there any more.' }
  if (to !== 'active' && to !== 'draft' && to !== 'retired') return { ok: false, reason: 'Active, Draft or Retired.' }
  const db = await client()
  const { error } = await db.rpc('mkt_product_set_status', { p_id: id, p_to: to })
  if (error) return { ok: false, reason: words(error, 'The product could not be changed. Please try again.') }
  revalidatePath('/marketing', 'layout')
  return { ok: true, book: await freshProducts(db), quotes: await freshQuotes(db) }
}

/** Both books again — after a publish, so a new package shows on Quotations. */
export async function readMktQuoteBook(): Promise<Done<{ book: QuoteBook }>> {
  await requireActionOn('/marketing/products', 'marketing', 'manage')
  const book = await freshQuotes(await client())
  return book ? { ok: true, book } : { ok: false, reason: 'Reload the page.' }
}
