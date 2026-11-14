import { describe, expect, it, vi } from "vitest";
import { HUMAN_AGENT_APPROVED, facebookUrl, messengerError, messengerRequest, messengerWindow, pageToken, postPermalink, profileName, reelOf, sendMessengerText } from "./send";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("Messenger's reply windows", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("with Human Agent approved: open for 24 hours, then Human Agent until 7 days, then shut", () => {
    expect(messengerWindow("2026-10-10T00:00:00Z", now, true)).toBe("open");
    expect(messengerWindow("2026-10-09T11:00:00Z", now, true)).toBe("human_agent");
    expect(messengerWindow("2026-10-03T13:00:00Z", now, true)).toBe("human_agent");
    expect(messengerWindow("2026-10-03T11:00:00Z", now, true)).toBe("shut");
    expect(messengerWindow(null, now, true)).toBe("shut");
  });
  it("Human Agent approved (2026-11-14): 24 h – 7 days is the HUMAN_AGENT window, then shut", () => {
    expect(HUMAN_AGENT_APPROVED).toBe(true);
    expect(messengerWindow("2026-10-10T00:00:00Z", now)).toBe("open");
    expect(messengerWindow("2026-10-09T11:00:00Z", now)).toBe("human_agent");
    expect(messengerWindow("2026-10-01T11:00:00Z", now)).toBe("shut");
  });
  it("without the approval (an automatic send): shut after 24 hours", () => {
    expect(messengerWindow("2026-10-09T11:00:00Z", now, false)).toBe("shut");
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
    expect(await profileName("102351059576534", "123456789", "T", vi.fn().mockResolvedValue(json(200, { first_name: "Mei", last_name: "Ling" })))).toBe("Mei Ling");
    expect(await profileName("102351059576534", "123456789", "T", vi.fn().mockRejectedValue(new Error("timeout")))).toBeNull();
  });

  it("falls back to the Page's conversation when the profile API is not allowed", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json(400, { error: { code: 100, error_subcode: 33 } }))
      .mockResolvedValueOnce(json(200, { data: [{ participants: { data: [{ id: "123456789", name: "Tan Mei Ling" }, { id: "102351059576534", name: "The Conts" }] } }] }));
    expect(await profileName("102351059576534", "123456789", "T", f)).toBe("Tan Mei Ling");
    expect(f.mock.calls[1][0]).toContain("102351059576534/conversations?platform=messenger&user_id=123456789");
  });

  it("returns Meta's message id, or a reason in plain words", async () => {
    const opts = { pageId: "PAGE1", psid: "PSID1", body: "Hi", token: "T", window: "open" as const };
    expect(await sendMessengerText(opts, vi.fn().mockResolvedValue(json(200, { recipient_id: "PSID1", message_id: "m_9" })))).toEqual({ ok: true, mid: "m_9" });
    expect(await sendMessengerText(opts, vi.fn().mockResolvedValue(json(400, { error: { code: 10, error_subcode: 2018278 } })))).toEqual({ ok: false, error: expect.stringMatching(/reply window/) });
    expect(messengerError(403, { error: { code: 200 } })).toMatch(/Human Agent/);
  });
});

describe("an ad's post (2026-11-13: the <page>_<post> address answered \"This isn't available\")", () => {
  it("asks Meta for the post's own permalink and keeps only a facebook.com https address", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { permalink_url: "https://www.facebook.com/reel/1131026622809105/", id: "102351059576534_1008213335654428" }));
    expect(await postPermalink("102351059576534_1008213335654428", "T", fetchImpl)).toBe("https://www.facebook.com/reel/1131026622809105/");
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/102351059576534_1008213335654428\?fields=permalink_url$/);
    expect(await postPermalink("102351059576534_1", "T", vi.fn().mockResolvedValue(json(200, { permalink_url: "https://evil.com/x" })))).toBeNull();
    expect(await postPermalink("102351059576534_1", "T", vi.fn().mockResolvedValue(json(400, { error: { code: 100 } })))).toBeNull();
    expect(await postPermalink("102351059576534_1", "T", vi.fn().mockRejectedValue(new Error("down")))).toBeNull();
    // Never asks Meta about anything but a post's key.
    const never = vi.fn();
    expect(await postPermalink("../me", "T", never)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
  it("takes facebook.com itself only", () => {
    expect(facebookUrl("https://www.facebook.com/1022331100909318/posts/1008213322321096")).toBe("https://www.facebook.com/1022331100909318/posts/1008213322321096");
    expect(facebookUrl("https://m.facebook.com/reel/1/")).toBe("https://m.facebook.com/reel/1/");
    expect(facebookUrl("http://www.facebook.com/x")).toBeNull();
    expect(facebookUrl("https://facebook.com.evil.com/x")).toBeNull();
    expect(facebookUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("a video ad's reel (2026-11-13: a reel opened, a carousel's permalink did not)", () => {
  it("takes a reel and nothing else", () => {
    expect(reelOf("https://www.facebook.com/reel/1131026622809105/")).toBe("https://www.facebook.com/reel/1131026622809105/");
    // A carousel's permalink, as Meta answered it — Facebook would not open it.
    expect(reelOf("https://www.facebook.com/1022331100909318/posts/1008213322321096")).toBeNull();
    expect(reelOf("https://evil.com/reel/1/")).toBeNull();
    expect(reelOf(null)).toBeNull();
  });
});
