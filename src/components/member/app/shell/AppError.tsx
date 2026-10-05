"use client";

import { ICON, Svg } from "../icons";
import AppFrame from "./AppFrame";
import f from "./frame.module.css";

/**
 * What /member shows when it cannot load (`error.tsx`): the app's frame, what went
 * wrong, and one way on — Try again, a fresh load (which also picks up a release
 * the open page predates). `digest` is the server's reference for the error, so a
 * screenshot of this page is enough to find it in the logs.
 */
export default function AppError({ digest, onRetry = () => window.location.reload() }: {
  digest?: string;
  onRetry?: () => void;
}) {
  return (
    <AppFrame>
      <div className={f.error}>
        <span className={f.errorIcon}><Svg d={ICON.alert} size={26} sw={1.9} /></span>
        <div role="alert">
          <h1 className={f.errorTitle}>{"Couldn't open the Revenue app"}</h1>
          <p className={f.errorText}>Check your connection and try again. Trying again never sends a request twice.</p>
        </div>
        <button type="button" className={f.retry} onClick={onRetry}>
          <Svg d={ICON.refresh} size={18} sw={2} />Try again
        </button>
        {digest && <span className={f.errorRef}>Ref {digest}</span>}
      </div>
    </AppFrame>
  );
}
