"use client";

import { useSearchParams } from "next/navigation";
import { DeskLoading } from "../../crm/desk/DeskLoading";
import { readRoute } from "../route";
import s from "../shell.module.css";
import AppFrame from "./AppFrame";
import f from "./frame.module.css";

/**
 * What /member shows while the server loads the member's data (`loading.tsx`): the app's frame and one spinner where the page
 * will be. A reload of the CRM on a computer shows the CRM's own frame over it instead (2026-11-27 — the owner: "relaod
 * time , change to crm frame"; crm/desk/DeskLoading, shown at the app's desktop width only — shell.module.css `.crmLoadingDesk`).
 */
export default function AppLoading() {
  const onCrm = readRoute(`?${useSearchParams().toString()}`).pf === "crm";
  return (
    <AppFrame>
      <div role="status">
        <span className={f.spinner} aria-hidden="true" />
        <span className={f.srOnly}>Loading your Revenue app…</span>
      </div>
      {onCrm && <div className={s.crmLoadingDesk}><DeskLoading line="Loading your customers…" /></div>}
    </AppFrame>
  );
}
