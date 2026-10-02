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
