import { describe, expect, it } from "vitest";
import { importableTemplate, importPlan, importToast, headerKind, templateTail, type MetaTemplateRow } from "./template-import";
import { templateMessage } from "./send";

// The owner's GRR template as Meta answered it on 2026-11-19 (body cut short).
const followup: MetaTemplateRow = {
  id: "1121383077314566", name: "followup", language: "zh_CN", status: "APPROVED", category: "MARKETING", parameter_format: "NAMED",
  components: [
    { type: "BODY", text: "Hi 您好！👋😊\n\n我们 The Conts 目前在KL&Selangor 多个Project 提供 *GRR*" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "想了解更多GRR" }, { type: "QUICK_REPLY", text: "我的unit适合长租/短租" }, { type: "QUICK_REPLY", text: "我的unit 可以获得多少GRR" }] },
  ],
};

describe("importableTemplate", () => {
  it("takes the GRR template with its three quick replies, no variable", () => {
    const v = importableTemplate(followup);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.row).toMatchObject({ name: "followup", id: "1121383077314566", language: "zh_CN", category: "MARKETING" });
    expect(v.row.body.startsWith("Hi 您好")).toBe(true);
    expect(v.row.parts.buttons?.map(b => b.text)).toEqual(["想了解更多GRR", "我的unit适合长租/短租", "我的unit 可以获得多少GRR"]);
    expect(v.row.parts.param).toBeUndefined();
  });

  it("keeps {{1}} as {name}", () => {
    const v = importableTemplate({ name: "hi", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "Hi {{1}}, thanks {{ 1 }}" }] });
    expect(v.ok && v.row.body).toBe("Hi {name}, thanks {name}");
  });

  it("keeps a single named variable as {name} and remembers its name", () => {
    const v = importableTemplate({ name: "n", language: "en", status: "APPROVED", parameter_format: "NAMED", components: [{ type: "BODY", text: "Hi {{first_name}}!" }] });
    expect(v.ok && v.row.body).toBe("Hi {name}!");
    expect(v.ok && v.row.parts.param).toBe("first_name");
  });

  it("takes a PDF / picture / video header and a fixed title", () => {
    const pdf = importableTemplate({ name: "p", language: "en", status: "APPROVED", components: [{ type: "HEADER", format: "DOCUMENT" }, { type: "BODY", text: "x" }, { type: "FOOTER", text: "The Conts" }] });
    expect(pdf.ok && pdf.row.parts).toEqual({ header: { format: "DOCUMENT" }, footer: "The Conts" });
    const title = importableTemplate({ name: "t", language: "en", status: "APPROVED", components: [{ type: "HEADER", format: "TEXT", text: "GRR" }, { type: "BODY", text: "x" }] });
    expect(title.ok && title.row.parts.header).toEqual({ format: "TEXT", text: "GRR" });
  });

  it("leaves out what the CRM cannot fill or send", () => {
    const base = { language: "en", status: "APPROVED" };
    const why = (t: MetaTemplateRow) => { const v = importableTemplate(t); return v.ok ? "ok" : v.reason; };
    expect(why({ ...base, name: "a", components: [{ type: "BODY", text: "{{1}} and {{2}}" }] })).toMatch(/more than the customer's name/);
    expect(why({ ...base, name: "b", components: [{ type: "HEADER", format: "TEXT", text: "Hi {{1}}" }, { type: "BODY", text: "x" }] })).toMatch(/title/);
    expect(why({ ...base, name: "c", components: [{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "x" }] })).toMatch(/location/);
    expect(why({ ...base, name: "d", components: [{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Go", url: "https://x.my/{{1}}" }] }] })).toMatch(/link button/);
    expect(why({ ...base, name: "e", components: [{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copy" }] }] })).toMatch(/copy code button/);
    expect(why({ ...base, name: "f", category: "AUTHENTICATION", components: [{ type: "BODY", text: "x" }] })).toMatch(/verification/);
    expect(why({ ...base, name: "g", status: "PENDING", components: [{ type: "BODY", text: "x" }] })).toMatch(/not approved/);
  });

  it("keeps a fixed link and a phone button", () => {
    const v = importableTemplate({ name: "l", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "x" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Site", url: "https://theconts.my" }, { type: "PHONE_NUMBER", text: "Call", phone_number: "+60183580219" }] }] });
    expect(v.ok && v.row.parts.buttons).toEqual([{ type: "URL", text: "Site", url: "https://theconts.my" }, { type: "PHONE_NUMBER", text: "Call", phone: "+60183580219" }]);
  });
});

describe("importPlan", () => {
  it("leaves Meta's sample and the CRM's own out without a word, and says why for the rest", () => {
    const plan = importPlan([
      followup,
      { name: "hello_world", language: "en_US", status: "APPROVED", components: [{ type: "BODY", text: "x" }] },
      { name: "crm_instant_form_710bmehl", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "x" }] },
      { name: "two", language: "en", status: "APPROVED", components: [{ type: "BODY", text: "{{1}} {{2}}" }] },
      { name: "waiting", language: "en", status: "PENDING", components: [{ type: "BODY", text: "x" }] },
    ]);
    expect(plan.rows.map(r => r.name)).toEqual(["followup"]);
    expect(plan.skipped.map(s => s.name)).toEqual(["two"]);
  });

  it("says what was done", () => {
    expect(importToast({ added: 1, skipped: [] })).toBe("Imported 1 from Meta · switch it on to use");
    expect(importToast({ added: 0, skipped: [{ name: "two", reason: "x" }, { name: "y", reason: "z" }] })).toBe("Nothing new in Meta to import · 2 left out — two: x (+1)");
  });
});

describe("templateMessage", () => {
  it("is as before for a CRM template", () => {
    expect(templateMessage("60123", "crm_x", "en", ["Sarah"])).toEqual({ to: "60123", type: "template",
      template: { name: "crm_x", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "Sarah" }] }] } });
    expect(templateMessage("60123", "followup", "zh_CN", [])).toEqual({ to: "60123", type: "template", template: { name: "followup", language: { code: "zh_CN" } } });
  });

  it("names a named variable and carries a PDF header", () => {
    const m = templateMessage("60123", "grr", "zh_CN", ["Sarah"], { named: "first_name", header: { kind: headerKind("DOCUMENT")!, id: "MEDIA1", filename: "GRR.pdf" } });
    expect(m.template).toEqual({ name: "grr", language: { code: "zh_CN" }, components: [
      { type: "header", parameters: [{ type: "document", document: { id: "MEDIA1", filename: "GRR.pdf" } }] },
      { type: "body", parameters: [{ type: "text", text: "Sarah", parameter_name: "first_name" }] },
    ] });
  });
});

describe("templateTail", () => {
  it("keeps the footer and each button on a line of its own under the words", () => {
    expect(templateTail({ buttons: ["想了解更多GRR", "我的unit适合长租/短租"] })).toBe("\n\n↩ 想了解更多GRR\n↩ 我的unit适合长租/短租");
    expect(templateTail({ footer: "The Conts", buttons: ["Go"] })).toBe("\n\nThe Conts\n↩ Go");
    expect(templateTail({})).toBe("");
  });
});
