import { describe, expect, it, vi } from "vitest";
import { pageProfileBody, uploadWaPhoto, waProfileBody } from "./channels";

const P = { name: "Dream Crafter Design", about: "a".repeat(200), description: "Full-home renovation", address: "Lot 12", email: "hello@x.my", website: " x.my ", vertical: "" };

describe("v2 09b · the business profile sent to Meta", () => {
  it("WhatsApp: about cut at 139, one website, OTHER when no category, the photo's handle when there is one", () => {
    const b = waProfileBody(P, "h:1");
    expect(b.about).toHaveLength(139);
    expect(b.websites).toEqual(["x.my"]);
    expect(b.vertical).toBe("OTHER");
    expect(b.profile_picture_handle).toBe("h:1");
    expect("profile_picture_handle" in waProfileBody(P)).toBe(false);
  });
  it("Facebook Page: about, description, website and email only — never its name or address", () => {
    expect(Object.keys(pageProfileBody(P)).sort()).toEqual(["about", "description", "emails", "website"]);
  });
  it("a photo goes up in Meta's resumable upload and comes back as a handle", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { app_id: "77" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "upload:abc" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ h: "4::handle" })));
    const r = await uploadWaPhoto("T", new ArrayBuffer(10), "image/jpeg", f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, handle: "4::handle" });
    expect(String(f.mock.calls[1][0])).toContain("77/uploads?file_length=10&file_type=image%2Fjpeg");
    expect(f.mock.calls[2][1].headers).toMatchObject({ Authorization: "OAuth T", file_offset: "0" });
  });
});
