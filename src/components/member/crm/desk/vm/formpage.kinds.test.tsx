/**
 * Forms (2026-10-29, the owner: "这里是2个form, 一个是给crm customer info, 一个是internal sales booking form … 现在的画面看不懂"):
 * the page first picks the kind — Customer info or the booking link's — then that kind's forms; the booking form carries the
 * link to copy and previews the booking page, and saves as a booking form.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrmData, CrmForm } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { formPageVM } from "./formpage";
import { toCrmForm, defaultBookingForm } from "./form";
import { DeskForm4a } from "../Desk4a";

const booking: CrmForm = { id: "bk1", name: "Booking form", sections: toCrmForm(defaultBookingForm(), "bk1").sections };

function harness(saves: unknown[] = []) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "forms" };
  const data = { customers: [], visits: [], rooms: [], events: [], forms: [], bookingForms: [booking], can: { viewAll: true, manage: true, editAll: true } } as unknown as CrmData;
  const ctx = () => ({
    ui, data, W: 1440, now: new Date(2026, 9, 29), nameOf: (id: string) => id, act: {},
    deskAct: { saveForm: async (f: unknown, kind: unknown) => { saves.push([f, kind]); return "bk1"; } },
    set: (f: (u: DeskUi) => DeskUi) => { ui = f(ui); }, patch: (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; },
  }) as unknown as DeskCtx;
  return { vm: () => formPageVM(ctx()), ui: () => ui };
}

describe("the Forms page", () => {
  it("opens on Customer info, and offers the two kinds", () => {
    const h = harness();
    expect(h.vm().cfBooking).toBe(false);
    expect(h.vm().cfKinds.map(k => [k.label, k.on])).toEqual([["Customer info", true], ["Booking form", false]]);
    const html = renderToStaticMarkup(<DeskForm4a v={h.vm()} preview={<span>PHONE-PREVIEW</span>} share={<span>LINK-CARD</span>} />);
    expect(html).toContain("Which form");
    expect(html).not.toContain("LINK-CARD");
    expect(html).toContain("PHONE-PREVIEW");
  });
  it("the booking form: its questions, the link card, the booking page's preview, and no pages", () => {
    const h = harness();
    h.vm().cfKinds[1].pick();
    const v = h.vm();
    expect(v.cfBooking).toBe(true);
    expect(v.cfForms.list.map(f => [f.name, f.inUse])).toEqual([["Booking form", true]]);
    expect(v.cfSecs.map(s => s.title)).toEqual(["You", "Customer", "Notes"]);
    const customer = v.cfSecs[1].fields;
    expect(customer.filter(f => f.core).map(f => f.label)).toEqual(["Customer name", "Customer phone"]);
    expect(v.cfSummary).toMatch(/^Booking form · 12 questions · 3 required$/);
    const html = renderToStaticMarkup(<DeskForm4a v={v} preview={<span>PHONE-PREVIEW</span>} share={<span>LINK-CARD</span>} />);
    expect(html).toContain("LINK-CARD");
    expect(html).toContain("Book this slot");
    expect(html).not.toContain("PHONE-PREVIEW");
    expect(html).not.toContain("Add page");
  });
  it("saves as a booking form", async () => {
    const saves: unknown[] = [];
    const h = harness(saves);
    h.vm().cfKinds[1].pick();
    h.vm().cfSecs[1].add("Car plate");
    h.vm().cfSave();
    await new Promise(r => setTimeout(r, 0));
    const [form, kind] = saves[0] as [{ id: string; sections: CrmForm["sections"] }, string];
    expect(kind).toBe("booking");
    expect(form.id).toBe("bk1");
    expect(form.sections[1].fields.map(f => f.label)).toContain("Car plate");
  });
});
