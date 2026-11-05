"use client";
// IR Quote (2026-11-05): reads everything a screen opens on (`loadIrQuote`), hands it to the ported modules, and wires
// their writes to the server — the link between the prototype's browser storage and the app's tables.
import { useEffect, useState } from "react";
import { loadIrQuote, saveIrDriveBoard, saveIrQuoteConfig, saveIrQuoteDraft, type IrqBoot } from "@/app/(member)/member/ir-quote-actions";
import { configureIrqStorage, irqStorage, preloadIrqStorage } from "./storage";
import { irqEnv, uploadPictures } from "./env";
import { preloadBoards } from "./lib/workspace-store";

export const IRQ_LIVE = "irq.config.v1";
export const IRQ_DRAFT = "irq.preview.v1";
const draftsKey = (uid: string) => `irq.drafts.${uid}`;

type Draft = { id: string };

/**
 * The prototype keeps a salesperson's drafts as one list; the server keeps each draft. What changed between the list
 * the server last had (`kept`, id → JSON) and the list now: the drafts to send (new or changed) and the ids to delete.
 */
export function draftDiff(kept: ReadonlyMap<string, string>, list: Draft[]) {
  const next = new Map(list.filter(d => d?.id).map(d => [d.id, JSON.stringify(d)]));
  const put = [...next].filter(([id, json]) => kept.get(id) !== json).map(([id, json]) => ({ id, draft: JSON.parse(json) as Draft }));
  const drop = [...kept.keys()].filter(id => !next.has(id));
  return { next, put, drop };
}

function wire(boot: IrqBoot, readOnly: boolean, onError: (m: string) => void) {
  irqEnv.user = boot.user;
  irqEnv.readOnly = readOnly;
  irqEnv.onError = onError;
  irqEnv.saveBoard = async (id, board) => {
    if (readOnly) throw new Error("Read-only while viewing as — nothing is saved.");
    const r = await saveIrDriveBoard(id, board);
    if (!r.ok) throw new Error(r.error);
  };
  const dKey = draftsKey(boot.user.id);
  let kept = new Map<string, string>((boot.drafts as Draft[]).filter(d => d?.id).map(d => [d.id, JSON.stringify(d)]));
  preloadIrqStorage({
    [IRQ_LIVE]: boot.live ? JSON.stringify(boot.live) : null,
    [IRQ_DRAFT]: boot.draft ? JSON.stringify(boot.draft) : null,
    [dKey]: JSON.stringify(boot.drafts),
  });
  preloadBoards(boot.boards);
  configureIrqStorage(
    async (key, value) => {
      if (readOnly) throw new Error("Read-only while viewing as — nothing is saved.");
      if (key === IRQ_LIVE || key === IRQ_DRAFT) {
        const config = value === null ? null : await uploadPictures(JSON.parse(value), "config");
        const r = await saveIrQuoteConfig(key === IRQ_LIVE ? "publish" : "draft", config);
        if (!r.ok) throw new Error(r.error);
        return;
      }
      if (key === dKey) {
        // The prototype keeps a list; the server keeps each draft — send what changed, take away what went.
        const { next, put, drop } = draftDiff(kept, value ? JSON.parse(value) : []);
        for (const { id, draft } of put) {
          const r = await saveIrQuoteDraft(id, await uploadPictures(draft, "drive"));
          if (!r.ok) throw new Error(r.error);
        }
        for (const id of drop) {
          const r = await saveIrQuoteDraft(id, null);
          if (!r.ok) throw new Error(r.error);
        }
        kept = next;
      }
    },
    (_key, e) => onError(e instanceof Error ? e.message : "Not saved. Try again."),
  );
}

/** The preview and the demo: no session, so the handoff's own price list, nothing sent anywhere. */
const OFFLINE_BOOT: IrqBoot = {
  quote: true, edit: true, live: null, liveAt: null, draft: null, drafts: [], boards: [],
  crmFields: [
    { id: "name", label: "Name", section: "Contact", core: true }, { id: "phone", label: "Phone", section: "Contact" },
    { id: "type", label: "Property type", section: "Property" }, { id: "size", label: "Unit size", section: "Property" },
    { id: "loc", label: "Unit location", section: "Property" }, { id: "req", label: "Requirement", section: "Property" },
    { id: "budget", label: "Budget", section: "Property" },
  ],
  user: { id: "preview", name: "" },
};

export type IrqBootState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; boot: IrqBoot };

/** The screen's data; `readOnly` (View as) keeps every write in the browser. */
export function useIrqBoot(readOnly: boolean, onError: (m: string) => void, offline?: { name: string }): IrqBootState {
  const [state, setState] = useState<IrqBootState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    if (offline) {
      const boot = { ...OFFLINE_BOOT, user: { id: "preview", name: offline.name } };
      wire(boot, readOnly, onError);
      configureIrqStorage(async () => {}, () => {});
      irqEnv.saveBoard = async () => {};
      setState({ status: "ready", boot });
      return () => { live = false; };
    }
    loadIrQuote().then(r => {
      if (!live) return;
      if (!r.ok) return setState({ status: "error", error: r.error });
      wire(r.data, readOnly, onError);
      setState({ status: "ready", boot: r.data });
    });
    const flush = () => irqStorage.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      live = false;
      window.removeEventListener("pagehide", flush);
      irqStorage.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);
  return state;
}

