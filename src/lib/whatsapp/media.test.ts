import { describe, expect, it, vi } from "vitest";
import { fetchWhatsAppMedia, inlineType, validMediaId } from "./media";

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
    expect(r).toMatchObject({ ok: false, status: 404, error: expect.stringMatching(/no longer has this file/) });
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
