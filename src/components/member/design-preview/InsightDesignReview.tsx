"use client";

import { useState } from "react";
import theme from "./InsightTheme.module.css";
import s from "./InsightDesignReview.module.css";

const directions = {
  a: { name: "Espresso & Clay", note: "Espresso, burnt clay, muted olive and slate blue on warm ivory cards.", colors: ["Espresso", "Clay", "Olive", "Slate Blue"] },
  b: { name: "Cocoa & Apricot", note: "Cocoa, apricot, dusty rose and soft gold on warm ivory cards.", colors: ["Cocoa", "Apricot", "Dusty Rose", "Soft Gold"] },
};

/** Insight owns its review surface so it can ship independently of other preview sections. */
export default function InsightDesignReview() {
  const [option, setOption] = useState<"current" | "a" | "b">("a");
  const [width, setWidth] = useState(390);
  const direction = directions[option === "current" ? "a" : option];
  const src = option === "current" ? "/member/preview?page=insight" : `/member/preview?design=${option}&view=insight`;
  return <main className={`${theme.theme} ${s.review}`} data-insight-design={option === "b" ? "b" : "a"}>
    <header className={s.reviewHeader}>
      <div className={s.heading}>
        <div><p className={s.reviewEyebrow}>HOUZS VENTURE / INSIGHT</p><h1 className={s.reviewTitle}>Revenue mobile</h1></div>
        <label className={s.sizeControl}><span className={s.visuallyHidden}>Phone width</span><select aria-label="Phone width" value={width} onChange={event => setWidth(Number(event.target.value))}>
          {[320, 375, 390, 430].map(value => <option key={value} value={value}>{value} px</option>)}
        </select></label>
      </div>
      <div className={s.optionTabs} role="group" aria-label="Design option">
        <button aria-pressed={option === "current"} onClick={() => setOption("current")}>Current</button>
        <button aria-pressed={option === "a"} onClick={() => setOption("a")}>A · Espresso & Clay</button>
        <button aria-pressed={option === "b"} onClick={() => setOption("b")}>B · Cocoa & Apricot</button>
      </div>
      <div className={s.palette} aria-label="Four colour palette">{option === "current" ? <span>Current code · Insight inside Profile</span> : direction.colors.map((color, index) => <span key={color}><i style={{ background: `rgb(var(--insight-hue${index}-mid))` }} />{color}</span>)}</div>
      {option !== "current" && <details className={s.colourStudy}><summary>Colour study · Light / Mid / Deep</summary><div className={s.shades}>{direction.colors.map((color, index) => <div key={color}><span>{color}</span><div>{["light", "mid", "deep"].map(shade => <i key={shade} title={`${color} · ${shade}`} style={{ background: `rgb(var(--insight-hue${index}-${shade}))` }} />)}</div></div>)}</div></details>}
    </header>
    <iframe key={option} className={s.phoneFrame} title={`Revenue mobile · ${option === "current" ? "Current app" : direction.name}`} src={src} style={{ width }} />
    <footer className={s.reviewFooter}><span>{option === "current" ? "Existing app on demo data." : direction.note}</span><span>{option === "current" ? "Interactive preview" : "Design proposal · illustrative data"}</span></footer>
  </main>;
}
