/**
 * Cold lead templates imported from Meta (2026-11-19; the owner: a template approved in WhatsApp Manager never showed in
 * the CRM — "做导入功能"). Which of the account's templates the CRM can send, and in what shape it keeps them. Pure.
 *
 * The CRM fills one thing: the customer's first name. So a template comes in when its body has no variable or exactly
 * one ({{1}}, or a single named one — kept as {name}), its header is fixed text or a picture / video / PDF (the file is
 * attached in the CRM), and its buttons need nothing filled (quick replies, a fixed link, a phone number).
 */

/** Meta's template, as `GET /{waba}/message_templates?fields=id,name,language,status,category,parameter_format,components` answers. */
export interface MetaTemplateRow {
  id?: string; name: string; language: string; status: string; category?: string; parameter_format?: string;
  components?: { type: string; format?: string; text?: string; buttons?: { type: string; text?: string; url?: string; phone_number?: string }[] }[];
}

export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export interface TemplateButton { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone?: string }
/** What a template has beside its body (crm_templates.parts). `param` = the body variable's Meta name when it is a named one. */
export interface TemplateParts { header?: { format: HeaderFormat; text?: string }; footer?: string; buttons?: TemplateButton[]; param?: string }

export interface ImportRow { name: string; id: string; language: string; category: string; body: string; parts: TemplateParts }
export type ImportVerdict = { ok: true; row: ImportRow } | { ok: false; name: string; reason: string };

const VAR = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MEDIA: HeaderFormat[] = ["IMAGE", "VIDEO", "DOCUMENT"];

/** Meta's sample and the CRM's own (its names start crm_ — one deleted in the CRM was deleted on purpose) are left out. */
export const leftOutOfImport = (name: string) => name === "hello_world" || name.startsWith("crm_");

export function importableTemplate(t: MetaTemplateRow): ImportVerdict {
  const no = (reason: string): ImportVerdict => ({ ok: false, name: t.name, reason });
  if (t.status !== "APPROVED") return no("not approved yet");
  if ((t.category ?? "").toUpperCase() === "AUTHENTICATION") return no("a verification-code template");
  const comps = t.components ?? [];
  const bodyText = comps.find(c => c.type === "BODY")?.text?.trim() ?? "";
  if (!bodyText) return no("it has no message");
  const vars = [...new Set([...bodyText.matchAll(VAR)].map(m => m[1].trim()))];
  if (vars.length > 1) return no("it needs more than the customer's name filled in");
  const named = t.parameter_format?.toUpperCase() === "NAMED";
  if (vars.length === 1 && !named && vars[0] !== "1") return no("its variable is not {{1}}");
  const body = bodyText.replace(VAR, "{name}");
  const parts: TemplateParts = {};
  if (vars.length === 1 && named) parts.param = vars[0];

  const head = comps.find(c => c.type === "HEADER");
  if (head) {
    const format = (head.format ?? "TEXT").toUpperCase() as HeaderFormat;
    if (format === "TEXT") {
      if (VAR.test(head.text ?? "")) { VAR.lastIndex = 0; return no("its title needs something filled in"); }
      if (head.text?.trim()) parts.header = { format, text: head.text.trim() };
    } else if (MEDIA.includes(format)) parts.header = { format };
    else return no(`its top is a ${format.toLowerCase()}, which the CRM cannot send`);
  }
  const foot = comps.find(c => c.type === "FOOTER")?.text?.trim();
  if (foot) parts.footer = foot;

  const buttons: TemplateButton[] = [];
  for (const b of comps.find(c => c.type === "BUTTONS")?.buttons ?? []) {
    const type = b.type.toUpperCase(), text = (b.text ?? "").trim();
    if (type === "QUICK_REPLY") buttons.push({ type, text });
    else if (type === "URL") {
      if (!b.url || /\{\{/.test(b.url)) return no("a link button needs something filled in");
      buttons.push({ type, text, url: b.url });
    } else if (type === "PHONE_NUMBER") buttons.push({ type, text, phone: b.phone_number ?? "" });
    else return no(`a ${type.toLowerCase().replace(/_/g, " ")} button, which the CRM cannot send`);
  }
  if (buttons.length) parts.buttons = buttons;

  return { ok: true, row: { name: t.name, id: t.id ?? "", language: t.language, category: (t.category ?? "MARKETING").toUpperCase(), body, parts } };
}

/** Meta's whole list → what to import and what was left out, with why (Meta's sample and the CRM's own say nothing). */
export function importPlan(rows: MetaTemplateRow[]): { rows: ImportRow[]; skipped: { name: string; reason: string }[] } {
  const out: ImportRow[] = [], skipped: { name: string; reason: string }[] = [];
  for (const t of rows) {
    if (leftOutOfImport(t.name)) continue;
    const v = importableTemplate(t);
    if (v.ok) out.push(v.row);
    else if (t.status === "APPROVED") skipped.push({ name: v.name, reason: v.reason });
  }
  return { rows: out, skipped };
}

/** A header file's WhatsApp kind, from the template's header format. */
export const headerKind = (f: HeaderFormat | undefined): "image" | "video" | "document" | null =>
  f === "IMAGE" ? "image" : f === "VIDEO" ? "video" : f === "DOCUMENT" ? "document" : null;

/** The file types each header takes (as the bucket and crm_template_header hold them). */
export const HEADER_ACCEPT: Record<"IMAGE" | "VIDEO" | "DOCUMENT", string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
/** WhatsApp's limits for a header file. */
export const HEADER_MAX: Record<"IMAGE" | "VIDEO" | "DOCUMENT", number> = { IMAGE: 5 * 1024 * 1024, VIDEO: 16 * 1024 * 1024, DOCUMENT: 100 * 1024 * 1024 };

/** What Import from Meta says when it is done. */
export function importToast(r: { added: number; skipped: { name: string; reason: string }[] }): string {
  const head = r.added ? `Imported ${r.added} from Meta · switch ${r.added === 1 ? "it" : "them"} on to use` : "Nothing new in Meta to import";
  if (!r.skipped.length) return head;
  const first = r.skipped[0];
  return `${head} · ${r.skipped.length} left out — ${first.name}: ${first.reason}${r.skipped.length > 1 ? ` (+${r.skipped.length - 1})` : ""}`;
}

/**
 * What the chat keeps under a template's words (2026-11-19, the owner: the GRR template reached the customer with its
 * three buttons, the CRM's bubble showed none — "要，修一下"): its footer, then each button on a line of its own, as the
 * customer's WhatsApp draws them under the message. Kept in the message's own words, so every chat shows it.
 */
export function templateTail(p: { footer?: string; buttons?: string[] }): string {
  const lines = [...(p.footer?.trim() ? [p.footer.trim()] : []), ...(p.buttons ?? []).filter(b => b.trim()).map(b => `↩ ${b.trim()}`)];
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}
