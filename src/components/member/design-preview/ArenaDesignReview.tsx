"use client";

import { useState } from "react";
import ArenaPaletteStudy from "./ArenaPaletteStudy";
import ArenaPhoneFrame, { type ArenaDevice, type ArenaPreviewScale } from "./ArenaPhoneFrame";
import s from "./ArenaDesignPreview.module.css";
import controls from "./ArenaDesignReviewControls.module.css";

const directions = {
  a: { name: "Espresso & Clay", note: "Espresso, burnt clay, muted olive and slate blue on warm ivory cards.", colors: ["Espresso", "Clay", "Olive", "Slate Blue"] },
  c: { name: "Orange & Brown", note: "A white canvas with vivid orange, espresso, cocoa and amber accents, open ranking rows and a framed gold podium.", colors: ["Espresso", "Orange", "Cocoa", "Amber"] },
};

export default function ArenaDesignReview({ initialView = "arena" }: { initialView?: "arena" | "insight" }) {
  const [option, setOption] = useState<"a" | "c">("c");
  const [width, setWidth] = useState(390);
  const [device, setDevice] = useState<ArenaDevice>("iphone");
  const [scaleMode, setScaleMode] = useState<ArenaPreviewScale>("fit");
  const direction = directions[option];
  const src = `/member/preview?design=${option}&view=${initialView}`;
  return (
    <main className={`${s.review} ${controls.reviewLayout}`} data-preview-scale={scaleMode} data-arena-design="a">
      <header className={s.reviewHeader}>
        <div className="page-head">
          <div>
            <p className={s.reviewEyebrow}>HOUZS VENTURE / MOBILE DESIGN STUDY</p>
            <h1 className={s.reviewTitle}>Revenue mobile</h1>
          </div>
          <label className={s.sizeControl}>
            <span className={s.visuallyHidden}>Phone width</span>
            <select value={width} onChange={e => setWidth(Number(e.target.value))}>
              <option value={320}>320 px</option>
              <option value={375}>375 px</option>
              <option value={390}>390 px</option>
              <option value={430}>430 px</option>
            </select>
          </label>
        </div>
        <div className={controls.options} role="group" aria-label="Design option">
          <button aria-pressed={option === "a"} onClick={() => setOption("a")}>A · Espresso & Clay</button>
          <button aria-pressed={option === "c"} onClick={() => setOption("c")}>C · Orange & Brown</button>
        </div>
        <div className={s.palette} aria-label="Four colour palette" data-arena-design={option}>
          {direction.colors.map((color, i) => (
            <span key={color}><i className={s[`swatch${i}`]} />{color}</span>
          ))}
        </div>
        <ArenaPaletteStudy design={option} />
      </header>
      <div className={controls.deviceControl}>
        <div className={controls.scaleControl} role="group" aria-label="Preview scale">
          <button aria-pressed={scaleMode === "fit"} onClick={() => setScaleMode("fit")}>Fit phone</button>
          <button aria-pressed={scaleMode === "actual"} onClick={() => setScaleMode("actual")}>100%</button>
        </div>
        <select aria-label="Device preview" value={device} onChange={e => setDevice(e.target.value as ArenaDevice)}>
          <option value="iphone">iPhone</option>
          <option value="android">Android</option>
          <option value="browser">Browser</option>
        </select>
      </div>
      <ArenaPhoneFrame design={option} device={device} width={width} title={`Revenue mobile · ${direction.name}`} src={src} scaleMode={scaleMode} />
      <footer className={s.reviewFooter}>
        <span>{direction.note}</span>
        <span>Fictional data · example as of 30 Sep 2026</span>
        {device !== "browser" && <span>Status bars are simulated · iPhone / Android layout preview</span>}
      </footer>
    </main>
  );
}
