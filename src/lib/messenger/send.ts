/**
 * Messenger through the Graph API: a Page's access token (from the System
 * User token), the customer's name, and a reply — inside Meta's windows:
 *   up to 24 hours after the customer's last message — a normal reply;
 *   24 hours to 7 days — only with the HUMAN_AGENT tag (a person replying,
 *   which is what a salesperson in the CRM is);
 *   after 7 days — nothing (a template on WhatsApp, or the phone).
 * Every token stays on the server.
 */
import { GRAPH_VERSION } from "../whatsapp/send";

export type MessengerWindow = "open" | "human_agent" | "shut";

export function messengerWindow(lastCustomerAt: string | null | undefined, now: Date = new Date()): MessengerWindow {
  const t = lastCustomerAt ? new Date(lastCustomerAt).getTime() : NaN;
  if (!Number.isFinite(t)) return "shut";
  const hours = (now.getTime() - t) / 3_600_000;
  return hours < 24 ? "open" : hours < 24 * 7 ? "human_agent" : "shut";
}

const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;

/** The Page's own access token, asked with the System User token (assigned to both Pages). */
export async function pageToken(pageId: string, systemToken: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^\d{5,32}$/.test(pageId)) return null;
  try {
    const r = await fetchImpl(graph(`${pageId}?fields=access_token`), { headers: { Authorization: `Bearer ${systemToken}` }, cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { access_token?: string } | null;
    return r.ok && j?.access_token ? j.access_token : null;
  } catch {
    return null;
  }
}

/**
 * The customer's name, or null when Meta does not say. The profile API
 * (first_name/last_name) needs Meta's "Business Asset User Profile Access"
 * review, which the app does not have yet — so, failing that, the name is
 * read from the Page's conversation with them (its participants), which the
 * Page token may read (found 2026-10-03, first real Messenger test).
 */
export async function profileName(pageId: string, psid: string, token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^\d{5,32}$/.test(psid) || !/^\d{5,32}$/.test(pageId)) return null;
  const ask = async <T,>(path: string): Promise<T | null> => {
    try {
      const r = await fetchImpl(graph(path), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(3000) });
      return r.ok ? ((await r.json().catch(() => null)) as T | null) : null;
    } catch {
      return null;
    }
  };
  const profile = await ask<{ first_name?: string; last_name?: string }>(`${psid}?fields=first_name,last_name`);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const talk = await ask<{ data?: { participants?: { data?: { id?: string; name?: string }[] } }[] }>(
    `${pageId}/conversations?platform=messenger&user_id=${psid}&fields=participants`);
  return talk?.data?.[0]?.participants?.data?.find(p => p.id === psid)?.name?.trim() || null;
}

/** The Send API request: a normal response inside 24 hours, the HUMAN_AGENT tag after. */
export function messengerRequest(pageId: string, psid: string, body: string, token: string, window: Exclude<MessengerWindow, "shut">) {
  return {
    url: graph(`${encodeURIComponent(pageId)}/messages`),
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        ...(window === "open" ? { messaging_type: "RESPONSE" } : { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }),
        message: { text: body },
      }),
    },
  };
}

export function messengerError(status: number, payload: unknown): string {
  const e = (payload as { error?: { code?: number; error_subcode?: number } } | null)?.error;
  if (e?.code === 10 || e?.error_subcode === 2018278 || e?.error_subcode === 2018065) return "Outside Messenger's reply window for this customer.";
  if (e?.code === 551 || e?.error_subcode === 1545041) return "This person isn't available on Messenger right now.";
  if (e?.code === 190 || status === 401) return "The Messenger connection needs a new access token. Ask your administrator.";
  if (e?.code === 200 || e?.code === 230 || status === 403) return "The Messenger connection is missing a permission (Human Agent may not be approved yet). Ask your administrator.";
  if (e?.code === 613 || status === 429) return "Too many messages too quickly. Wait a moment and send again.";
  return `Messenger refused the message${e?.code ? ` (code ${e.code})` : ""}. Try again, or ask your administrator.`;
}

export async function sendMessengerText(
  opts: { pageId: string; psid: string; body: string; token: string; window: Exclude<MessengerWindow, "shut"> },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; mid: string } | { ok: false; error: string }> {
  const { url, init } = messengerRequest(opts.pageId, opts.psid, opts.body, opts.token, opts.window);
  let response: Response;
  try { response = await fetchImpl(url, init); } catch { return { ok: false, error: "Could not reach Messenger. Check the connection and send again." }; }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: messengerError(response.status, payload) };
  const mid = (payload as { message_id?: string } | null)?.message_id;
  return mid ? { ok: true, mid } : { ok: false, error: "Messenger did not confirm the message. Check the chat before sending again." };
}

/** A photo or file through the Send API (uploaded with the message); same windows as text. */
export async function sendMessengerAttachment(
  opts: { pageId: string; psid: string; token: string; window: Exclude<MessengerWindow, "shut">; kind: "image" | "file"; file: Blob; filename: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; mid: string } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("recipient", JSON.stringify({ id: opts.psid }));
  if (opts.window === "open") form.append("messaging_type", "RESPONSE");
  else { form.append("messaging_type", "MESSAGE_TAG"); form.append("tag", "HUMAN_AGENT"); }
  form.append("message", JSON.stringify({ attachment: { type: opts.kind, payload: { is_reusable: false } } }));
  form.append("filedata", opts.file, opts.filename);
  let response: Response;
  try {
    response = await fetchImpl(graph(`${encodeURIComponent(opts.pageId)}/messages`), { method: "POST", headers: { Authorization: `Bearer ${opts.token}` }, body: form });
  } catch { return { ok: false, error: "Could not reach Messenger to send the file. Try again." }; }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: messengerError(response.status, payload) };
  const mid = (payload as { message_id?: string } | null)?.message_id;
  return mid ? { ok: true, mid } : { ok: false, error: "Messenger did not confirm the file. Check the chat before sending again." };
}
