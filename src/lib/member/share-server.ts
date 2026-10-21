import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { appClosed } from "./app-pages";
import { principalReadContext } from "./read-access";
import { SHARE_PART, shareContextFromRow, shareRequestFromRow, shareRequestsFromRow, type ShareContext, type ShareRequest, type ShareSendInput } from "./share-requests";
import type { MemberOutcome } from "./server";
import type { MemberReadContext } from "./types";

/**
 * Share order in the Revenue app (2026-10-21; mig 20261021150100): the bill's sheet reads whom it may be shared with, its
 * salesperson sends a request, the colleagues it names answer it, and the salesperson may withdraw it before HR decides
 * on Comm Cal › Requests. Every rule is the database's, under the caller's own session; this checks the shape of what the
 * phone sent, the Principal's View as (read only) and the Requests page's Create box, and answers a refusal in words —
 * production hands the phone only a digest of what an action throws.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** The share functions' own refusals (not yours, closed, a part out of range, one open already) are said in words. */
const SAID = new Set(["22023", "42501", "23505"]);
const words = (error: { code?: string; message?: string } | null, fallback: string): string =>
  error?.message?.trim() && ((error.code && SAID.has(error.code)) || error.message.startsWith("Read-only"))
    ? error.message.trim().slice(0, 400) : fallback;
const thrown = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

export const SHARE_SEND_REFUSED = "Sending a share request is not open to your account.";
export const SHARE_VIEW_AS_REFUSED = "Read-only while viewing as.";

async function signedIn() {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  return { user, db: (await createClient()) as unknown as SupabaseClient };
}

/** A write is the signed-in salesperson's own: never the Principal's View as of somebody, never a closed Create box. */
async function writer(sends: boolean) {
  const { user, db } = await signedIn();
  if (isPrincipalAccount(user)) throw new Error(SHARE_VIEW_AS_REFUSED);
  if (sends && appClosed(user.closed).sends.includes("requests")) throw new Error(SHARE_SEND_REFUSED);
  return db;
}

/** The share sheet of one of the reader's bills: whom it may go to, who holds it, its open request — or why not now. */
export async function loadShareContext(orderId: string, context?: MemberReadContext): Promise<MemberOutcome<ShareContext>> {
  try {
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    const { user, db } = await signedIn();
    const principal = principalReadContext(user, context);
    const { data, error } = await db.rpc("member_share_order_context", { p_order: orderId, p_staff: principal ? context!.staffId : null });
    if (error) return { ok: false, error: words(error, "Who it may be shared with could not be read. Please try again.") };
    const read = shareContextFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "Who it may be shared with could not be read. Please try again." };
  } catch (error) {
    return { ok: false, error: thrown(error, "Who it may be shared with could not be read.") };
  }
}

/** The reader's share requests — sent and received — open first, then the last 90 days'. */
export async function loadShareRequests(context?: MemberReadContext): Promise<MemberOutcome<ShareRequest[]>> {
  try {
    const { user, db } = await signedIn();
    const principal = principalReadContext(user, context);
    const { data, error } = await db.rpc("member_share_requests", {
      p_staff: principal ? context!.staffId : null, p_sub_department: principal ? context!.subDepartmentId : null,
    });
    if (error) return { ok: false, error: words(error, "Your share requests could not be read. Please try again.") };
    return { ok: true, data: shareRequestsFromRow(data) };
  } catch (error) {
    return { ok: false, error: thrown(error, "Your share requests could not be read.") };
  }
}

/**
 * Send a share request: it goes to the colleague named first, and to HR once they accepted. One colleague, half each
 * (2026-10-21 — the user: "only can share one pax … fix with 50% 50%"; the database refuses anything else too).
 */
export async function sendShareRequest(input: ShareSendInput): Promise<MemberOutcome<ShareRequest>> {
  try {
    const orderId = input?.orderId;
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    const raw = Array.isArray(input.parts) ? input.parts : [];
    if (raw.length === 0) return { ok: false, error: "Pick who to share it with." };
    if (raw.length > 1) return { ok: false, error: "Share a bill with one colleague — the two of you hold half each." };
    const staffId = raw[0]?.staffId;
    if (!isId(staffId)) return { ok: false, error: "Pick who to share it with." };
    if (raw[0]?.pct !== SHARE_PART) return { ok: false, error: "A shared bill is half each — 50% for you, 50% for your colleague." };
    const note = typeof input.note === "string" ? input.note.trim() : "";
    if (note.length > 500) return { ok: false, error: "Keep the note to 500 characters." };
    const db = await writer(true);
    const { data, error } = await db.rpc("member_share_order_send", {
      p_order: orderId, p_parts: [{ staffId, pct: SHARE_PART }], p_note: note || null,
    });
    if (error) return { ok: false, error: words(error, "The share request could not be sent. Please try again.") };
    const read = shareRequestFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "The share request was sent — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The share request could not be sent.") };
  }
}

/** A colleague's answer: accept their part, or decline it (which ends the request). */
export async function answerShareRequest(id: string, accept: boolean, note: string | null): Promise<MemberOutcome<ShareRequest>> {
  try {
    if (!isId(id)) return { ok: false, error: "That share request is not there." };
    if (typeof accept !== "boolean") return { ok: false, error: "Accept or decline." };
    const said = typeof note === "string" ? note.trim() : "";
    if (said.length > 500) return { ok: false, error: "Keep the note to 500 characters." };
    // Answering is not sending: a closed Requests box does not stop anybody answering what was sent to them.
    const db = await writer(false);
    const { data, error } = await db.rpc("member_share_order_answer", { p_request: id, p_accept: accept, p_note: said || null });
    if (error) return { ok: false, error: words(error, "Your answer could not be saved. Please try again.") };
    const read = shareRequestFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "Your answer was saved — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "Your answer could not be saved.") };
  }
}

/** The salesperson withdraws their request — any time before HR decides. */
export async function cancelShareRequest(id: string): Promise<MemberOutcome<ShareRequest>> {
  try {
    if (!isId(id)) return { ok: false, error: "That share request is not there." };
    const db = await writer(false);
    const { data, error } = await db.rpc("member_share_order_cancel", { p_request: id });
    if (error) return { ok: false, error: words(error, "The share request could not be withdrawn. Please try again.") };
    const read = shareRequestFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "It was withdrawn — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The share request could not be withdrawn.") };
  }
}
