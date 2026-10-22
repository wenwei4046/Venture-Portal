"use server";

// Keep the Revenue app's action boundary while sharing account-scoped support with HR and Finance.
import * as support from "@/lib/it-requests/actions";
import type { ItNoteInput, ItSubmitInput } from "@/lib/it-requests/actions";
export type { ItNoteInput, ItSubmitInput } from "@/lib/it-requests/actions";

export async function fetchMyItRequests() { return support.fetchMyItRequests(); }
export async function fetchItDesk() { return support.fetchItDesk(); }
export async function fetchItRequest(id: string) { return support.fetchItRequest(id); }
export async function submitItRequest(input: ItSubmitInput) { return support.submitItRequest({ ...input, app: "revenue" }); }
export async function noteItRequest(input: ItNoteInput) { return support.noteItRequest(input); }
export async function signItFiles(ids: string[]) { return support.signItFiles(ids); }
export async function openItFile(id: string, mode: "view" | "download") { return support.openItFile(id, mode); }
