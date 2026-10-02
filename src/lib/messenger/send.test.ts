import { describe, expect, it, vi } from "vitest";
import { messengerError, messengerRequest, messengerWindow, pageToken, profileName, sendMessengerText } from "./send";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("Messenger's reply windows", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("is open for 24 hours, then Human Agent until 7 days, then shut", () => {
    expect(messengerWindow("2026-10-10T00:00:00Z", now)).toBe("open");
    expect(messengerWindow("2026-10-09T11:00:00Z", now)).toBe("human_agent");
    expect(messengerWindow("2026-10-03T13:00:00Z", now)).toBe("human_agent");
    expect(messengerWindow("2026-10-03T11:00:00Z", now)).toBe("shut");
    expect(messengerWindow(null, now)).toBe("shut");
  });
});

describe("the request", () => {
  it("is a normal response inside 24 hours, tagged HUMAN_AGENT after — token only in the header", () => {
    const open = messengerRequest("PAGE1", "PSID1", "Hi", "TOKEN", "open");
    expect(JSON.parse(open.init.body)).toEqual({ recipient: { id: "PSID1" }, messaging_type: "RESPONSE", message: { text: "Hi" } });
    const late = messengerRequest("PAGE1", "PSID1", "Hi", "TOKEN", "human_agent");
    expect(JSON.parse(late.init.body)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
    expect(open.url).toBe("https://graph.facebook.com/v21.0/PAGE1/messages");
    expect(open.url.includes("TOKEN") || open.init.body.includes("TOKEN")).toBe(false);
  });
});

describe("talking to Meta", () => {
  it("gets the Page's token with the System User token", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { access_token: "PAGE_TOKEN", id: "102351059576534" }));
    expect(await pageToken("102351059576534", "SYS", f)).toBe("PAGE_TOKEN");
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer SYS");
    expect(await pageToken("../x", "SYS", f)).toBeNull();
  });

  it("reads the customer's name, and gives up quietly", async () => {
    expect(await profileName("123456789", "T", vi.fn().mockResolvedValue(json(200, { first_name: "Mei", last_name: "Ling" })))).toBe("Mei Ling");
    expect(await profileName("123456789", "T", vi.fn().mockRejectedValue(new Error("timeout")))).toBeNull();
  });

  it("returns Meta's message id, or a reason in plain words", async () => {
    const opts = { pageId: "PAGE1", psid: "PSID1", body: "Hi", token: "T", window: "open" as const };
    expect(await sendMessengerText(opts, vi.fn().mockResolvedValue(json(200, { recipient_id: "PSID1", message_id: "m_9" })))).toEqual({ ok: true, mid: "m_9" });
    expect(await sendMessengerText(opts, vi.fn().mockResolvedValue(json(400, { error: { code: 10, error_subcode: 2018278 } })))).toEqual({ ok: false, error: expect.stringMatching(/reply window/) });
    expect(messengerError(403, { error: { code: 200 } })).toMatch(/Human Agent/);
  });
});
