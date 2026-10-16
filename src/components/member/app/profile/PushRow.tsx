"use client";

import { useEffect, useState, useTransition } from "react";
import PopUpGuide from "@/components/pwa/PopUpGuide";
import { PUSH_WORDS, popUpNeedsTurningOn, pushState, turnPushOff, turnPushOn, type PushState } from "@/components/pwa/push-client";
import { removePushSubscription, reportPushTrouble, savePushSubscription } from "@/lib/push/actions";
import { ICON, Svg } from "../icons";
import s from "./profile.module.css";

/**
 * Settings › Notifications (2026-10-16 — the user, Profile's Privacy, Account and Sign out circled: "combine to one,
 * name (settings), then add on one function is notification on, if on this, it will allow the permission setting for
 * notification"; was Your workspace's *Phone notifications* row since 2026-10-11). This phone shows the bell's news —
 * a meeting booked for them, added, changed or cancelled; their manpower request's step; a memo — and the CRM's
 * messages, new leads and visits of their own chats. The phone's permission is asked only when it is switched on, inside
 * the press (push-client.ts › turnPushOn). Said under it when the switch cannot answer: an iPhone outside the Home
 * Screen app, a phone that blocked them, why it failed. Nothing where the browser cannot show them. On an Android phone,
 * once on, *Make them pop up* says how to let them pop over the screen (PopUpGuide) — only the person can.
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
  const on = state === "on";
  const usable = on || state === "off";
  const press = () =>
    start(async () => {
      const res = on ? await turnPushOff(removePushSubscription) : await turnPushOn("revenue", savePushSubscription, reportPushTrouble);
      setState(res.state);
      setReason(res.reason ?? "");
    });
  const note = reason || (usable ? "" : PUSH_WORDS[state]);
  return (
    <>
      <button className={s.setRow} onClick={press} disabled={busy || !usable} data-busy={busy ? "" : undefined} aria-pressed={on}>
        <Svg d={ICON.bell} size={20} sw={1.7} />
        <span className={s.setText}>
          <span>Notifications</span>
          {note ? <span className={reason ? `${s.setSub} ${s.setSubBad}` : s.setSub}>{note}</span> : null}
        </span>
        {usable ? <span className={s.pushSwitch} data-on={on ? "1" : undefined} aria-hidden="true" /> : null}
      </button>
      {on && popUpNeedsTurningOn() ? (
        <button className={s.hideBtn} onClick={() => setGuide(true)}>
          Make them pop up<Svg d={ICON.popUp} size={20} sw={1.7} />
        </button>
      ) : null}
      {guide ? <PopUpGuide onClose={() => setGuide(false)} /> : null}
    </>
  );
}
