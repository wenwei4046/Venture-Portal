import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET / HEAD /member/crm-media/<id> (2026-11-10): our bucket's copy first; a customer's file gone at Meta and never kept is
// 410 + X-Media-Gone, never cached, so the chat stops asking and draws "no longer available".
const row = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getMemberUser: vi.fn(async () => ({ id: "u1", is_active: true })) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row.value }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://r2.example/${path}?sig=1` }, error: null }) }) },
  })),
}));

const { GET, HEAD } = await import("./route");

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const call = (method: "GET" | "HEAD") => (method === "GET" ? GET : HEAD)(new Request(`https://x/member/crm-media/${ID}`, { method }), { params: Promise.resolve({ messageId: ID }) });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const oe = (s: number) => Math.floor(Date.now() / 1000 + s).toString(16);

beforeEach(() => { process.env.META_SYSTEM_USER_TOKEN = "TOKEN"; });
afterEach(() => { row.value = null; vi.unstubAllGlobals(); delete process.env.META_SYSTEM_USER_TOKEN; });

describe("a customer's file in the chat", () => {
  it("kept in our bucket: the signed link, however old its Meta id", async () => {
    row.value = { media_id: "123456", media_path: "c/in-1.jpg", media_url: null, media_mime: "image/jpeg", body: null, sent_at: daysAgo(30) };
    const res = await call("GET");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example/c/in-1.jpg?sig=1");
    expect((await call("HEAD")).status).toBe(200);
  });

  it("a WhatsApp id older than 7 days, never kept: 410 without asking Meta", async () => {
    row.value = { media_id: "123456", media_path: null, media_url: null, media_mime: "image/jpeg", body: null, sent_at: daysAgo(8) };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const m of ["GET", "HEAD"] as const) {
      const res = await call(m);
      expect(res.status).toBe(410);
      expect(res.headers.get("x-media-gone")).toBe("whatsapp");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Meta answering 404 / 400 for a WhatsApp id: 410; HEAD asks Graph only, downloading nothing", async () => {
    row.value = { media_id: "123456", media_path: null, media_url: null, media_mime: "image/jpeg", body: null, sent_at: daysAgo(2) };
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect((await call("GET")).status).toBe(410);
    const head = await call("HEAD");
    expect([head.status, head.headers.get("x-media-gone")]).toEqual([410, "whatsapp"]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const c of fetchSpy.mock.calls as unknown as [string][]) expect(String(c[0])).toMatch(/^https:\/\/graph\.facebook\.com\//);
  });

  it("a WhatsApp file Meta still has: HEAD 200 from Graph's answer alone", async () => {
    row.value = { media_id: "123456", media_path: null, media_url: null, media_mime: "image/jpeg", body: null, sent_at: daysAgo(2) };
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    expect((await call("HEAD")).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("Messenger: past its oe= is 410 (messenger); before it, Meta's address", async () => {
    row.value = { media_id: null, media_path: null, media_url: `https://scontent.xx.fbcdn.net/v/a.jpg?oe=${oe(-60)}`, media_mime: null, body: null, sent_at: daysAgo(20) };
    const res = await call("GET");
    expect([res.status, res.headers.get("x-media-gone")]).toEqual([410, "messenger"]);
    row.value = { ...row.value, media_url: `https://scontent.xx.fbcdn.net/v/a.jpg?oe=${oe(3600)}` };
    expect((await call("GET")).status).toBe(302);
    expect((await call("HEAD")).status).toBe(200);
  });

  it("a message the session cannot read is 404, never a hint", async () => {
    row.value = null;
    expect((await call("GET")).status).toBe(404);
    expect((await call("HEAD")).status).toBe(404);
  });
});
