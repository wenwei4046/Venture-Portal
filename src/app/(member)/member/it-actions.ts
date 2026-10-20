"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { pushSoon } from "@/lib/push/outbox";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { itRequestFromRow, itRequestsFromRow, noteProblem, submitProblem, type ItRequest, type ItStatus, type ItUpload } from "@/lib/it-requests/model";

/**
 * IT support in the Revenue app (2026-10-20 — the user: "i want add on a button to get submit for IT support or help";
 * everybody's on the left "just principal or ulitmate full access"): one's own requests and the desk's, under the
 * caller's own session — the database decides who may (mig 20261021020100). Anybody signed in to the app sends one and
 * follows their own; the desk — the ACCOUNT's IT requests · View, which a Principal's view of the portal never masks,
 * as the CRM's — reads everybody's, and its Edit writes notes and sets statuses. Refusals are answers, never throws
 * (production masks a thrown message).
 */
type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const STATUSES: readonly string[] = ["new", "in_progress", "fixed", "closed"];
/** The database's own refusals are said in words (a missing title, not yours, twenty a day); anything else is not. */
const SAID = new Set(["22023", "42501", "54000"]);
const words = (error: { code?: string; message?: string } | null, fallback: string) =>
  error?.message?.trim() && ((error.code && SAID.has(error.code)) || error.message.startsWith("Read-only")) ? error.message.trim() : fallback;
const thrown = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Somebody signed in to the Revenue app — a member, or the Principal using it. */
async function signedIn(): Promise<SupabaseClient> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user))
    throw new Error("This account does not have access to this member feature.");
  return (await createClient()) as unknown as SupabaseClient;
}

/** Files that went up from the browser, as the database files them — nothing else of what the browser said. */
function uploads(files: unknown): ItUpload[] {
  return (Array.isArray(files) ? files : []).slice(0, 11).flatMap(f => {
    const o = f && typeof f === "object" ? (f as Record<string, unknown>) : null;
    if (!o || typeof o.path !== "string") return [];
    return [{
      path: o.path.slice(0, 400),
      name: typeof o.name === "string" ? o.name.slice(0, 200) : "file",
      contentType: typeof o.contentType === "string" ? o.contentType.slice(0, 120) : "",
      size: typeof o.size === "number" && Number.isFinite(o.size) ? Math.max(0, Math.round(o.size)) : 0,
    }];
  });
}

/** One's own requests, newest first, with their notes and files. */
export async function fetchMyItRequests(): Promise<Outcome<ItRequest[]>> {
  try {
    const db = await signedIn();
    const { data, error } = await db.rpc("my_it_requests");
    if (error) return { ok: false, error: words(error, "Your requests could not be read. Please try again.") };
    return { ok: true, data: itRequestsFromRow(data) };
  } catch (error) {
    return { ok: false, error: thrown(error, "Your requests could not be read.") };
  }
}

/**
 * Everybody's — IT requests · View. Whoever opens the desk is told of new requests and replies from then on (the
 * topic, `it_desk_listen`): asked beside the read, and never a reason for it to fail.
 */
export async function fetchItDesk(): Promise<Outcome<ItRequest[]>> {
  try {
    const db = await signedIn();
    const account = await getAccountUser();
    if (!canDo(account, "it_requests", "view")) return { ok: false, error: "IT requests are not open to your account." };
    const [read] = await Promise.all([db.rpc("it_requests_desk"), db.rpc("it_desk_listen")]);
    if (read.error) return { ok: false, error: words(read.error, "The requests could not be read. Please try again.") };
    return { ok: true, data: itRequestsFromRow(read.data) };
  } catch (error) {
    return { ok: false, error: thrown(error, "The requests could not be read.") };
  }
}

export interface ItSubmitInput {
  category: string;
  title: string;
  details: string;
  files: ItUpload[];
  /** The device it was sent from (`deviceLabel`, read in the browser). */
  device: string;
}

/** Send one: IT-0001 …, the desk told. */
export async function submitItRequest(input: ItSubmitInput): Promise<Outcome<ItRequest>> {
  try {
    const files = uploads(input?.files);
    const category = String(input?.category ?? "");
    const title = String(input?.title ?? "");
    const details = String(input?.details ?? "");
    const problem = submitProblem({ category, title, details, files: files.length });
    if (problem) return { ok: false, error: problem };
    const db = await signedIn();
    const { data, error } = await db.rpc("it_request_submit", {
      p_category: category, p_title: title, p_details: details, p_files: files, p_app: "revenue",
      p_device: String(input?.device ?? "").slice(0, 300),
    });
    if (error) return { ok: false, error: words(error, "Your request could not be sent. Please try again.") };
    // The desk hears of it on their phones at once (mig 20261011180000's outbox).
    pushSoon();
    const sent = itRequestFromRow(data);
    return sent ? { ok: true, data: sent } : { ok: false, error: "It was sent, but could not be read back. Pull down to refresh." };
  } catch (error) {
    return { ok: false, error: thrown(error, "Your request could not be sent.") };
  }
}

