"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The CRM chat button's figure on Today (2026-10-14 — the "Revenue app refresh" handoff §2; the user: the customers'
 * messages not read yet, the CRM's own Inbox figure): one's own chats' unread — given to them or shared with them, less
 * what they hid — added up by the database under the member's own session (`crm_my_unread`, mig 20261014120000). The
 * CRM is the signed-in ACCOUNT's own whatever view the portal was left in, so the cell is the account's, as
 * crm-actions.ts asks it; the database gives nobody without CRM · View a chat of their own anyway.
 * Whoever sees everybody's CRM (CRM · View at All — the Principal, the Revenue Director, who open on the Team side) gets
 * the Team inbox's figure instead (the owner, 2026-10-15: "在 revenue app 上方的 crm 接入口，有 notification 要顯示在這裡"):
 * the unread of every chat their session may read — crm_contacts' own row policy decides which; only the rows with any.
 */
export async function fetchMemberCrmUnread(): Promise<Outcome<number>> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    const account = await getAccountUser();
    if (!account?.is_active || !canDo(account, "crm", "view", "own")) throw new Error("The CRM is not part of your title's permissions.");
    const db = (await createClient()) as unknown as SupabaseClient;
    if (canDo(account, "crm", "view", "all")) {
      const { data, error } = await db.from("crm_contacts").select("unread").gt("unread", 0).limit(1000);
      if (error) throw new Error(error.message);
      return { ok: true, data: (data ?? []).reduce((n, r) => n + Math.max(0, Math.trunc(Number((r as { unread: number }).unread) || 0)), 0) };
    }
    const { data, error } = await db.rpc("crm_my_unread");
    if (error) throw new Error(error.message);
    return { ok: true, data: Math.max(0, Math.trunc(Number(data) || 0)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 250) : "The CRM could not be read." };
  }
}
