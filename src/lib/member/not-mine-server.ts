import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { appClosed } from "./app-pages";
import { principalReadContext } from "./read-access";
import {
  notMineContextFromRow, notMineReasonRefusal, notMineRequestFromRow, notMineRequestsFromRow,
  type NotMineContext, type NotMineRequest,
} from "./not-mine-requests";
import type { MemberOutcome } from "./server";
import type { MemberReadContext } from "./types";

/**
 * Not my order in the Revenue app (2026-11-14; mig 20261114210000): the bill's sheet reads whether it may be sent, the
 * salesperson on it sends one with a reason, and may withdraw it until HR decides on Comm Cal › Requests. Every rule is the
 * database's, under the caller's own session; this checks the shape of what the phone sent, the Principal's View as (read
 * only) and the Requests page's Create box, and answers a refusal in words — production hands the phone only a digest of
 * what an action throws.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** The functions' own refusals (not yours, shut, a reason missing, one open already) are said in words. */
const SAID = new Set(["22023", "42501", "23505"]);
const words = (error: { code?: string; message?: string } | null, fallback: string): string =>
  error?.message?.trim() && ((error.code && SAID.has(error.code)) || error.message.startsWith("Read-only"))
    ? error.message.trim().slice(0, 400) : fallback;
const thrown = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

export const NOT_MINE_SEND_REFUSED = "Sending a request is not open to your account.";
export const NOT_MINE_VIEW_AS_REFUSED = "Read-only while viewing as.";

async function signedIn() {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  return { user, db: (await createClient()) as unknown as SupabaseClient };
}

/** A write is the signed-in salesperson's own: never the Principal's View as of somebody, never a closed Create box. */
async function writer(sends: boolean) {
  const { user, db } = await signedIn();
  if (isPrincipalAccount(user)) throw new Error(NOT_MINE_VIEW_AS_REFUSED);
  if (sends && appClosed(user.closed).sends.includes("requests")) throw new Error(NOT_MINE_SEND_REFUSED);
  return db;
}

/** The sheet of one of the reader's bills: why it cannot be sent now, or the request open on it. */
export async function loadNotMineContext(orderId: string, context?: MemberReadContext): Promise<MemberOutcome<NotMineContext>> {
  try {
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    const { user, db } = await signedIn();
    const principal = principalReadContext(user, context);
    const { data, error } = await db.rpc("member_not_mine_context", { p_order: orderId, p_staff: principal ? context!.staffId : null });
    if (error) return { ok: false, error: words(error, "The bill could not be read. Please try again.") };
    const read = notMineContextFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "The bill could not be read. Please try again." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The bill could not be read.") };
  }
}

/** The reader's Not my order requests — those with HR first, then the last 90 days'. */
export async function loadNotMineRequests(context?: MemberReadContext): Promise<MemberOutcome<NotMineRequest[]>> {
  try {
    const { user, db } = await signedIn();
    const principal = principalReadContext(user, context);
    const { data, error } = await db.rpc("member_not_mine_requests", {
      p_staff: principal ? context!.staffId : null, p_sub_department: principal ? context!.subDepartmentId : null,
    });
    if (error) return { ok: false, error: words(error, "Your requests could not be read. Please try again.") };
    return { ok: true, data: notMineRequestsFromRow(data) };
  } catch (error) {
    return { ok: false, error: thrown(error, "Your requests could not be read.") };
  }
}

/** Send one: the bill is the reader's, the reason says whose it is or why it is not theirs. HR approves or rejects it. */
export async function sendNotMineRequest(orderId: string, reason: string): Promise<MemberOutcome<NotMineRequest>> {
  try {
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    const said = typeof reason === "string" ? reason.trim() : "";
    const refused = notMineReasonRefusal(said);
    if (refused) return { ok: false, error: refused };
    const db = await writer(true);
    const { data, error } = await db.rpc("member_not_mine_send", { p_order: orderId, p_reason: said });
    if (error) return { ok: false, error: words(error, "The request could not be sent. Please try again.") };
    const read = notMineRequestFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "The request was sent — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The request could not be sent.") };
  }
}

/** The salesperson withdraws theirs — any time before HR decides. */
export async function cancelNotMineRequest(id: string): Promise<MemberOutcome<NotMineRequest>> {
  try {
    if (!isId(id)) return { ok: false, error: "That request is not there." };
    const db = await writer(false);
    const { data, error } = await db.rpc("member_not_mine_cancel", { p_request: id });
    if (error) return { ok: false, error: words(error, "The request could not be withdrawn. Please try again.") };
    const read = notMineRequestFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "It was withdrawn — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The request could not be withdrawn.") };
  }
}
