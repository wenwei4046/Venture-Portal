/**
 * The owner, 2026-11-04: "如果meta 审核成功，这边就要马上更新" — Meta's verdict on a template (field
 * message_template_status_update) is read off the WhatsApp webhook and handed to crm_template_status_hook.
 */
import { describe, expect, it } from "vitest";
import { parseDelivery } from "./webhook";

const verdict = (value: Record<string, unknown>) => ({ object: "whatsapp_business_account",
  entry: [{ id: "1593040875095936", changes: [{ field: "message_template_status_update", value }] }] });

describe("a template's review from Meta", () => {
  it("an approval, by Meta's name, with no reason", () => {
    const d = parseDelivery(verdict({ event: "APPROVED", message_template_id: 1, message_template_name: "crm_instant_form_710bmehl", message_template_language: "en", reason: "NONE" }));
    expect(d.templates).toEqual([{ name: "crm_instant_form_710bmehl", status: "APPROVED", reason: "" }]);
    expect(d.ignored).toBe(0);
    expect(d.messages).toEqual([]);
  });
  it("a rejection keeps Meta's reason", () => {
    expect(parseDelivery(verdict({ event: "REJECTED", message_template_name: "t", reason: "INCORRECT_CATEGORY" })).templates)
      .toEqual([{ name: "t", status: "REJECTED", reason: "INCORRECT_CATEGORY" }]);
  });
  it("paused reads as disabled (switched off), reinstated as approved again", () => {
    expect(parseDelivery(verdict({ event: "PAUSED", message_template_name: "t" })).templates?.[0].status).toBe("DISABLED");
    expect(parseDelivery(verdict({ event: "REINSTATED", message_template_name: "t" })).templates?.[0].status).toBe("APPROVED");
  });
  it("one with no name is not a verdict", () => {
    const d = parseDelivery(verdict({ event: "APPROVED" }));
    expect(d.templates).toBeUndefined();
    expect(d.ignored).toBe(1);
  });
});
