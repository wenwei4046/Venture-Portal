/**
 * Sending a WhatsApp message through the Cloud API: the request Meta expects,
 * the 24-hour rule, and Meta's errors in words a salesperson can act on.
 * The token is passed in by the server and never reaches a browser.
 */

export const GRAPH_VERSION = "v21.0";

/** WhatsApp's limit for a text message body. */
export const MAX_TEXT = 4096;

/**
 * Meta's customer-service window: free text only within 24 hours of the
 * customer's LAST message. After that, only an approved template may open
 * the conversation again (templates arrive later).
 */
export const WINDOW_HOURS = 24;

export function windowOpen(lastCustomerAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastCustomerAt) return false;
  const t = new Date(lastCustomerAt).getTime();
  return Number.isFinite(t) && now.getTime() - t < WINDOW_HOURS * 60 * 60_000;
}

/** The text as it will be sent, or why it cannot be. */
export function cleanText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MAX_TEXT) return { ok: false, error: `WhatsApp allows up to ${MAX_TEXT.toLocaleString("en-MY")} characters in one message.` };
  return { ok: true, text: body };
}

/** The Cloud API request for a plain text reply. */
export function textRequest(phoneNumberId: string, to: string, body: string, token: string) {
  return {
    url: `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
    },
  };
}

/** Meta's error, in words a salesperson can act on. Never the token, never the raw request. */
export function sendError(status: number, payload: unknown): string {
  const error = (payload as { error?: { code?: number; error_subcode?: number; message?: string } } | null)?.error;
  const code = error?.code;
  if (code === 131047 || code === 470) return "More than 24 hours since the customer's last message — WhatsApp only allows an approved template now.";
  if (code === 131026) return "WhatsApp could not deliver to this number (it may not be on WhatsApp, or has blocked the business).";
  if (code === 131056 || code === 130429 || status === 429) return "Too many messages too quickly. Wait a moment and send again.";
  if (code === 190 || status === 401) return "The WhatsApp connection needs a new access token. Ask your administrator.";
  if (code === 10 || code === 200 || status === 403) return "The WhatsApp connection is missing a permission. Ask your administrator.";
  if (code === 131030) return "This number is not allowed while the WhatsApp account is in test mode.";
  return `WhatsApp refused the message${code ? ` (code ${code})` : ""}. Try again, or ask your administrator.`;
}

export type SendResult = { ok: true; wamid: string } | { ok: false; error: string };

/** Send a text reply; returns Meta's message id (wamid) or a readable reason. */
export async function sendWhatsAppText(
  opts: { phoneNumberId: string; to: string; body: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const { url, init } = textRequest(opts.phoneNumberId, opts.to, opts.body, opts.token);
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: "Could not reach WhatsApp. Check the connection and send again." };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: sendError(response.status, payload) };
  const wamid = (payload as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  return wamid ? { ok: true, wamid } : { ok: false, error: "WhatsApp did not confirm the message. Check the chat before sending again." };
}

/* ── Beyond plain text (the CRM redesign, 2026-10-09) ──────────────────── */

/** A Cloud API message: the parts every kind shares, plus the kind's own. */
export function messageRequest(phoneNumberId: string, token: string, message: Record<string, unknown>) {
  return {
    url: `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
    },
  };
}

/** Text, optionally quoting one of the customer's messages (their wamid) the way WhatsApp shows a reply. */
export const textMessage = (to: string, body: string, quote?: string | null) =>
  ({ to, type: "text", text: { preview_url: false, body }, ...(quote ? { context: { message_id: quote } } : {}) });

/** Our reaction to a message (empty emoji takes it back). */
export const reactionMessage = (to: string, wamid: string, emoji: string) =>
  ({ to, type: "reaction", reaction: { message_id: wamid, emoji } });

/** An approved template; its body's variables ({{1}}, {{2}}…) are filled in order. */
export const templateMessage = (to: string, name: string, language: string, params: string[]) => ({
  to, type: "template",
  template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }] } : {}) },
});

/** A photo or document we uploaded (its media id), with a caption / file name. */
export const mediaMessage = (to: string, kind: "image" | "document", mediaId: string, caption: string, filename?: string) =>
  ({ to, type: kind, [kind]: { id: mediaId, ...(caption ? { caption } : {}), ...(kind === "document" && filename ? { filename } : {}) } });

/** Send any message; returns Meta's id (wamid) or a readable reason. */
export async function sendWhatsApp(
  opts: { phoneNumberId: string; token: string; message: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const { url, init } = messageRequest(opts.phoneNumberId, opts.token, opts.message);
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: "Could not reach WhatsApp. Check the connection and send again." };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: sendError(response.status, payload) };
  const wamid = (payload as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  // A reaction has no message of its own to confirm beyond Meta's OK.
  if (opts.message.type === "reaction") return { ok: true, wamid: wamid ?? "" };
  return wamid ? { ok: true, wamid } : { ok: false, error: "WhatsApp did not confirm the message. Check the chat before sending again." };
}

/** Photos and documents WhatsApp takes, and their size limits (Meta's). */
export const MEDIA_LIMITS = { image: { types: ["image/jpeg", "image/png"], bytes: 5 * 1024 * 1024 }, document: { bytes: 100 * 1024 * 1024 } };

/** Upload a file to the Cloud API; returns its media id. */
export async function uploadWhatsAppMedia(
  opts: { phoneNumberId: string; token: string; file: Blob; filename: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", opts.file.type || "application/octet-stream");
  form.append("file", opts.file, opts.filename);
  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(opts.phoneNumberId)}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${opts.token}` }, body: form,
    });
  } catch {
    return { ok: false, error: "Could not reach WhatsApp to upload the file. Try again." };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: sendError(response.status, payload) };
  const id = (payload as { id?: string } | null)?.id;
  return id ? { ok: true, id } : { ok: false, error: "WhatsApp did not take the file. Try again." };
}

export interface WaTemplate { name: string; language: string; category: string; text: string; params: number }

/** The approved templates of the WhatsApp Business Account, with their body text. */
export async function fetchWhatsAppTemplates(
  opts: { wabaId: string; token: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; templates: WaTemplate[] } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(opts.wabaId)}/message_templates?fields=name,language,status,category,components&limit=100`, {
      headers: { Authorization: `Bearer ${opts.token}` }, cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach WhatsApp for the templates." };
  }
  const payload = (await response.json().catch(() => null)) as { data?: { name: string; language: string; status: string; category?: string; components?: { type: string; text?: string }[] }[] } | null;
  if (!response.ok) return { ok: false, error: sendError(response.status, payload) };
  return { ok: true, templates: templatesFrom(payload?.data ?? []) };
}

/** Meta's template list → the approved ones the CRM can send (pure, tested). */
export function templatesFrom(rows: { name: string; language: string; status: string; category?: string; components?: { type: string; text?: string }[] }[]): WaTemplate[] {
  return rows.filter(t => t.status === "APPROVED").map(t => {
    const text = t.components?.find(c => c.type === "BODY")?.text ?? "";
    const params = new Set((text.match(/\{\{\s*\d+\s*\}\}/g) ?? []).map(m => m.replace(/\D/g, ""))).size;
    return { name: t.name, language: t.language, category: t.category ?? "", text, params };
  });
}

/** A template's body with its variables filled — what the customer reads, kept in the chat. */
export const fillTemplate = (text: string, params: string[]) => text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
