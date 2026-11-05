"use client";
// IR Quote (2026-11-05): what the ported prototype modules need from the app — who is signed in, where a photo goes,
// how a Drive folder is kept. Set by the screen before its logic mounts (`IrQuoteScreen`).
import { createClient } from "@/lib/supabase/client";
import { fileRoute } from "@/lib/storage/browser";

type SaveBoard = (id: string, board: unknown) => Promise<void>;

export const irqEnv: {
  user: { id: string; name: string };
  readOnly: boolean;
  saveBoard: SaveBoard;
  onError: (message: string) => void;
} = {
  user: { id: "", name: "" },
  readOnly: false,
  saveBoard: async () => {},
  onError: () => {},
};

const BUCKET = "ir-quote";
const uploaded = new Map<string, string>();

async function dataUrlToBlob(src: string): Promise<Blob> {
  return (await fetch(src)).blob();
}

/** One picture the prototype made as a data: URL, into the app's files; its address back. The same picture once. */
export async function uploadDataUrl(src: string, scope: "config" | "drive"): Promise<string> {
  const hit = uploaded.get(src);
  if (hit) return hit;
  if (irqEnv.readOnly) throw new Error("Read-only while viewing as — nothing is saved.");
  const blob = await dataUrlToBlob(src);
  const type = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${scope}/${irqEnv.user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await createClient().storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error("A picture could not be uploaded. Try again.");
  const url = fileRoute(BUCKET, path);
  uploaded.set(src, url);
  return url;
}

/** Every data: picture inside a value (a Drive folder, the settings), moved to the app's files — the rest as it is. */
export async function uploadPictures<T>(value: T, scope: "config" | "drive"): Promise<T> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (typeof v === "string") return v.startsWith("data:image/") ? uploadDataUrl(v, scope) : v;
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x);
      return out;
    }
    return v;
  };
  return (await walk(value)) as T;
}
