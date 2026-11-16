"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { appClosed } from "@/lib/member/app-pages";
import {
  adminTestsFromRows, draftFromRow, draftProblem, libraryFromRows, refusal, resultFromRow, safeLink, scoresFromRows, takeFromRow,
  testsFromRows, type AdminTest, type DraftTest, type LibraryCategory, type TestResult, type TestScoreRow, type TestSummary, type TestToTake,
} from "@/lib/rev-training/model";
import type { Outcome } from "@/lib/rev-training/api";

/**
 * The Revenue app's Free test and Library (2026-11-16, mig 20261117010000), under the caller's own session: the
 * database decides who reads (a member of IR today whose Profile box is open, or Free test & Library · View) and who
 * writes (Create / Edit). The app asks the same first — the ACCOUNT's Free test & Library cells, as IT requests' desk —
 * so a closed box says so here. Refusals are answers, never throws (production masks a thrown message).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const thrown = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** A member of the app (or the Principal using it) whose ticks leave the page open. */
async function reader(page: "tests" | "library"): Promise<SupabaseClient> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user))
    throw new Error("This account does not have access to this member feature.");
  if (appClosed(user.closed).pages.includes(page)) throw new Error(`${page === "tests" ? "Free test" : "The Library"} is not open to your account.`);
  return (await createClient()) as unknown as SupabaseClient;
}

/** Whoever writes them: the account's Free test & Library cell. */
async function writer(action: "view" | "create" | "edit"): Promise<SupabaseClient> {
  const account = await getAccountUser();
  if (!account?.is_active) throw new Error("Sign in with an active work account.");
  const ok = action === "view" ? canDo(account, "rev_training", "view")
    : action === "create" ? canDo(account, "rev_training", "create")
    : canDo(account, "rev_training", "edit");
  if (!ok) throw new Error(`Free test & Library · ${action === "view" ? "View" : action === "create" ? "Create" : "Edit"} is not ticked for you.`);
  return (await createClient()) as unknown as SupabaseClient;
}

async function run<T>(get: () => Promise<SupabaseClient>, call: (db: SupabaseClient) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
  read: (data: unknown) => T | null, fallback: string): Promise<Outcome<T>> {
  try {
    const db = await get();
    const { data, error } = await call(db);
    if (error) return { ok: false, error: error.message?.startsWith("Read-only") ? error.message : refusal(error, fallback) };
    const out = read(data);
    return out === null ? { ok: false, error: fallback } : { ok: true, data: out };
  } catch (error) {
    return { ok: false, error: thrown(error, fallback) };
  }
}

const done = () => true as const;

// ── Free test ──────────────────────────────────────────────────────────────────

export async function fetchTests(): Promise<Outcome<TestSummary[]>> {
  return run(() => reader("tests"), db => db.rpc("rev_tests_mine"), testsFromRows, "The tests could not be read. Please try again.");
}

export async function takeTest(id: string): Promise<Outcome<TestToTake>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  return run(() => reader("tests"), db => db.rpc("rev_test_take", { p_id: id }), takeFromRow, "The test could not be opened. Please try again.");
}

export async function submitTest(id: string, answers: Record<string, number[]>): Promise<Outcome<TestResult>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  // Only question ids and whole numbers go to the database — it scores them itself.
  const clean = Object.fromEntries(Object.entries(answers ?? {}).filter(([k]) => isId(k))
    .map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter(n => Number.isInteger(n) && n >= 0 && n < 8).slice(0, 8)]));
  return run(() => reader("tests"), db => db.rpc("rev_test_submit", { p_id: id, p_answers: clean }), resultFromRow,
    "Your answers could not be handed in. Please try again.");
}

export async function fetchAdminTests(): Promise<Outcome<AdminTest[]>> {
  return run(() => writer("view"), db => db.rpc("rev_tests_admin"), adminTestsFromRows, "The tests could not be read. Please try again.");
}

export async function fetchAdminTest(id: string): Promise<Outcome<DraftTest>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  return run(() => writer("view"), db => db.rpc("rev_test_admin", { p_id: id }), draftFromRow, "The test could not be opened. Please try again.");
}

export async function saveTest(test: DraftTest): Promise<Outcome<string>> {
  const problem = draftProblem(test);
  if (problem) return { ok: false, error: problem };
  if (test.id !== undefined && !isId(test.id)) return { ok: false, error: "That test is not there." };
  return run(() => writer(test.id ? "edit" : "create"), db => db.rpc("rev_test_save", { p_test: test }),
    data => (isId(data) ? data : null), "The test could not be saved. Please try again.");
}

