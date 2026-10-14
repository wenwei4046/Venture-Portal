"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { noticesFromRow, type Notices } from "@/lib/push/notices";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The bell's notifications, read again (2026-10-14 — the owner: the bell "on live as well"): the signed-in account's
 * own, as the app's layout reads them with the open (`notifications_mine`, mig 20261011180000, a sign-in and the caller's
 * own rows only). The Principal, who opens the app to view members, gets none here, as there. A refusal is an error,
 * never an empty bell: what the bell shows stays.
 */
export async function fetchMemberNotices(): Promise<Outcome<Notices>> {
  try {
    const user = await getMemberUser();
    if (!user?.is_active) throw new Error("Sign in with an active work account.");
    if (isPrincipalAccount(user)) return { ok: true, data: { unread: 0, items: [] } };
    const db = (await createClient()) as unknown as SupabaseClient;
    const { data, error } = await db.rpc("notifications_mine", { p_limit: 50 });
    if (error) throw new Error(error.message);
    return { ok: true, data: noticesFromRow(data) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 250) : "The notifications could not be read." };
  }
}
