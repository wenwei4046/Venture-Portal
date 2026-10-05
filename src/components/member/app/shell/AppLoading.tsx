"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import base from "../base.module.css";
import { readRoute } from "../route";
import s from "../shell.module.css";
import { BottomNav, DeskAside } from "./Chrome";
import l from "./loading.module.css";

const noop = () => {};

/**
 * What /member shows while the server loads the member's data (`loading.tsx`): the
 * app's own frame — the phone header where the app has one (Today), the bottom bar
 * on the tab the URL names, the sidebar on a desktop — and one spinner where the
 * page will be. The frame is inert: nothing in it answers until the app does.
 */
export default function AppLoading() {
  const { screen } = readRoute(`?${useSearchParams().toString()}`);
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    if (/Android/i.test(navigator.userAgent)) setAndroid(true);
  }, []);
  const vars = { "--status-bg": "var(--rv-white)", "--status-h": "env(safe-area-inset-top, 0px)" } as CSSProperties;

  return (
    <div className={`${base.root} ${s.app}`} data-revenue-app>
      <div className={`${s.screen} ${s.screenLive}`} style={vars} data-platform={android ? "android" : "ios"}>
        <div className={l.inert} inert>
          <DeskAside active={screen} count={0} notifOpen={false} onGo={noop} onQuote={noop} onNotif={noop} onProfile={noop} />
          <header className={s.deskHeader} />
          {screen === "today" && (
            <header className={`${s.header} ${l.headerHold}`}>
              <span className={s.headerLogo}>
                <span className={s.headerWord}>HOUZS VENTURE</span>
                <span className={s.headerDept}>Revenue</span>
              </span>
            </header>
          )}
        </div>
        <main className={`${s.main} ${l.main}`}>
          <div role="status">
            <span className={l.spinner} aria-hidden="true" />
            <span className={l.srOnly}>Loading your Revenue app…</span>
          </div>
        </main>
        <div className={l.inert} inert>
          <BottomNav active={screen} android={android} live onGo={noop} onQuote={noop} />
        </div>
      </div>
    </div>
  );
}
