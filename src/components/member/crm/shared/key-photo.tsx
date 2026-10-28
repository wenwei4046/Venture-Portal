"use client";

import type { ChangeEvent } from "react";
import { openActions } from "./action-sheet";
import { openCamera } from "./camera";
import { InAppCamera } from "./in-app-camera";

/**
 * The unit's key handed over with a photo (the owner, 2026-10-28: "在 appt today 建立一个新的按钮，点击后上传领取钥匙的照片，
 * 同时附上相机功能 … 点击 show up，并拍摄交还钥匙的照片"). A question opens the small sheet — Take photo (the app's own camera,
 * else the phone's) or Choose from Photos — and the photo picked goes to the question's `run`. Mounted once beside the
 * Calendar (sales/SalesScreens); one question at a time.
 */
export const KEY_CAMERA_ID = "crm-key-camera";
export const KEY_PICK_ID = "crm-key-photo";

type Ask = { title: string; sub?: string; run: (file: File) => Promise<boolean> | void };
let pending: Ask | null = null;

export function askKeyPhoto(ask: Ask, warn: (text: string) => void) {
  pending = ask;
  openActions({
    title: ask.title, sub: ask.sub,
    actions: [
      { label: "Take photo", primary: true, run: () => openCamera(KEY_CAMERA_ID, warn) },
      { label: "Choose from Photos", run: () => document.getElementById(KEY_PICK_ID)?.click() },
    ],
  });
}

/** What the camera or the picker handed over, to the question waiting for it. */
export async function keyPhotoPicked(file: File | undefined): Promise<boolean> {
  const ask = pending;
  pending = null;
  if (!file || !ask) return false;
  return (await ask.run(file)) !== false;
}

export function KeyPhotoHost({ warn }: { warn: (text: string) => void }) {
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    void keyPhotoPicked(file);
  };
  return (
    <>
      <input id={KEY_CAMERA_ID} type="file" accept="image/*" capture="environment" onChange={picked} style={{ display: "none" }} />
      <input id={KEY_PICK_ID} type="file" accept="image/*" onChange={picked} style={{ display: "none" }} />
      <InAppCamera inputId={KEY_CAMERA_ID} galleryId={KEY_PICK_ID} warn={warn} />
    </>
  );
}
