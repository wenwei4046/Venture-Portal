/**
 * Contacts (design 3b): every customer A–Z with rust letter headers and a side
 * index, "Status · phone", a call button; swipe left for Edit (rename and phone
 * inline) / Delete (off this person's list). Tap → customer info → Open chat.
 */
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { STATUS_LABEL, ini, stop, type PEvent, type SalesCtx } from "./common";
import { customerFormVM, infoRows, phoneLabel, telHref } from "./customer";

const letterOf = (n: string) => { const c = n.trim().charAt(0).toUpperCase(); return c >= "A" && c <= "Z" ? c : "#"; };
const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export function contactsVM(ctx: SalesCtx) {
  const { ui, set, patch, mine, refs, act, data } = ctx;
  const cq = ui.cq.trim().toLowerCase(), digits = cq.replace(/\D/g, "");
  const people = mine
    .filter(c => !cq || c.name.toLowerCase().includes(cq) || (digits.length >= 3 && c.phone.replace(/\D/g, "").replace(/^60/, "0").includes(digits.replace(/^60/, "0"))))
    .sort((a, b) => a.name.localeCompare(b.name));
  const OPEN = -144;
  const contacts = people.map((c, n) => {
    const sw = ui.cSwipe && ui.cSwipe.id === c.id ? ui.cSwipe : null, ed = ui.rename && ui.rename.id === c.id;
    const L = letterOf(c.name), head = n === 0 || letterOf(people[n - 1].name) !== L ? L : "";
    const save = async (e?: { stopPropagation(): void }) => {
      e?.stopPropagation();
      const r = ui.rename; if (!r) return;
      const name = r.v.trim() || c.name, phone = r.ph.trim();
      patch({ rename: null });
      await act.saveDetails(c.id, { name, phone, type: c.details.type, size: c.details.size, loc: c.details.loc, req: c.details.req, budget: c.details.budget });
    };
    const cancel = (e?: { stopPropagation(): void }) => { e?.stopPropagation(); patch({ rename: null }); };
    const sx = sw ? sw.x : 0;
    return {
      head, name: c.name, ini: ini(c.name), status: STATUS_LABEL[c.status], phone: phoneLabel(c.phone) || "—", tel: telHref(c.phone), hasTel: !!c.phone.replace(/\D/g, ""),
      sx, sTrans: sw && sw.drag ? "none" : "transform 220ms ease", actOp: sx < -4 ? 1 : 0,
      open: () => { if (refs.moved) { refs.moved = false; return; } if (sw) { patch({ cSwipe: null }); return; } if (!ui.rename) patch({ cInfo: c.id, cSwipe: null }); },
      sDown: (e: PEvent) => { if (ui.rename) return; refs.cs = { id: c.id, x0: e.clientX, b: sx }; refs.moved = false; },
      sMove: (e: PEvent) => {
        const d = refs.cs; if (!d || d.id !== c.id) return;
        const dx = e.clientX - d.x0; if (Math.abs(dx) > 6) refs.moved = true; if (!refs.moved) return;
        patch({ cSwipe: { id: c.id, x: Math.max(OPEN - 20, Math.min(0, d.b + dx)), drag: true } });
      },
      sUp: () => {
        const d = refs.cs; refs.cs = null; if (!d || d.id !== c.id || !refs.moved) return;
        const x = ui.cSwipe?.id === c.id ? ui.cSwipe.x : 0;
        patch({ cSwipe: x < -60 ? { id: c.id, x: OPEN, drag: false } : null });
      },
      // Delete: off this person's Contacts and Inbox; the customer stays in the CRM.
      del: async (e: MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Delete ${c.name} from contacts?`)) { patch({ cSwipe: null }); await act.setPref(c.id, { hidden: true }); }
        else patch({ cSwipe: null });
      },
      editing: !!ed, view: !ed, draft: ed ? ui.rename!.v : "", draftPh: ed ? ui.rename!.ph : "", stop,
      edit: (e: MouseEvent) => { e.stopPropagation(); patch({ cSwipe: null, rename: { id: c.id, v: c.name, ph: phoneLabel(c.phone) } }); },
      type: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => (u.rename ? { ...u, rename: { ...u.rename, v } } : u)); },
      typePh: (e: ChangeEvent<HTMLInputElement>) => { const ph = e.target.value; set(u => (u.rename ? { ...u, rename: { ...u.rename, ph } } : u)); },
      key: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") void save(); if (e.key === "Escape") cancel(); },
      save, cancel,
      rule: "0", lineBg: head ? "transparent" : "#EBDDD2",
    };
  });
  const have = new Set(contacts.map(p => letterOf(p.name)));
  const ci = ui.cInfo ? data.customers.find(c => c.id === ui.cInfo) : undefined;
  return {
    cq: ui.cq, setCq: (e: ChangeEvent<HTMLInputElement>) => patch({ cq: e.target.value }),
    contacts, contactsEmpty: !contacts.length, // stop comes with the customer form below
    azIndex: AZ.map((l, k) => ({
      l, color: have.has(l) ? "#BD4A19" : "#C9B5A8",
      go: (e: MouseEvent<HTMLElement>) => {
        const list = e.currentTarget.parentElement?.parentElement?.querySelector<HTMLElement>("[data-contacts-list]");
        if (!list) return;
        const target = AZ.slice(k).concat(AZ.slice(0, k).reverse()).find(x => have.has(x));
        const el = target && list.querySelector<HTMLElement>(`[data-letter="${target}"]`);
        if (el) list.scrollTop = el.offsetTop - list.offsetTop - 4;
      },
    })),
    ctOpen: !!ci, ctClose: () => patch({ cInfo: null }), ctName: ci?.name ?? "", ctIni: ci ? ini(ci.name) : "",
    ctRows: ci ? infoRows(ci) : [],
    ctChat: () => { if (!ci) return; set(u => ({ ...u, tab: "inbox", chat: ci.id, cInfo: null, hist: [...u.hist, u.tab].slice(-20) })); act.openChat(ci.id); },
    ctEdit: () => { if (!ci) return; set(u => ({ ...u, cform: { customerId: ci.id, edit: true }, cInfo: null })); },
    ...customerFormVM(ctx),
  };
}
export type ContactsVM = ReturnType<typeof contactsVM>;
