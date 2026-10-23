"use server";

/**
 * Channels (CRM Desktop v2, README › 7): the Meta settings, read and saved from the CRM. Reads ask CRM · View (the
 * desktop's readers); every save asks CRM · Manage (the Principal and the Revenue Director — the database asks the same
 * in crm_set_channel / crm_note_channel_save), goes to Meta with the System User token on the server, and only once
 * Meta said yes is it recorded (crm_note_channel_save — the Audit log's record of who changed which channel). The
 * token never reaches the browser. What Meta does not give through the API the page sends to Meta ("View in Meta").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { createClient } from "@/lib/supabase/server";
import { pageToken } from "@/lib/messenger/send";
import {
  graph, hoursBody, messengerProfileBody, postJson, readMessengerProfile, readPage, readPermissions, readTemplates, readWaAutomation, readWaNumbers, readWaProfile,
  templateBody, pageProfileBody, uploadWaPhoto, waProfileBody, type BusinessProfile, type MessengerProfile, type MetaPermission, type MetaTemplate, type PageInfo, type WaAutomation, type WaNumber, type WaProfile,
} from "@/lib/meta/channels";

export interface ChannelLink { kind: "page" | "wa" | "ig" | "ads"; externalId: string; name: string; linked: boolean; isDefault: boolean; updatedAt: string }
export interface MetaChannels {
  pages: (PageInfo & { msgr: MessengerProfile | null })[];
  wa: (WaNumber & { profile: WaProfile | null; automation: WaAutomation | null })[];
  templates: MetaTemplate[] | null;
  perms: MetaPermission[] | null;
  lastEvent: string | null;
  links: ChannelLink[];
  /** What is set on the server (yes / no only): the token, the WhatsApp account, the Pages. */
  set: { token: boolean; waba: boolean; pages: boolean };
}

async function crmMay(need: "view" | "manage") {
  const user = await getMemberUser();
  if (!user?.is_active) throw new Error("Sign in with an active work account.");
  const account = await getAccountUser();
  if (!account?.is_active || !(need === "manage" ? canDo(account, "crm", "manage") : canDo(account, "crm", "view", "own"))) throw new Error("You may not do that.");
  return (await createClient()) as unknown as SupabaseClient;
}
const env = () => ({ token: process.env.META_SYSTEM_USER_TOKEN?.trim() ?? "", waba: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "",
  pages: (process.env.META_PAGE_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean) });

export async function fetchCrmChannels(): Promise<{ ok: true; data: MetaChannels } | { ok: false; error: string }> {
  try {
    const db = await crmMay("view");
    const { token, waba, pages } = env();
    // The CRM's own record: which assets are linked, which is the default (soft — the table comes with mig 20261015100000).
    const links = await db.from("crm_channels").select("kind, external_id, name, linked, is_default, updated_at").then(r => (r.error ? [] : (r.data ?? [])));
    const last = await db.from("crm_channel_events").select("received_at").order("received_at", { ascending: false }).limit(1).then(r => (r.error ? null : (r.data?.[0]?.received_at as string | undefined) ?? null), () => null);
    const pageRows = !token ? [] : await Promise.all(pages.map(async id => {
      const pt = await pageToken(id, token);
      const info = await readPage(id, pt ?? token);
      const msgr = pt ? await readMessengerProfile(pt) : null;
      return info ? { ...info, msgr } : { id, name: `Page ${id}`, followers: null, about: "", phone: "", website: "", email: "", hours: null, picture: null, msgr };
    }));
    const nums = token && waba ? (await readWaNumbers(waba, token)) ?? [] : [];
    const wa = await Promise.all(nums.map(async n => ({ ...n, profile: await readWaProfile(n.id, token), automation: await readWaAutomation(n.id, token) })));
    return { ok: true, data: {
      pages: pageRows, wa, templates: token && waba ? await readTemplates(waba, token) : null, perms: token ? await readPermissions(token) : null, lastEvent: last,
      links: (links as { kind: ChannelLink["kind"]; external_id: string; name: string; linked: boolean; is_default: boolean; updated_at: string }[])
        .map(l => ({ kind: l.kind, externalId: l.external_id, name: l.name, linked: l.linked, isDefault: l.is_default, updatedAt: l.updated_at })),
      set: { token: !!token, waba: !!waba, pages: pages.length > 0 },
    } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 250) : "Channels could not be read." };
  }
}

