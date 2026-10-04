"use client";

import { useState } from "react";
import InstallSteps from "@/components/pwa/InstallSteps";
import { useInstallApp } from "@/components/pwa/install-store";
import { ICON, Svg } from "../icons";
import s from "./profile.module.css";

const SUB = { prompt: "Open Venture from your home screen", ios: "Add Venture to your home screen", "in-app": "Open this page in your browser first" } as const;

/**
 * Install the app (the PWA, 2026-09-23) — the member Profile's entry point,
 * kept from the old Profile although the prototype has no row for it. Shown
 * only where this browser can install: one tap where it hands over a prompt,
 * the steps on iOS and inside another app's browser; nothing once installed.
 */
export default function InstallRow() {
  const app = useInstallApp();
  const [steps, setSteps] = useState(false);
  const path = app.path;
  if (path !== "prompt" && path !== "ios" && path !== "in-app") return null;
  return (
    <>
      <button className={s.workRow} aria-expanded={path === "prompt" ? undefined : steps}
        onClick={() => (path === "prompt" ? void app.install() : setSteps(v => !v))}>
        <span className={`${s.workIcon} ${s.toneRequests}`}><Svg d={ICON.install} size={22} sw={1.7} /></span>
        <span className={s.workText}>
          <span className={s.workLabel}>Install the app</span>
          <span className={s.workSub}>{SUB[path]}</span>
        </span>
        <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
      </button>
      {steps && path !== "prompt" && <InstallSteps path={path} className={s.installSteps} />}
    </>
  );
}