export async function publishTest(id: string, on: boolean): Promise<Outcome<true>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  return run(() => writer("edit"), db => db.rpc("rev_test_publish", { p_id: id, p_on: on }), done, "It could not be changed. Please try again.");
}

export async function deleteTest(id: string): Promise<Outcome<true>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  return run(() => writer("edit"), db => db.rpc("rev_test_delete", { p_id: id }), done, "It could not be deleted. Please try again.");
}

export async function fetchTestScores(id: string): Promise<Outcome<TestScoreRow[]>> {
  if (!isId(id)) return { ok: false, error: "That test is not there." };
  return run(() => writer("view"), db => db.rpc("rev_test_results", { p_id: id }), scoresFromRows, "The scores could not be read. Please try again.");
}

// ── Library ────────────────────────────────────────────────────────────────────

export async function fetchLibrary(): Promise<Outcome<LibraryCategory[]>> {
  return run(() => reader("library"), db => db.rpc("rev_library"), libraryFromRows, "The Library could not be read. Please try again.");
}

/** Opened: no longer New. Answers where it is — a file's link (signed at the click by /files), or the link itself. */
export async function openLibraryItem(id: string): Promise<Outcome<{ href: string; kind: "file" | "link" }>> {
  if (!isId(id)) return { ok: false, error: "That is not in the Library." };
  return run(() => reader("library"), db => db.rpc("rev_library_open", { p_id: id }), data => {
    const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    if (o.kind === "link") {
      const href = safeLink(typeof o.url === "string" ? o.url : null);
      return href ? { href, kind: "link" as const } : null;
    }
    return typeof o.path === "string" && o.path ? { href: `/files/rev-library/${o.path.split("/").map(encodeURIComponent).join("/")}`, kind: "file" as const } : null;
  }, "It could not be opened. Please try again.");
}

export async function saveLibraryCategory(id: string | null, name: string): Promise<Outcome<string>> {
  if (id !== null && !isId(id)) return { ok: false, error: "That category is not there." };
  return run(() => writer(id ? "edit" : "create"), db => db.rpc("rev_lib_category_save", { p_id: id, p_name: String(name ?? "").slice(0, 80) }),
    data => (isId(data) ? data : null), "The category could not be saved. Please try again.");
}

export async function deleteLibraryCategory(id: string): Promise<Outcome<true>> {
  if (!isId(id)) return { ok: false, error: "That category is not there." };
  return run(() => writer("edit"), db => db.rpc("rev_lib_category_delete", { p_id: id }), done, "It could not be deleted. Please try again.");
}

/** Add a file the browser just put in the bucket, or a link. */
export async function addLibraryItem(input: { categoryId: string; title: string; kind: "file" | "link"; path?: string; url?: string; note?: string }): Promise<Outcome<string>> {
  if (!isId(input?.categoryId)) return { ok: false, error: "Pick a category." };
  return run(() => writer("create"), db => db.rpc("rev_lib_item_add", {
    p_category: input.categoryId, p_title: String(input.title ?? "").slice(0, 220), p_kind: input.kind === "link" ? "link" : "file",
    p_path: input.kind === "file" ? String(input.path ?? "").slice(0, 400) : null, p_url: input.kind === "link" ? String(input.url ?? "").slice(0, 1000) : null,
    p_note: String(input.note ?? "").slice(0, 500),
  }), data => (isId(data) ? data : null), "It could not be added. Please try again.");
}

export async function editLibraryItem(input: { id: string; categoryId: string; title: string; url?: string; note?: string }): Promise<Outcome<true>> {
  if (!isId(input?.id) || !isId(input.categoryId)) return { ok: false, error: "That is not in the Library." };
  return run(() => writer("edit"), db => db.rpc("rev_lib_item_edit", {
    p_id: input.id, p_category: input.categoryId, p_title: String(input.title ?? "").slice(0, 220), p_url: String(input.url ?? "").slice(0, 1000),
    p_note: String(input.note ?? "").slice(0, 500),
  }), done, "It could not be saved. Please try again.");
}

export async function deleteLibraryItem(id: string): Promise<Outcome<true>> {
  if (!isId(id)) return { ok: false, error: "That is not in the Library." };
  return run(() => writer("edit"), db => db.rpc("rev_lib_item_delete", { p_id: id }), done, "It could not be deleted. Please try again.");
}
