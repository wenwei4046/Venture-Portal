import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { isRatio } from "@/lib/commission/bill-comm-ratio";
import {
  commRatioContextFromRow, commRatioNoteRefusal, commRatioSavedFromRow,
  type CommRatioContext, type CommRatioSaved,
} from "./comm-ratio";
import type { MemberOutcome } from "./server";

/**
 * A bill's commission ratio in the Revenue app (2026-11-27; mig 20261127140500): a Revenue Director reads a bill's sheet
 * and sets its ratio — or takes it off — from its ⋯. The ACCOUNT's Commission ratio cells decide first (as IT requests'
 * desk and Free test's Manage: the account's own, whatever view the app is in), then the database under the caller's
 * own session asks everything else (the sub-departments they reach on Comm Cal, never their own bill, never a Revenue
 * Director's own, a bill that counts, a month not paid, no close that gave it) and tells the salesperson. Refusals are
 * answers in words, never throws — production hands the phone only a digest of what an action throws.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** The functions' own refusals (not yours, shut, out of reach, a bad ratio) are said in words. */
const SAID = new Set(["22023", "42501", "23RUN", "23CLS"]);
const words = (error: { code?: string; message?: string } | null, fallback: string): string =>
  error?.message?.trim() && ((error.code && SAID.has(error.code)) || error.message.startsWith("Read-only"))
    ? error.message.trim().slice(0, 400) : fallback;
const thrown = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

export const COMM_RATIO_REFUSED = "Adjusting a bill's commission is not open to your account.";

/** The account's own Commission ratio cell — View reads the sheet, Edit sets a ratio. */
async function holder(action: "view" | "edit"): Promise<SupabaseClient> {
  const account = await getAccountUser();
  if (!account?.is_active) throw new Error("Sign in with an active work account.");
  const ok = action === "edit"
    ? canDo(account, "comm_ratio", "edit")
    : canDo(account, "comm_ratio", "view") || canDo(account, "comm_ratio", "edit");
  if (!ok) throw new Error(COMM_RATIO_REFUSED);
  return (await createClient()) as unknown as SupabaseClient;
}

/** The sheet of one bill: its margin, what its ladder alone pays, the ratio on it, and why it cannot change now. */
export async function loadCommRatioContext(orderId: string): Promise<MemberOutcome<CommRatioContext>> {
  try {
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    const db = await holder("view");
    const { data, error } = await db.rpc("member_comm_ratio_context", { p_order: orderId });
    if (error) return { ok: false, error: words(error, "The bill could not be read. Please try again.") };
    const read = commRatioContextFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "The bill could not be read. Please try again." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The bill could not be read.") };
  }
}

/** Set a bill's ratio (0–1), or take it off (null): its margin decides again. Every holder of the bill is told. */
export async function saveCommRatio(orderId: string, ratio: number | null, note: string | null): Promise<MemberOutcome<CommRatioSaved>> {
  try {
    if (!isId(orderId)) return { ok: false, error: "That bill is not there." };
    if (ratio !== null && !isRatio(ratio)) return { ok: false, error: "A ratio is 0% to 100% of the commission." };
    const why = typeof note === "string" ? note.trim() : "";
    const refused = commRatioNoteRefusal(why);
    if (refused) return { ok: false, error: refused };
    const db = await holder("edit");
    const { data, error } = await db.rpc("member_comm_ratio_set", {
      p_order: orderId, p_ratio: ratio === null ? null : Math.round(ratio * 10_000) / 10_000, p_note: ratio === null || !why ? null : why,
    });
    if (error) return { ok: false, error: words(error, "The commission could not be changed. Please try again.") };
    const read = commRatioSavedFromRow(data);
    return read ? { ok: true, data: read } : { ok: false, error: "It was saved — pull to refresh to see it." };
  } catch (error) {
    return { ok: false, error: thrown(error, "The commission could not be changed.") };
  }
}