export interface ItNoteInput {
  id: string;
  body: string;
  files: ItUpload[];
  /** A status IT sets; null for words alone (a sender never sets one). */
  status: ItStatus | null;
  /** Its status as the screen shows it: the same again moves nothing. */
  current: ItStatus;
}

/** A reply from its sender, or IT's note — and, for IT requests · Edit, its status. Its sender, or the desk, is told. */
export async function noteItRequest(input: ItNoteInput): Promise<Outcome<ItRequest>> {
  try {
    if (!isId(input?.id)) return { ok: false, error: "That request is not there." };
    const status = input.status === null || input.status === undefined ? null : STATUSES.includes(input.status) ? input.status : "bad";
    if (status === "bad") return { ok: false, error: "Pick a status: New, In progress, Fixed or Closed." };
    const current = STATUSES.includes(input.current) ? input.current : "new";
    const files = uploads(input.files);
    const body = String(input.body ?? "");
    const problem = noteProblem({ body, files: files.length, status: status as ItStatus | null, current: current as ItStatus });
    if (problem) return { ok: false, error: problem };
    const db = await signedIn();
    if (status !== null) {
      const account = await getAccountUser();
      if (!canDo(account, "it_requests", "edit")) return { ok: false, error: "Only IT sets a request's status." };
    }
    const { data, error } = await db.rpc("it_request_note", { p_id: input.id, p_body: body, p_files: files, p_status: status });
    if (error) return { ok: false, error: words(error, "It could not be saved. Please try again.") };
    pushSoon();
    const saved = itRequestFromRow(data);
    return saved ? { ok: true, data: saved } : { ok: false, error: "It was saved, but could not be read back. Pull down to refresh." };
  } catch (error) {
    return { ok: false, error: thrown(error, "It could not be saved.") };
  }
}

/** Short links (ten minutes) to some of a request's files — its pictures' previews; each asked of the database first. */
export async function signItFiles(ids: string[]): Promise<Outcome<Record<string, string>>> {
  try {
    const wanted = [...new Set((Array.isArray(ids) ? ids : []).filter(isId))].slice(0, 40);
    if (!wanted.length) return { ok: true, data: {} };
    const db = await signedIn();
    const found = await Promise.all(wanted.map(id => db.rpc("it_request_file", { p_file: id })));
    const paths = found.flatMap((r, i) => {
      const path = !r.error && r.data && typeof (r.data as { path?: unknown }).path === "string" ? (r.data as { path: string }).path : null;
      return path ? [{ id: wanted[i], path }] : [];
    });
    if (!paths.length) return { ok: true, data: {} };
    const { data, error } = await db.storage.from("it-requests").createSignedUrls(paths.map(p => p.path), 600);
    if (error || !data) return { ok: false, error: "The files could not be opened. Please try again." };
    const byPath = new Map(data.flatMap(d => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
    return { ok: true, data: Object.fromEntries(paths.flatMap(p => (byPath.has(p.path) ? [[p.id, byPath.get(p.path)!]] : []))) };
  } catch (error) {
    return { ok: false, error: thrown(error, "The files could not be opened.") };
  }
}

/** One file's short link, made at the tap: to look at, or to keep under its own name. */
export async function openItFile(id: string, mode: "view" | "download"): Promise<Outcome<{ url: string; fileName: string }>> {
  try {
    if (!isId(id)) return { ok: false, error: "That file is not there." };
    const db = await signedIn();
    const { data, error } = await db.rpc("it_request_file", { p_file: id });
    const f = (data ?? {}) as { path?: unknown; name?: unknown };
    if (error || typeof f.path !== "string") return { ok: false, error: words(error, "The file could not be opened. Please try again.") };
    const name = typeof f.name === "string" ? f.name : "file";
    const signed = await db.storage.from("it-requests").createSignedUrl(f.path, 300, mode === "download" ? { download: name } : undefined);
    if (signed.error || !signed.data) return { ok: false, error: "The file could not be opened. Please try again." };
    return { ok: true, data: { url: signed.data.signedUrl, fileName: name } };
  } catch (error) {
    return { ok: false, error: thrown(error, "The file could not be opened.") };
  }
}
