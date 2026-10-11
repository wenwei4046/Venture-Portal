"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { pushSoon } from "@/lib/push/outbox";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { SEND_REFUSED, appClosed } from "@/lib/member/app-pages";
import { DAY_END, DAY_START, SLOT, isDay, peopleFromRow, rangeFromRow, type RoomsPeople, type RoomsRange } from "@/lib/rooms/model";

/**
 * The Revenue app's Book a room (2026-10-11, HR revamp round 2 — README 18.4):
 * the meeting rooms' schedule and booking under the member's own session.
 * The database asks Meeting rooms · View or the member's own Revenue app ·
 * View, and from the app a member books for themselves (mig 20261011090000);
 * the portal's actions (lib/rooms/actions.ts) ask Meeting rooms · Create,
 * which a member does not hold. View as is read-only: the app never offers
 * the send, and nothing here books for anybody else. Its own tab (Profile ·
 * Book a room, lib/member/app-pages.ts): View unticked, nothing is read;
 * Create unticked, nothing is booked or cancelled.
 */
export type MemberRooms = { range: RoomsRange; people: RoomsPeople };
type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback);

/** A member of the Revenue app, or the Principal using it, whose ticks leave the page (and, to book, its send) open; anybody else is refused. */
async function memberClient(need: "read" | "send"): Promise<SupabaseClient> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user))
    throw new Error("This account does not have access to this member feature.");
  const closed = appClosed(user.closed);
  if (closed.pages.includes("rooms")) throw new Error("Book a room is not open to your account.");
  if (need === "send" && closed.sends.includes("rooms")) throw new Error(SEND_REFUSED.rooms);
  return (await createClient()) as unknown as SupabaseClient;
}

/** The rooms open for booking, the live bookings from `from` to `to`, and who may be picked. */
export async function fetchMemberRooms(from: string, to: string): Promise<Outcome<MemberRooms>> {
  try {
    if (!isDay(from) || !isDay(to)) return { ok: false, error: "Pick a day." };
    const client = await memberClient("read");
    const [range, people] = await Promise.all([
      client.rpc("meeting_rooms_range", { p_from: from, p_to: to }),
      client.rpc("meeting_rooms_people"),
    ]);
    if (range.error) return { ok: false, error: words(range.error, "The schedule could not be read. Please try again.") };
    if (people.error) return { ok: false, error: words(people.error, "The people list could not be read. Please try again.") };
    const r = rangeFromRow(range.data);
    const p = peopleFromRow(people.data);
    return r && p ? { ok: true, data: { range: r, people: p } } : { ok: false, error: "The schedule could not be read. Please try again." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The schedule could not be read." };
  }
}

export interface MemberBookInput {
  room: string;
  day: string;
  from: number;
  to: number;
  title: string;
  /** A department of the company… */
  department: string | null;
  /** …or one of the Revenue Department's sub-departments ("Revenue · Fair"). */
  subDepartment: string | null;
  internal: string[];
  pax: number;
}

/** Book a room for yourself, from the app (source 'app'). */
export async function bookMemberRoom(input: MemberBookInput): Promise<Outcome<{ id: string; ref: string }>> {
  try {
    if (!isId(input.room)) return { ok: false, error: "Pick a room." };
    if (!isDay(input.day)) return { ok: false, error: "Pick a day." };
    const from = Math.round(Number(input.from));
    const to = Math.round(Number(input.to));
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < DAY_START || to > DAY_END || from % SLOT || to % SLOT)
      return { ok: false, error: "Pick a time between 08:00 and 20:00, in half hours." };
    if (input.department != null && !isId(input.department)) return { ok: false, error: "Pick the department it is booked from." };
    if (input.subDepartment != null && !isId(input.subDepartment)) return { ok: false, error: "Pick the department it is booked from." };
    const client = await memberClient("send");
    const { data, error } = await client.rpc("meeting_rooms_book", {
      p_id: null,
      p_room: input.room,
      p_day: input.day,
      p_from: from,
      p_to: to,
      p_title: String(input.title ?? ""),
      p_department: input.subDepartment ? null : input.department,
      p_booked_by: null,
      p_internal: (Array.isArray(input.internal) ? input.internal : []).filter(isId),
      p_guests: [],
      p_pax: Math.max(0, Math.round(Number(input.pax) || 0)),
      p_source: "app",
      p_sub_department: input.subDepartment,
    });
    if (error) return { ok: false, error: words(error, "The room could not be booked. Please try again.") };
    revalidatePath("/admin/rooms");
    pushSoon();
    const r = (data ?? {}) as { id?: string; ref?: string };
    return { ok: true, data: { id: String(r.id ?? ""), ref: String(r.ref ?? "") } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The room could not be booked." };
  }
}

/** Cancel a meeting you booked. */
export async function cancelMemberBooking(id: string): Promise<Outcome<true>> {
  try {
    if (!isId(id)) return { ok: false, error: "That booking is not there." };
    const client = await memberClient("send");
    const { error } = await client.rpc("meeting_rooms_cancel", { p_id: id });
    if (error) return { ok: false, error: words(error, "The meeting could not be cancelled. Please try again.") };
    revalidatePath("/admin/rooms");
    pushSoon();
    return { ok: true, data: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The meeting could not be cancelled." };
  }
}
