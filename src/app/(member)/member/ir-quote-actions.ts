"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { appClosed, SEND_REFUSED } from "@/lib/member/app-pages";
import type { User } from "@/types";

/**
 * IR Quote (2026-11-05 — `.design/ir-quote/design_handoff_ir_quote`): the quote flow's and Quotation settings' reads
 * and writes, under the caller's own session. The database asks the cells again (mig 20261105120000): quoting =
 * Quote · Create (revenue_app.create), the settings = Product List · Edit. View as reads and sends nothing.
 */
type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };
const words = (e: { message?: string } | null, fallback: string) => (e?.message?.trim() ? e.message.trim() : fallback);
const failed = (e: unknown, fallback: string) => ({ ok: false as const, error: e instanceof Error ? e.message : fallback });

/** May edit the settings: Product List · Edit on the session, else on the account behind a masked Principal. */
async function editsSettings(user: User): Promise<boolean> {
  if (canDo(user, "product_list", "edit")) return true;
  if (user.actualRole !== "principal") return false;
  const account = await getAccountUser();
  return !!account && canDo(account, "product_list", "edit");
}

async function session(need: "read" | "quote" | "settings"): Promise<{ db: SupabaseClient; user: User }> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user)) throw new Error("This account does not have access to the Revenue app.");
  const closed = appClosed(user.closed);
  if (need === "quote") {
    if (closed.sends.includes("quote")) throw new Error(SEND_REFUSED.quote);
    if (!canDo(user, "revenue_app", "create") && !(await editsSettings(user))) throw new Error("Quotes are made by the IR team.");
  }
  if (need === "settings" && !(await editsSettings(user))) throw new Error("Only somebody who may edit the Product List may change the quotation settings.");
  return { db: (await createClient()) as unknown as SupabaseClient, user };
}

export interface IrqCrmField { id: string; label: string; section: string; core?: boolean }
export interface IrqCrmCustomer { id: string; values: Record<string, string> }
export interface IrqBoot {
  quote: boolean;
  edit: boolean;
  live: unknown;
  liveAt: string | null;
  draft: unknown;
  drafts: unknown[];
  boards: unknown[];
  /** The CRM's Customer info form — CRM › Customer form, the active one (its first by sort order). */
  crmFields: IrqCrmField[];
  user: { id: string; name: string };
}

const BUILT_IN_SECTION: Record<string, string> = { name: "Contact", phone: "Contact", type: "Property", size: "Property", loc: "Property", req: "Property", budget: "Property" };

/** The active Customer info form's fields, in its order — what "From CRM" lists. */
async function crmFields(db: SupabaseClient): Promise<IrqCrmField[]> {
  const { data } = await db.from("crm_forms").select("id, sections, sort_order, kind, created_at").order("sort_order").order("created_at").limit(20);
  const form = (data ?? []).find(f => (f as { kind?: string }).kind !== "booking") as { sections?: { title?: string; fields?: { id: string; label: string; sys?: number }[] }[] } | undefined;
  const out: IrqCrmField[] = [];
  for (const sec of form?.sections ?? []) {
    for (const f of sec.fields ?? []) {
      if (!f?.id || f.sys) continue;
      out.push({ id: f.id, label: f.label, section: BUILT_IN_SECTION[f.id] ?? sec.title ?? "", ...(f.id === "name" ? { core: true } : {}) });
    }
  }
  if (!out.length) {
    // No form saved yet: the CRM's built-ins, as its Customer info draws them.
    for (const [id, label] of [["name", "Name"], ["phone", "Phone"], ["type", "Property type"], ["size", "Unit size"], ["loc", "Unit location"], ["req", "Requirement"], ["budget", "Budget"]])
      out.push({ id, label, section: BUILT_IN_SECTION[id], ...(id === "name" ? { core: true } : {}) });
  }
  return out;
}

