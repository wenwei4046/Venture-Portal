/**
 * Channels (CRM Desktop v2, README › 7): Meta's settings in the CRM — Connections · Facebook Page · Messenger ·
 * WhatsApp · Templates · Ads — on what Meta answers (crm-channels-actions.ts › fetchCrmChannels). The Principal and the
 * Director edit (CRM · Manage); everybody else who opens the desktop reads, with the banner. A tab's changes are drafts
 * (an amber dot on the tab) until "Save to Meta", which sends them through the Graph API and, on Meta's yes, records
 * them (the Audit log). Linked / unlinked and the default are the CRM's own (crm_set_channel): an unlinked Page or
 * number's messages no longer come into Inbox.
 * What the API does not give or change opens Meta instead (README › Data sources): linking a new Page, number or
 * account (Embedded Signup), a WhatsApp display-name change, the username, the official business account, call
 * settings and the call log, the ads' budgets and pausing (ads_management waits for Meta's review), a Page's pictures.
 */
import type { MetaChannels } from "@/app/(member)/member/crm-channels-actions";
import { HOUR_DAYS, LANG_WORDS, WA_VERTICALS, limitWords, parseHours, qualityWords } from "@/lib/meta/channels";
import type { DeskCtx } from "./ctx";
import { MON } from "./insight";

