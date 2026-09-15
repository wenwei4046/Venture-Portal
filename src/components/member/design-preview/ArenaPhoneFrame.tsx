"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import s from "./ArenaPhoneFrame.module.css";

export type ArenaDevice = "browser" | "iphone" | "android";
export type ArenaPreviewScale = "fit" | "actual";
type ArenaPhoneFrameProps = {
  design: "current" | "a" | "b" | "c";
  device: ArenaDevice;
  width: number;
  src: string;
  title: string;
  scaleMode?: ArenaPreviewScale;
};

function StatusIcons() {
  return (
    <span className={s.statusIcons}>
      <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
        <rect x="0" y="8" width="2.5" height="4" rx=".7" />
        <rect x="4" y="5.5" width="2.5" height="6.5" rx=".7" />
        <rect x="8" y="3" width="2.5" height="9" rx=".7" />
        <rect x="12" y="0" width="2.5" height="12" rx=".7" />
      </svg>
      <svg width="16" height="12" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M1 3.5a12 12 0 0 1 16 0M4 7a7.5 7.5 0 0 1 10 0M7 10a3 3 0 0 1 4 0" />
        <circle cx="9" cy="13" r=".7" fill="currentColor" stroke="none" />
      </svg>
      <svg width="25" height="13" viewBox="0 0 27 14" fill="none">
        <rect x=".5" y=".5" width="22" height="13" rx="3" stroke="currentColor" opacity=".5" />
        <rect x="2.5" y="2.5" width="16" height="9" rx="1.4" fill="currentColor" />
        <path d="M24 4.5v5c1.5-.3 2-1.2 2-2.5s-.5-2.2-2-2.5" fill="currentColor" opacity=".5" />
      </svg>
    </span>
  );
}

/** Device chrome belongs to the comparison frame, never the product document. */
export default function ArenaPhoneFrame({ design, device, width, src, title, scaleMode = "fit" }: ArenaPhoneFrameProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width, height: 844 });
  // Dimensions describe the whole device, including its simulated OS bars.
  const height = Math.round(width * (device === "android" ? 20 / 9 : 844 / 390));
  const scale = scaleMode === "actual" ? 1 : Math.min(1, available.width / width, available.height / height);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const size = { width: element.clientWidth, height: Math.max(0, element.clientHeight - 24) };
      if (size.width > 0 && size.height > 0) setAvailable(size);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  return (
    <div className={s.stage} data-scale-mode={scaleMode} ref={stage}>
      <div className={s.scaledBounds} style={{ width: width * scale, height: height * scale }}>
    <div
      className={s.frame}
      data-arena-design={design === "current" ? "a" : design}
      data-device={device}
      data-current={design === "current" || undefined}
      style={{ width, height, transform: `scale(${scale})` } as CSSProperties}
    >
      <div className={s.statusBar} aria-hidden="true">
        <span className={s.time}>{device === "android" ? "14:53" : "9:41"}</span>
        <span className={s.camera} />
        <StatusIcons />
      </div>
      <iframe key={design} className={s.viewport} title={title} src={src} />
      <div className={s.gestureArea} aria-hidden="true"><span /></div>
    </div>
      </div>
      <p className={s.dimensions}>{width} × {height} · {Math.round(scale * 100)}%</p>
    </div>
  );
}
