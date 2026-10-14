"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPrincipalAccount } from "@/lib/view-as";
import { appClosed } from "@/lib/member/app-pages";
import { loadMemberDocuments, memberDocumentsFromRow, openMemberDocument, type MemberDocument } from "@/lib/documentation/member";
import { openDocumentationFile } from "@/lib/documentation/actions";
import { openDriveFile } from "@/lib/documentation/drive-actions";
import { loadDocumentsOf, loadMyDocuments, openMyDocument } from "@/lib/documentation/my-docs";
import type { Personal } from "@/lib/documentation/personal";
import type { User } from "@/types";

/**
 * The Revenue app's Documentation (2026-10-11, HR revamp round 2 — README
 * 18.4): the documents HR shares with the member's department, under their own
 * session (`member_documents()`, `member_document_open()` — mig
 * 20261011070000). The Principal viewing a member reads that member's list
 * (`member_documents_of`, Documentation · View — mig 20261011110000) and opens
 * a file the way People › Documentation does, so nothing is marked seen for
 * the member. A file is a short signed link made at the tap, never kept.
 */
type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A member of the Revenue app, or the Principal using it, whose ticks leave Documentation open. */
async function member(): Promise<User> {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user))
    throw new Error("This account does not have access to this member feature.");
  if (appClosed(user.closed).pages.includes("docs")) throw new Error("Documentation is not open to your account.");
  return user;
}

/** The documents shared with the member — or, for the Principal viewing them, with `staffId`. */
export async function fetchMemberDocuments(staffId?: string): Promise<Outcome<MemberDocument[]>> {
  try {
    const user = await member();
    if (staffId !== undefined) {
      if (!isPrincipalAccount(user)) return { ok: false, error: "Only the Principal can view another member's documents." };
      if (!isId(staffId)) return { ok: false, error: "Pick a team member first." };
      const db = (await createClient()) as unknown as SupabaseClient;
      const { data, error } = await db.rpc("member_documents_of", { p_staff: staffId });
      if (error) return { ok: false, error: error.code === "42501" ? error.message : "Documentation could not be read. Please try again." };
      return { ok: true, data: memberDocumentsFromRow(data) };
    }
    const read = await loadMemberDocuments();
    return read.ok ? { ok: true, data: read.documents } : { ok: false, error: read.reason };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Documentation could not be read." };
  }
}

/**
 * Documentation › Personal (2026-10-14 — the user: "documentation 我要分成两种：company / personal"): what HR shares
 * with the member of their own Data center folder, and their letters (`my_documents()` under their own session — mig
 * 20261014190000) — or, for the Principal viewing them, that member's as they see it (`my_documents_of`, Documentation ·
 * View, less what the Principal is not shown). Behind the same Documentation box as Company.
 */
export async function fetchMemberPersonal(staffId?: string): Promise<Outcome<Personal>> {
  try {
    const user = await member();
    if (staffId !== undefined) {
      if (!isPrincipalAccount(user)) return { ok: false, error: "Only the Principal can view another member's documents." };
      if (!isId(staffId)) return { ok: false, error: "Pick a team member first." };
      const read = await loadDocumentsOf(staffId);
      return read.ok ? { ok: true, data: read.data.personal } : { ok: false, error: read.reason };
    }
    const read = await loadMyDocuments();
    return read.ok ? { ok: true, data: read.data.personal } : { ok: false, error: read.reason };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Documentation could not be read." };
  }
}

/**
 * Open one of Personal: the member's own tap marks it seen (a file) or reads its memo (a letter); the Principal's,
 * viewing `staffId`, opens it the way People › Documentation does — a "Viewed" line on its trail, nothing marked.
 */
export async function openMemberPersonal(kind: "drive" | "letter", id: string, staffId?: string): Promise<Outcome<{ url: string; fileName: string }>> {
  try {
    const user = await member();
    if (!isId(id) || (kind !== "drive" && kind !== "letter")) return { ok: false, error: "That is not there." };
    const viewing = staffId !== undefined && isPrincipalAccount(user);
    const link = viewing
      ? kind === "drive" ? await openDriveFile(id, "view") : await openDocumentationFile("letter", id, "view")
      : await openMyDocument(kind, id, "view");
    return link.ok ? { ok: true, data: { url: link.url, fileName: link.fileName } } : { ok: false, error: link.reason };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "It could not be opened." };
  }
}

/** Open one: the member's own tap marks it seen; the Principal's (viewing `staffId`) does not. */
export async function openMemberDoc(id: string, staffId?: string): Promise<Outcome<{ url: string; fileName: string }>> {
  try {
    const user = await member();
    if (!isId(id)) return { ok: false, error: "That document is not there." };
    const viewing = staffId !== undefined && isPrincipalAccount(user);
    // The Principal's open is People › Documentation's own — a "Viewed" line on the trail, nothing marked seen for the member.
    const link = viewing ? await openDocumentationFile("document", id, "view") : await openMemberDocument(id, "view");
    return link.ok ? { ok: true, data: { url: link.url, fileName: link.fileName } } : { ok: false, error: link.reason };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The document could not be opened." };
  }
}