/** Everything a quote or the settings opens on, in one request. */
export async function loadIrQuote(): Promise<Outcome<IrqBoot>> {
  try {
    const { db, user } = await session("read");
    const [main, drive, fields] = await Promise.all([db.rpc("ir_quote_read"), db.rpc("ir_drive_read"), crmFields(db)]);
    if (main.error) return { ok: false, error: words(main.error, "The quotation settings could not be read.") };
    const m = (main.data ?? {}) as Partial<IrqBoot> & { liveAt?: string | null };
    return {
      ok: true,
      data: {
        quote: !!m.quote, edit: !!m.edit, live: m.live ?? null, liveAt: m.liveAt ?? null, draft: m.draft ?? null,
        drafts: Array.isArray(m.drafts) ? m.drafts : [], boards: drive.error || !Array.isArray(drive.data) ? [] : drive.data,
        crmFields: fields, user: { id: user.id, name: user.name ?? "" },
      },
    };
  } catch (e) {
    return failed(e, "The quotation settings could not be read.");
  }
}

/** The Principal's draft ('draft'), or Publish ('publish'); a null draft throws it away (Cancel). */
export async function saveIrQuoteConfig(kind: "draft" | "publish", config: unknown): Promise<Outcome<string | null>> {
  try {
    if (kind !== "draft" && kind !== "publish") return { ok: false, error: "Unknown save." };
    const { db } = await session("settings");
    const { data, error } = await db.rpc("ir_quote_save_config", { p_kind: kind, p_config: config ?? null });
    if (error) return { ok: false, error: words(error, "The settings could not be saved.") };
    return { ok: true, data: (data as string | null) ?? null };
  } catch (e) {
    return failed(e, "The settings could not be saved.");
  }
}

/** One quote draft of the caller's own; null deletes it. */
export async function saveIrQuoteDraft(id: string, draft: unknown): Promise<Outcome<null>> {
  try {
    if (typeof id !== "string" || !id || id.length > 64) return { ok: false, error: "That draft has no name." };
    const { db } = await session("quote");
    const { error } = await db.rpc("ir_quote_save_draft", { p_id: id, p_draft: draft ?? null });
    return error ? { ok: false, error: words(error, "The draft could not be saved.") } : { ok: true, data: null };
  } catch (e) {
    return failed(e, "The draft could not be saved.");
  }
}

/** One Drive folder of the caller's own; null deletes it. */
export async function saveIrDriveBoard(id: string, board: unknown): Promise<Outcome<null>> {
  try {
    if (typeof id !== "string" || !id || id.length > 128) return { ok: false, error: "That folder has no name." };
    const { db } = await session("quote");
    const { error } = await db.rpc("ir_drive_save_board", { p_id: id, p_board: board ?? null });
    return error ? { ok: false, error: words(error, "The Drive could not be saved.") } : { ok: true, data: null };
  } catch (e) {
    return failed(e, "The Drive could not be saved.");
  }
}

/**
 * The CRM's customers the caller may see (the CRM's own row policies decide), by name or phone — step 1's search.
 * Each comes with the Customer info form's answers: the built-ins from their columns, the rest from `extra`.
 */
export async function searchIrQuoteCustomers(q: string): Promise<Outcome<IrqCrmCustomer[]>> {
  try {
    const term = String(q ?? "").trim();
    if (term.length < 2) return { ok: true, data: [] };
    const { db } = await session("read");
    const digits = term.replace(/\D/g, "").replace(/^(60|0)/, "");
    const like = term.replace(/[%_,()]/g, " ");
    const or = [`name.ilike.%${like}%`, ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : [])].join(",");
    const { data, error } = await db
      .from("crm_contacts")
      .select("id, name, phone, property_type, unit_size, unit_location, requirement, budget, extra")
      .or(or)
      .order("last_customer_at", { ascending: false, nullsFirst: false })
      .limit(8);
    if (error) return { ok: false, error: words(error, "The CRM could not be searched.") };
    type Row = { id: string; name: string | null; phone: string | null; property_type: string | null; unit_size: string | null; unit_location: string | null; requirement: string | null; budget: string | null; extra: Record<string, string> | null };
    return {
      ok: true,
      data: ((data ?? []) as Row[]).map(r => ({
        id: r.id,
        values: {
          ...(r.extra ?? {}),
          name: r.name ?? "", phone: r.phone ?? "", type: r.property_type ?? "", size: r.unit_size ?? "",
          loc: r.unit_location ?? "", req: r.requirement ?? "", budget: r.budget ?? "",
        },
      })),
    };
  } catch (e) {
    return failed(e, "The CRM could not be searched.");
  }
}
