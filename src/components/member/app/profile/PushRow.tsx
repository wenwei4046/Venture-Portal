"use client";

import { useEffect, useState, useTransition } from "react";
import PopUpGuide from "@/components/pwa/PopUpGuide";
import { PUSH_WORDS, popUpNeedsTurningOn, pushState, turnPushOff, turnPushOn, type PushState } from "@/components/pwa/push-client";
import { removePushSubscription, reportPushTrouble, savePushSubscription } from "@/lib/push/actions";
import { ICON, Svg } from "../icons";
import s from "./profile.module.css";

/**
 * Phone notifications (2026-10-11 — the user: "铃铛 + 手机推送"; not in the
 * prototype, drawn as a workspace row like *Install the app*): this phone
 * shows the bell's news — a meeting booked for them, added, changed or
 * cancelled; their manpower request's step — and, since 2026-10-14, their
 * customers' messages, new leads and visits from the CRM. The phone's
 * permission is asked only when the row is pressed. Nothing where the browser
 * cannot show them. On an Android phone, once on, *Make them pop up* says how
 * to let them pop over the screen (PopUpGuide) — only the person can.
 */
export default function PushRow() {
  const [state, setState] = useState<PushState | null>(null);
  const [reason, setReason] = useState("");
  const [guide, setGuide] = useState(false);
  const [busy, start] = useTransition();
  useEffect(() => {
    void pushState().then(setState).catch(() => setState("unsupported"));
  }, []);
  if (state === null || state === "unsupported") return null;
  const press = () =>
    start(async () => {
      const res = state === "on" ? await turnPushOff(removePushSubscription) : await turnPushOn("revenue", savePushSubscription, reportPushTrouble);
      setState(res.state);
      setReason(res.reason ?? "");
    });
  return (
    <>
      <button className={s.workRow} onClick={press} disabled={busy || state === "denied" || state === "install"} aria-pressed={state === "on"}>
        <span className={`${s.workIcon} ${s.toneMemos}`}><Svg d={ICON.bell} size={22} sw={1.8} /></span>
        <span className={s.workText}>
          <span className={s.workLabel}>Phone notifications</span>
          <span className={s.workSub}>{reason || PUSH_WORDS[state]}</span>
        </span>
        <span className={s.pushSwitch} data-on={state === "on" ? "1" : undefined} aria-hidden="true" />
      </button>
      {state === "on" && popUpNeedsTurningOn() ? (
        <button className={s.workRow} onClick={() => setGuide(true)}>
          <span className={`${s.workIcon} ${s.toneMemos}`}><Svg d={ICON.popUp} size={22} sw={1.8} /></span>
          <span className={s.workText}>
            <span className={s.workLabel}>Make them pop up</span>
            <span className={s.workSub}>Pop on screen, once per phone</span>
          </span>
          <Svg d={ICON.chevronRight} size={16} sw={1.8} stroke="var(--rv-sub)" />
        </button>
      ) : null}
      {guide ? <PopUpGuide onClose={() => setGuide(false)} /> : null}
    </>
  );
}
