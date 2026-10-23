/**
 * The member's leads panel (v2 frames 06b·2 and 12c·2 — one design): a lead row (name, phone · day, its status pill) that
 * opens to Channel · Visit · Interested in · Budget · First contact with Open chat and Customer info. Shared by
 * Assignment › Leads by ad and Reports › Salespeople.
 */
import type { DeskCtx } from "./ctx";
import { chatRows } from "./data";
import { STATUS, type StatusName } from "../../shared/palette";

export interface PanelLead {
  id: string; name: string; sub: string; status: string; stBg: string; stFg: string; open: boolean; toggle: () => void;
  facts: [string, string][]; openChat: () => void; openInfo: () => void;
}

export function panelLeads(ctx: DeskCtx, ids: string[], openId: string | null, setOpen: (id: string | null) => void): PanelLead[] {
  const { data, now, patch } = ctx;
  const stOf = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const visitOf = (cid: string) => data.visits.filter(x => x.customerId === cid && x.state === "booked" && new Date(x.start).getTime() >= now.getTime()).sort((p, q) => p.start.localeCompare(q.start))[0];
  return ids.map(id => data.customers.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(c => {
      const st = STATUS[(stOf.get(c.id) ?? "") as StatusName], vis = visitOf(c.id), vAt = vis ? new Date(vis.start) : null, open = openId === c.id;
      return { id: c.id, name: c.name, sub: [c.phone, when(c.createdAt)].filter(Boolean).join(" · "),
        status: stOf.get(c.id) ?? "", stBg: st?.tint ?? "var(--crm-field)", stFg: st?.text ?? "var(--crm-muted)", open,
        toggle: () => setOpen(open ? null : c.id),
        facts: [
          ["Channel", c.channel === "whatsapp" ? "WhatsApp" : "Messenger"],
          ["Visit", vAt ? `${vAt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${vAt.toLocaleTimeString("en-MY", { hour: "numeric", minute: vAt.getMinutes() ? "2-digit" : undefined })} · ${data.rooms.find(r => r.id === vis!.showroomId)?.name ?? ""}` : "—"],
          ["Interested in", c.details.type || "—"],
          ["Budget", c.details.budget || "—"],
          ["First contact", `${when(c.createdAt)}, ${new Date(c.createdAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`],
        ],
        openChat: () => patch({ tab: "inbox", ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, pane: "docked", kind: "chat", chat: c.id, fromTeam: false, inbF: "All", whoSel: [] }),
        openInfo: () => patch({ pane: "overlay", kind: "info", infoId: c.id, visit: null }) };
    });
}