type Save =
  | { kind: "page"; id: string; name: string; about: string; phone: string; website: string; email: string; hours: { open: boolean; from: string; to: string }[] }
  | { kind: "msgr"; id: string; name: string; profile: MessengerProfile }
  | { kind: "wa"; id: string; name: string; profile: WaProfile }
  | { kind: "wa-auto"; id: string; name: string; automation: WaAutomation }
  | { kind: "wa-name"; id: string; name: string; newName: string }
  | { kind: "template"; template: { name: string; category: string; language: string; body: string } };

/** Send one tab's changes to Meta; on Meta's yes, record what was saved. */
export async function saveCrmChannel(s: Save): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const db = await crmMay("manage");
    const { token, waba, pages } = env();
    if (!token) throw new Error("Meta is not connected on this server yet.");
    const note = (kind: "page" | "wa", id: string, name: string, saved: Record<string, unknown>) =>
      db.rpc("crm_note_channel_save", { p_kind: kind, p_external: id, p_name: name, p_saved: saved }).then(() => undefined, () => undefined);
    if (s.kind === "page" || s.kind === "msgr") {
      if (!pages.includes(s.id)) throw new Error("That Page is not one of ours.");
      const pt = await pageToken(s.id, token);
      if (!pt) throw new Error("Meta did not give the Page's access. Reconnect it in Meta Business Suite.");
      if (s.kind === "page") {
        const body = { about: s.about.slice(0, 255), phone: s.phone, website: s.website, emails: s.email ? [s.email] : [], hours: hoursBody(s.hours) };
        const r = await postJson(graph(s.id), pt, body);
        if (!r.ok) return r;
        await note("page", s.id, s.name, { about: body.about, phone: s.phone, website: s.website, email: s.email, hours: body.hours });
      } else {
        const r = await postJson(graph("me/messenger_profile"), pt, messengerProfileBody(s.profile));
        if (!r.ok) return r;
        await note("page", s.id, s.name, { greeting: s.profile.greeting, ice_breakers: s.profile.ice, menu: s.profile.menu.map(m => m.title) });
      }
      return { ok: true };
    }
    // A new display name (the owner, 2026-10-23: edited here, not in Meta): a request Meta reviews, usually 1–2 days.
    if (s.kind === "wa-name") {
      if (!waba) throw new Error("The WhatsApp account is not set on this server yet.");
      if (!/^d{5,32}$/.test(s.id)) throw new Error("Choose the number again.");
      const nn = s.newName.trim().slice(0, 120);
      if (!nn) throw new Error("Type the new display name.");
      const r = await postJson(graph(s.id), token, { new_display_name: nn });
      if (!r.ok) return r;
      await note("wa", s.id, s.name, { name_request: nn });
      return { ok: true };
    }
    if (s.kind === "wa" || s.kind === "wa-auto") {
      if (!waba) throw new Error("The WhatsApp account is not set on this server yet.");
      if (!/^\d{5,32}$/.test(s.id)) throw new Error("Choose the number again.");
      if (s.kind === "wa") {
        const p = s.profile;
        const r = await postJson(graph(`${s.id}/whatsapp_business_profile`), token, { messaging_product: "whatsapp", about: p.about.slice(0, 139), address: p.address.slice(0, 256),
          description: p.description.slice(0, 512), email: p.email.slice(0, 128), websites: p.websites.map(w => w.trim()).filter(Boolean).slice(0, 2), vertical: p.vertical || "OTHER" });
        if (!r.ok) return r;
        await note("wa", s.id, s.name, { about: p.about, address: p.address, description: p.description, email: p.email, websites: p.websites, vertical: p.vertical });
      } else {
        const a = s.automation;
        const r = await postJson(graph(`${s.id}/conversational_automation`), token, { enable_welcome_message: a.welcome, prompts: a.prompts.slice(0, 4),
          commands: a.commands.slice(0, 30).map(c => ({ command_name: c.name, command_description: c.description })) });
        if (!r.ok) return r;
        await note("wa", s.id, s.name, { welcome_message: a.welcome, prompts: a.prompts, commands: a.commands.map(c => c.name) });
      }
      return { ok: true };
    }
    if (!waba) throw new Error("The WhatsApp account is not set on this server yet.");
    const t = s.template;
    if (!/^[a-z0-9_]{1,512}$/.test(t.name) || !t.body.trim()) throw new Error("A template needs a name (small letters, digits, _) and a message.");
    const r = await postJson(graph(`${waba}/message_templates`), token, templateBody(t));
    return r.ok ? { ok: true } : r;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 250) : "That could not be saved." };
  }
}

