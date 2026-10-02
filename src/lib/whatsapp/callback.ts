/** The WhatsApp webhook's path, and the Callback URL to paste into Meta. Browser-safe (no node:crypto). */
export const WEBHOOK_PATH = "/api/whatsapp/v1/webhook";

export const callbackUrl = (origin: string) => `${origin.replace(/\/$/, "")}${WEBHOOK_PATH}`;

/** Meta must reach the URL over the internet: localhost and plain http will not verify. */
export const reachableByMeta = (origin: string) => {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
};
