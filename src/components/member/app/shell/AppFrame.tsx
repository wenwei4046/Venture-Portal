"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import base from "../base.module.css";
import { PRODUCTS_PATH, readRoute } from "../route";
import s from "../shell.module.css";
import { BottomNav, DeskAside } from "./Chrome";
import f from "./frame.module.css";

const noop = () => {};

/**
 * The app's own frame without the app (2026-10-06) — what /member shows while it
 * loads (`AppLoading`) and when it cannot (`AppError`): the phone header where the
 * app has one (Today), the bottom bar on the tab the URL names, the sidebar on a
 * desktop. The frame is inert — nothing in it answers until the app does — and the
 * page's place holds `children`.
 */
export default function AppFrame({ children }: { children: ReactNode }) {
  const fromQuery = readRoute(`?${useSearchParams().toString()}`).screen;
  // The Product List's page has no `?page=`: no screen of the app is lit while it loads.
  const screen = usePathname() === PRODUCTS_PATH ? "products" : fromQuery;
  const [android, setAndroid] = useState(false);
  useEffect(() => {
    if (/Android/i.test(navigator.userAgent)) setAndroid(true);
  }, []);
  const vars = { "--status-bg": "var(--rv-white)", "--status-h": "env(safe-area-inset-top, 0px)" } as CSSProperties;

  return (
    <div className={`${base.root} ${s.app}`} data-revenue-app>
      <div className={`${s.screen} ${s.screenLive}`} style={vars} data-platform={android ? "android" : "ios"}>
        <div className={f.inert} inert>
          <DeskAside active={screen} count={0} notifOpen={false} onGo={noop} onQuote={noop} onNotif={noop} onProfile={noop} />
          <header className={s.deskHeader} />
          {screen === "today" && (
            <header className={`${s.header} ${f.headerHold}`}>
              <span className={s.headerLogo}>
                <span className={s.headerWord}>HOUZS VENTURE</span>
                <span className={s.headerDept}>Revenue</span>
              </span>
            </header>
          )}
        </div>
        <main className={`${s.main} ${f.main}`}>{children}</main>
        <div className={f.inert} inert>
          <BottomNav active={screen} android={android} live onGo={noop} onQuote={noop} />
        </div>
      </div>
    </div>
  );
}
