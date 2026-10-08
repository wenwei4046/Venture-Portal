"use client";

import AppFrame from "./AppFrame";
import f from "./frame.module.css";

/** What /member shows while the server loads the member's data (`loading.tsx`): the app's frame and one spinner where the page will be. */
export default function AppLoading() {
  return (
    <AppFrame>
      <div role="status">
        <span className={f.spinner} aria-hidden="true" />
        <span className={f.srOnly}>Loading your Revenue app…</span>
      </div>
    </AppFrame>
  );
}
