import { describe, expect, it, vi } from "vitest";
import { QuoteLogic } from "./QuoteLogic";

// Send to CRM chat (the user, 2026-11-17: "press send, 是否可以直接 select from CRM contact" → "这个要"): the quotation's
// PDF into the customer's own chat in the CRM — step 1's customer, else one picked here — and never past Meta's window.
type Box = { title: string; sub: string; pick: boolean; hits: { name: string; pick: () => void }[]; none: string; who: { name: string; sub: string } | false;
  note: string; ok: string; act: () => void; closeLabel: string; close: () => void };
type Reach = { ok: boolean; name?: string; phone?: string; channel?: string; window?: string; error?: string };

const P = QuoteLogic.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
const KEEP = ["sendCrm", "crmSendFind", "crmCheck", "crmSendGo", "crmSendBox", "openCrmChat"];
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function quote(over: { state?: Record<string, unknown>; reach?: Reach; sent?: { ok: boolean; error?: string }; readOnly?: boolean; ready?: boolean } = {}) {
  const sendToCrm = vi.fn(async () => over.sent ?? { ok: true });
  const crmReach = vi.fn(async () => over.reach ?? { ok: true, name: "Tan Wei Ming", phone: "012-338 4471", channel: "whatsapp", window: "open" });
  const self: Record<string, unknown> & { state: Record<string, unknown> } = {
    state: { crmId: null, crmPick: null, cust: { att: "Tan Wei Ming" }, ...over.state },
    props: { sendToCrm, crmReach, readOnly: !!over.readOnly, searchCrm: async () => [{ id: "c9", name: "Jason Lee", phone: "016-205 9984" }] },
    checkReq: () => over.ready ?? true, flash: vi.fn(), saveDraft: vi.fn(), crmCaption: () => "Quotation\nTotal: RM 1.00",
    pdfFor: () => Promise.resolve(new Blob(["%PDF"], { type: "application/pdf" })),
    pdfFile: (b: Blob) => new File([b], "Quotation.pdf", { type: "application/pdf" }),
    setState(s: unknown) { const next = typeof s === "function" ? (s as (x: unknown) => Record<string, unknown>)(self.state) : s; self.state = { ...self.state, ...(next as Record<string, unknown>) }; },
  };
  for (const k of KEEP) self[k] = P[k].bind(self);
  const box = () => (self.crmSendBox as () => Box | false)();
  return { self, box, sendToCrm, crmReach };
}

describe("Send to CRM chat", () => {
  it("goes straight to step 1's CRM customer, and sends the PDF into their chat", async () => {
    const q = quote({ state: { crmId: "c1", crmPick: { id: "c1", name: "Tan Wei Ming", phone: "012-338 4471" } } });
    (q.self.sendCrm as () => void)();
    expect(q.crmReach).toHaveBeenCalledWith("c1");
    await flush();
    const b = q.box() as Box;
    expect(b.who && b.who.sub).toBe("WhatsApp · 012-338 4471");
    expect(b.ok).toBe("Send PDF");
    b.act(); await flush();
    expect(q.sendToCrm).toHaveBeenCalledTimes(1);
    const [id, file, caption] = q.sendToCrm.mock.calls[0] as unknown as [string, File, string];
    expect(id).toBe("c1"); expect(file.type).toBe("application/pdf"); expect(caption).toContain("Total");
    expect(q.self.state.crmSend).toBeNull();
    expect(q.self.state.confirm).toMatchObject({ title: "Sent to Tan Wei Ming" });
  });

  it("asks for the customer when step 1 picked none, then checks the one picked", async () => {
    vi.useFakeTimers();
    const q = quote();
    (q.self.sendCrm as () => void)();
    expect((q.box() as Box).pick).toBe(true);
    expect((q.box() as Box).none).toMatch(/at least 2/);
    (q.self.crmSendFind as (s: string) => void)("jason");
    await vi.advanceTimersByTimeAsync(250);
    vi.useRealTimers();
    const hits = (q.box() as Box).hits;
    expect(hits.map(h => h.name)).toEqual(["Jason Lee"]);
    hits[0].pick();
    expect(q.crmReach).toHaveBeenCalledWith("c9");
  });

  it("does not send past WhatsApp's 24 hours — it offers the chat, where a template can go", async () => {
    const q = quote({ state: { crmId: "c1", crmPick: { id: "c1", name: "Tan Wei Ming" } }, reach: { ok: true, name: "Tan Wei Ming", channel: "whatsapp", window: "shut" } });
    (q.self.sendCrm as () => void)(); await flush();
    const b = q.box() as Box;
    expect(b.note).toMatch(/24 hours.*approved template/);
    expect(b.ok).toBe("Open chat in CRM");
    expect(q.sendToCrm).not.toHaveBeenCalled();
    const go = vi.spyOn(window, "location", "get").mockReturnValue({ href: "" } as Location);
    b.act();
    expect(q.self.saveDraft).toHaveBeenCalled();
    go.mockRestore();
  });

  it("says Messenger's own words past its window", async () => {
    const q = quote({ state: { crmId: "c1", crmPick: { id: "c1", name: "Ali" } }, reach: { ok: true, name: "Ali", channel: "messenger", window: "shut" } });
    (q.self.sendCrm as () => void)(); await flush();
    expect((q.box() as Box).note).toMatch(/Messenger does not allow/);
  });

  it("shows why a send failed, and keeps the box to try again", async () => {
    const q = quote({ state: { crmId: "c1", crmPick: { id: "c1", name: "Tan Wei Ming" } }, sent: { ok: false, error: "You may not reply to this customer." } });
    (q.self.sendCrm as () => void)(); await flush();
    (q.box() as Box).act(); await flush();
    const b = q.box() as Box;
    expect(b.note).toBe("You may not reply to this customer.");
    expect(b.ok).toBe("Try again");
  });

  it("sends nothing while viewing as, or before the quote's required fields", async () => {
    const view = quote({ readOnly: true, state: { crmId: "c1", crmPick: { id: "c1", name: "Tan Wei Ming" } } });
    (view.self.sendCrm as () => void)(); await flush();
    (view.box() as Box).act(); await flush();
    expect(view.sendToCrm).not.toHaveBeenCalled();
    const early = quote({ ready: false, state: { crmId: "c1" } });
    (early.self.sendCrm as () => void)();
    expect(early.crmReach).not.toHaveBeenCalled();
    expect(early.box()).toBe(false);
  });
});
