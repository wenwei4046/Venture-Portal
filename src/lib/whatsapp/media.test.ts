import { describe, expect, it, vi } from "vitest";
import { fetchWhatsAppMedia, goneAtMeta, inlineType, messengerExpiresAt, validMediaId } from "./media";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("fetching a customer's media", () => {
  it("asks Meta for the URL, then downloads it — both with the token", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mime_type: "image/jpeg" }))
      .mockResolvedValueOnce(new Response("JPEG", { status: 200, headers: { "content-length": "4" } }));
    const r = await fetchWhatsAppMedia("123456789", "TOKEN", fetchImpl);
    expect(r).toMatchObject({ ok: true, type: "image/jpeg", length: "4" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://graph.facebook.com/v21.0/123456789");
    for (const call of fetchImpl.mock.calls) expect(call[1].headers.Authorization).toBe("Bearer TOKEN");
  });

  it("never downloads from anywhere but Meta's servers", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(200, { url: "https://evil.example/steal", mime_type: "image/jpeg" }));
    expect(await fetchWhatsAppMedia("123456789", "TOKEN", fetchImpl)).toMatchObject({ ok: false, status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("says plainly when WhatsApp no longer has the file", async () => {
    const r = await fetchWhatsAppMedia("123456789", "TOKEN", vi.fn().mockResolvedValueOnce(json(404, {})));
    // 410 since 2026-11-10: the chat stops asking and draws "no longer available"; Graph says 400 for an expired id too.
    expect(r).toMatchObject({ ok: false, status: 410, error: expect.stringMatching(/no longer has this file/) });
    expect(await fetchWhatsAppMedia("123456789", "TOKEN", vi.fn().mockResolvedValueOnce(json(400, {})))).toMatchObject({ ok: false, status: 410 });
  });

  it("knows a customer's file Meta no longer serves (2026-11-10: WhatsApp keeps 7 days, Messenger until its oe=)", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const oe = (ms: number) => Math.floor(ms / 1000).toString(16);
    expect(goneAtMeta({ media_id: "123456", sent_at: "2026-11-02T11:00:00Z" }, now)).toBe("whatsapp");
    expect(goneAtMeta({ media_id: "123456", sent_at: "2026-11-05T12:00:00Z" }, now)).toBeNull();
    // Kept in our bucket: never gone, however old.
    expect(goneAtMeta({ media_id: "123456", media_path: "c/in-1.jpg", sent_at: "2026-01-01T00:00:00Z" }, now)).toBeNull();
    expect(goneAtMeta({ media_url: `https://scontent.xx.fbcdn.net/v/a.jpg?_nc=1&oe=${oe(now - 1000)}` }, now)).toBe("messenger");
    expect(goneAtMeta({ media_url: `https://scontent.xx.fbcdn.net/v/a.jpg?oe=${oe(now + 86_400_000)}&x=1` }, now)).toBeNull();
    expect(goneAtMeta({ media_url: "https://evil.example/a.jpg" }, now)).toBe("messenger");
    expect(messengerExpiresAt("https://cdn.fbsbx.com/v/a.pdf")).toBeNull();
  });

  it("our own message is never gone at Meta, however old (2026-11-11: Shane Law's chat)", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    // Production's sent voice note of 25 Oct: our copy in crm-media.
    expect(goneAtMeta({ direction: "out", media_path: "d33363d4/1792923814710-3a2c0b.ogg", sent_at: "2026-10-25T10:23:39Z" }, now)).toBeNull();
    // Even one with only a media id (none on production) is ours: never the customer's 7 days.
    expect(goneAtMeta({ direction: "out", media_id: "123456", sent_at: "2026-10-01T00:00:00Z" }, now)).toBeNull();
    // The customer's own voice note of that chat, never kept, is.
    expect(goneAtMeta({ direction: "in", media_id: "123456", sent_at: "2026-10-25T10:13:01Z" }, now)).toBe("whatsapp");
  });

  it("refuses anything that is not a media id, without asking Meta", async () => {
    const fetchImpl = vi.fn();
    expect((await fetchWhatsAppMedia("../../me", "TOKEN", fetchImpl)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect([validMediaId("123456"), validMediaId("abc"), validMediaId(null)]).toEqual([true, false, false]);
  });

  it("shows photos, videos, voice and PDFs inline (2026-10-13: a PDF opened blank); anything else downloads", () => {
    expect(["image/jpeg", "video/mp4", "audio/ogg; codecs=opus", "application/pdf", "image/svg+xml"].map(inlineType)).toEqual([true, true, true, true, false]);
  });
});