export interface ProfileSaveResult {
  wa?: { ok: true; nameInReview: boolean; photo: boolean } | { ok: false; error: string };
  page?: { ok: true } | { ok: false; error: string };
}
/**
 * v2 frame 09b (note 07): one business profile to the number's WhatsApp and / or its Facebook Page, each answered on its
 * own (one may fail while the other went — the drawer says so per channel and offers Retry). CRM · Manage; the token
 * stays here. A new WhatsApp display name is a request Meta reviews; the Page's name, category, address and picture are
 * not changed by the API. Every channel that took it is recorded (crm_note_channel_save → the Audit log).
 */
export async function saveCrmBusinessProfile(form: FormData): Promise<{ ok: true; result: ProfileSaveResult } | { ok: false; error: string }> {
  try {
    const db = await crmMay("manage");
    const { token, waba, pages } = env();
    if (!token) throw new Error("Meta is not connected on this server yet.");
    const s = (k: string) => String(form.get(k) ?? "").trim();
    const p: BusinessProfile = { name: s("name"), about: s("about"), description: s("description"), address: s("address"), email: s("email"), website: s("website"), vertical: s("vertical") };
    const waId = s("wa"), pageId = s("page"), toWa = s("toWa") === "1", toPage = s("toPage") === "1";
    if (!toWa && !toPage) throw new Error("Tick WhatsApp, Facebook Page or both.");
    const note = (kind: "page" | "wa", id: string, name: string, saved: Record<string, unknown>) =>
      db.rpc("crm_note_channel_save", { p_kind: kind, p_external: id, p_name: name, p_saved: saved }).then(() => undefined, () => undefined);
    const result: ProfileSaveResult = {};
    if (toWa) result.wa = await (async () => {
      if (!waba) return { ok: false as const, error: "The WhatsApp account is not set on this server yet." };
      if (!/^\d{5,32}$/.test(waId)) return { ok: false as const, error: "Choose the number again." };
      let handle: string | null = null;
      const photo = form.get("photo");
      if (photo instanceof File && photo.size > 0) {
        if (!/^image\/(jpeg|png)$/.test(photo.type) || photo.size > 3.5 * 1024 * 1024) return { ok: false as const, error: "The photo must be a JPG or PNG under 3.5 MB." };
        const up = await uploadWaPhoto(token, await photo.arrayBuffer(), photo.type);
        if (!up.ok) return up;
        handle = up.handle;
      }
      const r = await postJson(graph(`${waId}/whatsapp_business_profile`), token, waProfileBody(p, handle));
      if (!r.ok) return r;
      let nameInReview = false;
      if (p.name && p.name !== s("curName")) {
        const n = await postJson(graph(waId), token, { new_display_name: p.name.slice(0, 120) });
        if (!n.ok) return { ok: false as const, error: `Profile saved, but the new name was refused — ${n.error}` };
        nameInReview = true;
      }
      await note("wa", waId, s("waName") || waId, { about: p.about, description: p.description, address: p.address, email: p.email, website: p.website, vertical: p.vertical, ...(handle ? { photo: "new" } : {}), ...(nameInReview ? { name_request: p.name } : {}) });
      return { ok: true as const, nameInReview, photo: !!handle };
    })();
    if (toPage) result.page = await (async () => {
      if (!pages.includes(pageId)) return { ok: false as const, error: "That Page is not one of ours." };
      const pt = await pageToken(pageId, token);
      if (!pt) return { ok: false as const, error: "Meta did not give the Page's access. Reconnect it in Meta Business Suite." };
      const body = pageProfileBody(p);
      const r = await postJson(graph(pageId), pt, body);
      if (!r.ok) return r;
      await note("page", pageId, s("pageName") || pageId, body);
      return { ok: true as const };
    })();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 250) : "The profile could not be saved." };
  }
}