const META_SUITE = "https://business.facebook.com/latest/settings";
const WA_MANAGER = "https://business.facebook.com/wa/manage/phone-numbers/";
const ADS_MANAGER = "https://adsmanager.facebook.com/";
const open = (url: string) => { if (typeof window !== "undefined") window.open(url, "_blank", "noopener"); };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ago = (iso: string | null, now: Date) => { if (!iso) return null; const m = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const spaced = (id: string) => id.replace(/(\d{4})(?=\d)/g, "$1 ");

export interface MetaState { data: MetaChannels | null; loading: boolean; error: string; reload(): void; /** This site, set after the first paint. */ origin: string }

export function channelsVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now, meta } = ctx;
  const can = data.can.manage;
  const M = meta.data;
  const tab = ui.chTab;
  const D = ui.chDraft as Record<string, unknown>;
  const g = <T,>(k: string, d: T): T => (k in D ? (D[k] as T) : d);
  const put = (k: string, v: unknown) => set(u => ({ ...u, chDraft: { ...u.chDraft, [k]: v }, chDirty: { ...u.chDirty, [u.chTab]: true } }));
  const toast = (t: string) => patch({ toast: t });
  const TABS: [typeof ui.chTab, string][] = [["conn", "Connections"], ["page", "Facebook Page"], ["msgr", "Messenger"], ["wa", "WhatsApp"], ["tpl", "Templates"], ["ads", "Ads"]];
  const dirty = !!ui.chDirty[tab];
  const linkOf = (kind: string, id: string) => M?.links.find(l => l.kind === kind && l.externalId === id);
  const isLinked = (kind: string, id: string) => linkOf(kind, id)?.linked ?? true;

  // The assets: our Pages, our WhatsApp numbers (Instagram and ads accounts are not connected to the CRM yet).
  const pages = (M?.pages ?? []).map(p => ({ ...p, on: isLinked("page", p.id) }));
  const nums = (M?.wa ?? []).map(n => ({ ...n, on: isLinked("wa", n.id) }));
  const defOf = <T extends { id: string; on: boolean }>(kind: string, xs: T[]) => xs.find(x => x.on && linkOf(kind, x.id)?.isDefault)?.id ?? xs.find(x => x.on)?.id ?? null;
  const pageDef = defOf("page", pages), waDef = defOf("wa", nums);
  const page = pages.find(p => p.id === pageDef) ?? pages[0];

  const setLink = (kind: "page" | "wa", id: string, name: string, linked: boolean, isDefault: boolean, done: string) =>
    void ctx.deskAct.setChannel(kind, id, name, linked, isDefault).then(ok => { if (ok) { toast(done); meta.reload(); } });
  const GT: Record<string, [string, string, string, string, string]> = {
    page: ["Facebook Pages", "Messages from these Pages come into Inbox", "#1877F2", "f", "Link a Page"],
    wa: ["WhatsApp numbers", "Each number has its own chats and templates", "#25D366", "W", "Add a number"],
    ig: ["Instagram", "Direct messages come into Inbox", "#C13584", "IG", "Link an account"],
    ads: ["Ads accounts", "Ads Performance and Assignment read from here", "#BD4A19", "Ad", "Link an account"],
  };
  type Row = { id: string; name: string; sub: string; on: boolean };
  const rowsOf: Record<string, Row[]> = {
    page: pages.map(p => ({ id: p.id, name: p.name, sub: `Facebook Page${p.followers != null ? ` · ${p.followers >= 1000 ? `${(p.followers / 1000).toFixed(1)}k` : p.followers} followers` : ""}`, on: p.on })),
    wa: nums.map(n => ({ id: n.id, name: n.number, sub: `${n.verifiedName || "WhatsApp"} · Quality ${qualityWords(n.quality)} · ${limitWords(n.limit).replace(" / day", " chats / day")}`, on: n.on })),
    ig: [], ads: [],
  };
  const defs: Record<string, string | null> = { page: pageDef, wa: waDef, ig: null, ads: null };
  const chGroups = Object.entries(GT).map(([k, [title, desc, c, ini, addL]]) => ({ title, desc, c, ini, addL, n: `${rowsOf[k].filter(x => x.on).length} linked`,
    add: () => { if (can) patch({ chDlg: { kind: "link", id: k } }); },
    rows: rowsOf[k].map((x, i) => ({ ...x, id: spaced(x.id), def: x.on && defs[k] === x.id, off: !x.on, notDef: x.on && defs[k] !== x.id, stL: x.on ? "Linked" : "Unlinked", stC: x.on ? "#387557" : "#A08E82",
      bt: i ? "1px solid #F5EEE8" : "0", op: x.on ? 1 : 0.55,
      setDef: () => { if (can && (k === "page" || k === "wa")) setLink(k, x.id, x.name, true, true, `${x.name} is the default`); },
      unlink: () => { if (can) patch({ chDlg: { kind: "unlink", id: `${k}:${x.id}` } }); },
      relink: () => { if (can && (k === "page" || k === "wa")) setLink(k, x.id, x.name, true, false, `${x.name} linked again`); } })) }));

  // The dialogs: Unlink (the CRM's own), and "Link …" — Embedded Signup is Meta's, so Continue opens Meta.
  const dlg = ui.chDlg;
  const UNLINK: Record<string, string> = { page: "Messages from this Page stop coming into Inbox. Chats you already have stay.", wa: "This number stops sending and receiving in the CRM. Chats you already have stay. The number stays in your Meta account.",
    ig: "Instagram messages stop coming into Inbox. Chats you already have stay.", ads: "Ads Performance and Assignment stop reading this account." };
  // One shape for every dialog the design draws (Add a number's two steps and Link's picker are Meta's now: never shown).
  const NODLG = { isUnlink: false, isLink1: false, isLink2: false, isWa1: false, isWa2: false, title: "", body: "", confirm: () => {}, next: () => {},
    cands: [] as { n: string; sub: string; bd: string; chk: string; bg: string; toggle: () => void }[], linkBg: "#E2CFC1", num: "", setNum: () => {},
    vias: [] as { v: string; bg: string; fg: string; sh: string; pick: () => void }[], nextBg: "#E2CFC1", sentTo: "", code: "", setCode: () => {}, resend: () => {} };
  const chDlg = !dlg ? NODLG : dlg.kind === "unlink" ? (() => { const [k, id] = dlg.id.split(":"); const x = rowsOf[k]?.find(r => r.id === id);
    return { ...NODLG, isUnlink: true, title: `Unlink ${x?.name ?? "this"}?`, body: UNLINK[k] ?? "",
      confirm: () => { patch({ chDlg: null }); if (x && (k === "page" || k === "wa")) setLink(k, x.id, x.name, false, false, `${x.name} unlinked`); } }; })()
    : { ...NODLG, isLink1: true, title: GT[dlg.id]?.[4] ?? "Link", next: () => { patch({ chDlg: null }); open(dlg.id === "wa" ? WA_MANAGER : META_SUITE); toast("Opened Meta — link it there, then Refresh here"); } };

  // Facebook Page.
  const field = (k: string, label: string, d: string, opt: { max?: number; long?: boolean; ph?: string } = {}) => { const val = g(k, d);
    return { k, label, val, ph: opt.ph ?? "", max: opt.max ?? 0, count: opt.max ? `${val.length} / ${opt.max}` : "", long: !!opt.long, short: !opt.long, over: !!opt.max && val.length > opt.max,
      cc: opt.max && val.length > opt.max ? "#B3261E" : "#A08E82", set: (e: { target: { value: string } }) => put(k, e.target.value), ro: !can }; };
  const hours0 = parseHours(page?.hours ?? null);
  const hours = DAYS.map((d, i) => { const v0 = g<{ open: boolean; from: string; to: string }>(`h${i}`, hours0[i]);
    return { d, open: v0.open, closed: !v0.open, from: v0.from, to: v0.to, trk: v0.open ? "#387557" : "#E2D6CC", knob: v0.open ? "18px" : "2px",
      toggle: () => { if (can) put(`h${i}`, { ...v0, open: !v0.open }); }, setFrom: (e: { target: { value: string } }) => put(`h${i}`, { ...v0, from: e.target.value }), setTo: (e: { target: { value: string } }) => put(`h${i}`, { ...v0, to: e.target.value }) }; });
  // Messenger.
  const msgr = page?.msgr;
  const ib = g<string[]>("ice", msgr?.ice ?? []);
  const menu = g<{ title: string; type: string }[]>("menu", msgr?.menu ?? []);
  // WhatsApp.
  const live = nums.filter(n => n.on);
  const wn = live.find(n => n.id === ui.chWaNum) ?? live.find(n => n.id === waDef) ?? live[0];
  const wsub = ui.chWaTab;
  const prof = wn?.profile;
  const wk = (k: string) => `wa:${wn?.id ?? ""}:${k}`;
  const wf = (k: string, label: string, d: string, max: number, opt: { long?: boolean; ph?: string } = {}) => { const val = g(wk(k), d);
    return { label, opt: true, val, ph: opt.ph ?? "", count: `${val.length}/${max}`, cc: val.length > max ? "#B3261E" : "#A08E82", long: !!opt.long, short: !opt.long, set: (e: { target: { value: string } }) => put(wk(k), e.target.value) }; };
  const vertical = g(wk("vertical"), prof?.vertical || "OTHER");
  const nameSt = (wn?.nameStatus ?? "").toUpperCase();
  const dnSt = nameSt === "APPROVED" || nameSt === "AVAILABLE_WITHOUT_REVIEW" ? "Approved" : nameSt.includes("PENDING") ? "In review" : nameSt === "DECLINED" || nameSt === "REJECTED" ? "Rejected" : nameSt ? "In review" : "Approved";
  const DNC: Record<string, [string, string]> = { Approved: ["#E8F3ED", "#387557"], "In review": ["#FFF0CC", "#A46312"], Rejected: ["#F8E1D8", "#A3371A"] };
  // Insights: what the CRM itself knows of this number's last 30 days (Meta gives quality and the limit).
  const since = now.getTime() - 30 * 86_400_000;
  // (The CRM does not keep which of our numbers a chat came to, so these are every WhatsApp chat's.)
  const waCs = data.customers.filter(c => c.channel === "whatsapp");
  const recent = waCs.filter(c => c.messages.some(m => new Date(m.at).getTime() >= since));
  const outs = waCs.flatMap(c => c.messages.filter(m => m.from === "me" && new Date(m.at).getTime() >= since && m.status !== "sending"));
  const delivered = outs.filter(m => m.status === "delivered" || m.status === "read").length, read = outs.filter(m => m.status === "read").length;
  const pc = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(/\.0$/, "")}%` : "—");
  const auto = wn?.automation;
  const autoOn = (k: string, d: boolean) => g(wk(k), d);
  const linkMsg = g(wk("lmsg"), "Hi, I would like to book a showroom visit.");
  const waLink = wn ? `https://wa.me/${wn.number.replace(/\D/g, "")}` : "";
  // Templates.
  const STC: Record<string, [string, string]> = { Approved: ["#E8F3ED", "#387557"], Pending: ["#FFF0CC", "#A46312"], Rejected: ["#F8E1D8", "#A3371A"] };
  const stWord = (s: string) => (s === "APPROVED" ? "Approved" : s === "REJECTED" || s === "DISABLED" ? "Rejected" : "Pending");
  const nt = ui.chNew;
  // The ads (the CRM's, Meta's figures need ads_management).
  const ads = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))].map(id => { const cs = data.customers.filter(c => c.adId === id);
    return { name: cs[0]?.ad ?? id, ch: cs.some(c => c.channel === "whatsapp") ? "WhatsApp" : "Messenger", spend: "RM —", leads: cs.length, on: true, trk: "#E2D6CC", knob: "2px", stL: "—", stC: "#806B60", budget: "",
      toggle: () => { toast("Pausing an ad needs Meta's ads_management approval — opened Ads Manager"); open(ADS_MANAGER); }, setBudget: () => toast("Budgets are changed in Ads Manager until Meta approves ads_management") }; });

  const save = () => {
    if (!dirty || !can) return;
    const done = () => { set(u => ({ ...u, chDirty: { ...u.chDirty, [tab]: false }, chDraft: Object.fromEntries(Object.entries(u.chDraft).filter(([k]) => !keysOf(tab, k))) })); toast(`Sent to Meta · ${TABS.find(t => t[0] === tab)?.[1]} updated`); meta.reload(); };
    if (tab === "page" && page) void ctx.deskAct.saveMeta({ kind: "page", id: page.id, name: page.name, about: g("pAbout", page.about), phone: g("pPhone", page.phone), website: g("pWeb", page.website), email: g("pMail", page.email),
      hours: hours.map(h => ({ open: h.open, from: h.from, to: h.to })) }).then(ok => { if (ok) done(); });
    else if (tab === "msgr" && page) void ctx.deskAct.saveMeta({ kind: "msgr", id: page.id, name: page.name, profile: { greeting: g("mGreet", msgr?.greeting ?? ""), ice: ib, menu } }).then(ok => { if (ok) done(); });
    else if (tab === "wa" && wn) {
      const p = { about: g(wk("about"), prof?.about ?? ""), address: g(wk("addr"), prof?.address ?? ""), description: g(wk("desc"), prof?.description ?? ""), email: g(wk("mail"), prof?.email ?? ""),
        websites: [g(wk("web1"), prof?.websites[0] ?? ""), g(wk("web2"), prof?.websites[1] ?? "")], vertical };
      const autoChanged = ["aw", "as", "ac"].some(k => wk(k) in D);
      void ctx.deskAct.saveMeta({ kind: "wa", id: wn.id, name: wn.number, profile: p }).then(async ok => {
        if (ok && autoChanged) ok = await ctx.deskAct.saveMeta({ kind: "wa-auto", id: wn.id, name: wn.number, automation: { welcome: autoOn(wk("aw"), !!auto?.welcome),
          prompts: autoOn(wk("as"), !!auto?.prompts.length) ? (auto?.prompts.length ? auto.prompts : ib.slice(0, 4)) : [], commands: autoOn(wk("ac"), !!auto?.commands.length) ? auto?.commands ?? [] : [] } });
        if (ok) done(); });
    } else if (tab === "ads") { toast("Ads are changed in Ads Manager until Meta approves ads_management"); open(ADS_MANAGER); }
  };
  return {
    kCh: ui.tab === "channels",
    chTabs: TABS.map(([k, label]) => ({ label, on: k === tab, off: k !== tab, dot: ui.chDirty[k] ? "#A46312" : "transparent", pick: () => patch({ chTab: k, chNew: null, chNewOpen: false }) })),
    chCan: can, chRo: !can,
    // The banner: Meta's state first (read, or why not), then read-only — the states the design did not draw.
    chNote: meta.error && !M ? `Could not read Meta: ${meta.error}. Try again from Refresh.` : meta.loading && !M ? "Reading Channels from Meta…" : !can ? "Only Principal and Director can change these. You can look." : "", chConn: tab === "conn", chPage: tab === "page", chMsgr: tab === "msgr", chWa: tab === "wa", chTpl: tab === "tpl", chAds: tab === "ads", chHasSave: tab !== "conn" && tab !== "tpl",
    chDirtyNow: dirty, chSave: save, chSaveBg: dirty && can ? "#BD4A19" : "#E2CFC1",
    chDiscard: () => set(u => ({ ...u, chDraft: Object.fromEntries(Object.entries(u.chDraft).filter(([k]) => !keysOf(u.chTab, k))), chDirty: { ...u.chDirty, [u.chTab]: false } })),
    chGroups, chDlgOpen: !!dlg, chDlg, chDlgClose: () => patch({ chDlg: null }),
    chRefresh: () => { meta.reload(); toast("Channels read again from Meta"); },
    chTestHook: () => { meta.reload(); toast(M?.lastEvent ? `Last event ${ago(M.lastEvent, now)}` : "No event received yet"); },
    chTokenLine: M ? (M.set.token ? "System user token · kept on the server" : "System user token · not set on this server") : meta.loading ? "Reading Meta…" : meta.error || "—",
    chTokenMask: M?.set.token ? "•••••••••••••••• (never shown)" : "—",
    chHookLine: M?.lastEvent ? `Receiving · last event ${ago(M.lastEvent, now)}` : "No event received yet", chHookC: M?.lastEvent ? "#387557" : "#A08E82",
    chHookUrl: `${meta.origin}/api/{whatsapp,messenger}/v1/webhook`,
    chReconnect: () => open(META_SUITE), chOpenPage: () => open(page ? `https://www.facebook.com/${page.id}` : META_SUITE), chOpenWaManager: () => open(WA_MANAGER),
    chPerms: ([["Manage the Page", "pages_manage_metadata"], ["Send and read messages", "pages_messaging"], ["WhatsApp profile and templates", "whatsapp_business_management"], ["Pause ads and change budgets", "ads_management"]] as const)
      .map(([t, code]) => { const st = M?.perms?.find(p => p.permission === code)?.status; const ok = st === "granted";
        return { t, code, stt: ok ? "Granted" : M?.perms ? "Needs Meta review" : "View in Meta", bg: ok ? "#E8F3ED" : "#FFF0CC", fg: ok ? "#387557" : "#A46312" }; }),
    chPageF: [field("pAbout", "About", page?.about ?? "", { max: 255, long: true }), field("pPhone", "Phone", page?.phone ?? ""), field("pWeb", "Website", page?.website ?? ""), field("pMail", "Email", page?.email ?? "")],
    chHours: hours, chPageName: page?.name ?? "Your Page", chPageIni: (page?.name ?? "H").trim().charAt(0).toUpperCase(),
    chGreetHint: "Shown before someone sends the first message. {{user_first_name}} becomes their first name.",
    chGreet: field("mGreet", "Greeting", msgr?.greeting ?? "", { max: 160, long: true }),
    chIce: ib.map((q, i) => ({ q, n: i + 1, set: (e: { target: { value: string } }) => { const a = [...ib]; a[i] = e.target.value; put("ice", a); }, remove: () => { if (can) put("ice", ib.filter((_, j) => j !== i)); } })),
    chIceAdd: () => { if (can && ib.length < 4) put("ice", [...ib, ""]); }, chIceCanAdd: ib.length < 4, chIceN: `${ib.length} of 4`,
    chMenu: menu.map((m, i) => ({ l: m.title, t: m.type, set: (e: { target: { value: string } }) => { const a = menu.map(x => ({ ...x })); a[i].title = e.target.value; put("menu", a); }, remove: () => { if (can) put("menu", menu.filter((_, j) => j !== i)); } })),
    chMenuAdd: () => { if (can && menu.length < 5) put("menu", [...menu, { title: "", type: "Reply" }]); },
    // WhatsApp.
    waNums: live.map(n => ({ name: n.number, region: "MY · Malaysia", bg: n.id === wn?.id ? "#FFF5EC" : "#fff", bd: n.id === wn?.id ? "#BD4A19" : "transparent", pick: () => patch({ chWaNum: n.id, chWaTab: "prof" }) })),
    waCount: live.length, waAdd: () => { if (can) { open(WA_MANAGER); toast("Opened WhatsApp Manager — add the number there, then Refresh here"); } },
    wn: { name: wn?.number ?? "—", disp: wn?.verifiedName || "—", id: wn?.id ?? "", cat: WA_VERTICALS.find(v => v[0] === vertical)?.[1] ?? "Other" }, waIni: (wn?.verifiedName || "W").charAt(0).toUpperCase(),
    waSubs: ([["insights", "Insights"], ["prof", "Profile"], ["auto", "Automations"], ["links", "Message links"], ["calls", "Call settings"], ["log", "Call log"]] as const)
      .map(([k, label]) => ({ label, on: k === wsub, off: k !== wsub, pick: () => patch({ chWaTab: k }) })),
    waIns: wsub === "insights", waProf: wsub === "prof", waAuto: wsub === "auto", waLinks: wsub === "links", waCalls: wsub === "calls", waLog: wsub === "log",
    // A display name is changed through Meta's review in WhatsApp Manager.
    waDn: { st: dnSt, bg: DNC[dnSt][0], fg: DNC[dnSt][1], editing: false, notEditing: true, edit: () => { if (can) open(WA_MANAGER); }, draft: wn?.verifiedName ?? "", setDraft: () => {}, cancel: () => {}, submit: () => {} },
    waCatOpen: ui.chDlg?.kind === "cat", waCatToggle: () => { if (can) patch({ chDlg: ui.chDlg?.kind === "cat" ? null : { kind: "cat", id: "" } }); },
    waCats: WA_VERTICALS.map(([k, c]) => ({ c, bg: k === vertical ? "#FFF5EC" : "transparent", pick: () => { put(wk("vertical"), k); patch({ chDlg: null }); } })),
    waF: [wf("desc", "Description", prof?.description ?? "", 512, { long: true }), wf("addr", "Address", prof?.address ?? "", 256, { ph: "Business address" }), wf("mail", "Email", prof?.email ?? "", 128, { ph: "Business email" })],
    waWeb: [wf("web1", "Website", prof?.websites[0] ?? "", 256, { ph: "https://www.example.com" }), wf("web2", "", prof?.websites[1] ?? "", 256, { ph: "https://www.example.com" })],
    waFb: `${pages.filter(p => p.on).length} Page linked`, waIg: "", waIgNone: true, waIgHas: false, waIgLink: () => { if (can) open(META_SUITE); },
    waUser: "", waUserNone: true, waUserHas: false, waUserCreate: () => { if (can) open(WA_MANAGER); },
    waOba: "", waObaNone: true, waObaHas: false, waObaReq: () => { if (can) open(WA_MANAGER); },
    waStats: [["Conversations · 30 days", String(recent.length)], ["Delivered", pc(delivered, outs.length)], ["Read", pc(read, outs.length)], ["Quality rating", qualityWords(wn?.quality ?? "")],
      ["Messaging limit", limitWords(wn?.limit ?? "")], ["Blocked by customers", "View in Meta"]].map(([k, v]) => ({ k, v })),
    waAutoRows: ([["Welcome message", "Sent when someone messages for the first time", autoOn(wk("aw"), !!auto?.welcome), "aw"], ["Conversation starters", "Up to 4 questions people can tap", autoOn(wk("as"), !!auto?.prompts.length), "as"],
      ["Commands", "Shortcuts like /visit or /price", autoOn(wk("ac"), !!auto?.commands.length), "ac"]] as const)
      .map(([t, sub, on, k]) => ({ t, sub, trk: on ? "#387557" : "#E2D6CC", knob: on ? "18px" : "2px", toggle: () => { if (can) put(wk(k), !on); } })),
    waLink, waLinkMsg: linkMsg, setWaLinkMsg: (e: { target: { value: string } }) => set(u => ({ ...u, chDraft: { ...u.chDraft, [wk("lmsg")]: e.target.value } })),
    waCopy: () => { void navigator.clipboard?.writeText(`${waLink}?text=${encodeURIComponent(linkMsg)}`).catch(() => {}); toast("Link copied"); },
    waCallRows: [["Allow voice calls", "Customers can call this number from WhatsApp"], ["Show call button", "A call icon in the chat header"]]
      .map(([t, sub]) => ({ t, sub, trk: "#E2D6CC", knob: "2px", toggle: () => { open(WA_MANAGER); toast("Calls are set in WhatsApp Manager"); } })),
    waCallLog: [{ n: "Call history", t: "Kept by WhatsApp — View in WhatsApp Manager", at: "", c: "#806B60" }],
    // Templates (WhatsApp's own list).
    chTplHint: "Message · use {{1}}, {{2}} for the customer's name, date…", chTplPh: "Hi {{1}}, your showroom visit is on {{2}}. See you there!",
    chTpls: (M?.templates ?? []).map(t => { const st = stWord(t.status); return { n: t.name, c: t.category.charAt(0) + t.category.slice(1).toLowerCase(), l: LANG_WORDS[t.language] ?? t.language, stt: st, at: "—", bg: STC[st][0], fg: STC[st][1] }; }),
    chNewOpen: !!nt, chNewToggle: () => { if (can) patch({ chNew: nt ? null : { name: "", cat: "Marketing", lang: "English", body: "" } }); },
    chNewF: nt ? { name: nt.name, body: nt.body,
      cats: ["Marketing", "Utility"].map(c => ({ c, on: c === nt.cat, bg: c === nt.cat ? "#fff" : "transparent", fg: c === nt.cat ? "#3F2B22" : "#806B60", sh: c === nt.cat ? "0 1px 2px rgba(63,43,34,.12)" : "none", pick: () => patch({ chNew: { ...nt, cat: c } }) })),
      langs: ["English", "Bahasa Melayu", "Chinese"].map(c => ({ c, bg: c === nt.lang ? "#fff" : "transparent", fg: c === nt.lang ? "#3F2B22" : "#806B60", sh: c === nt.lang ? "0 1px 2px rgba(63,43,34,.12)" : "none", pick: () => patch({ chNew: { ...nt, lang: c } }) })),
      setName: (e: { target: { value: string } }) => patch({ chNew: { ...nt, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } }),
      setBody: (e: { target: { value: string } }) => patch({ chNew: { ...nt, body: e.target.value } }),
      submit: () => { if (!nt.name || !nt.body) return; void ctx.deskAct.saveMeta({ kind: "template", template: { name: nt.name, category: nt.cat, language: nt.lang, body: nt.body } })
        .then(ok => { if (ok) { patch({ chNew: null }); toast("Sent to Meta for review · usually within 24 h"); meta.reload(); } }); } }
      : { name: "", body: "", cats: [] as { c: string; on: boolean; bg: string; fg: string; sh: string; pick: () => void }[], langs: [] as { c: string; bg: string; fg: string; sh: string; pick: () => void }[], setName: () => {}, setBody: () => {}, submit: () => {} },
    chAdsRows: ads, chMonth: MON[now.getMonth()].slice(0, 3).toUpperCase(),
  };
}

/** A draft key belongs to a tab: Page's p…/h…, Messenger's m…/ice/menu, WhatsApp's wa:…. */
function keysOf(tab: string, k: string): boolean {
  if (tab === "page") return /^p[A-Z]/.test(k) || /^h\d$/.test(k);
  if (tab === "msgr") return k === "ice" || k === "menu" || /^m[A-Z]/.test(k);
  if (tab === "wa") return k.startsWith("wa:");
  return false;
}
export { HOUR_DAYS };
