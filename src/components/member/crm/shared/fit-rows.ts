"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * A title row that holds a control as well as its round buttons (Team | Mine, the house, the bell — three 40 px buttons
 * since 2026-10-14) keeps its title whole on a narrow phone. Each such row is marked `data-fit-row`; when its title would
 * be cut, the row gets `data-tight` and crm.module.css makes room: Insight's range and the Team calendar's dates become a
 * round button (`data-fit-ctl="icon"`, the dates moving under the title), the Team inbox's Contacts drops its icon
 * (`data-fit-ctl="words"`), the Calendar's month takes its short name (`data-fit-long` / `data-fit-short`). A title that
 * may wrap says how many lines it may take (`data-fit-lines`): Profile's name beside the card's corner buttons — past
 * that the name moves under the buttons (`data-fit-pad`). On a phone wide enough nothing changes — the design as drawn.
 */
export function titleCut(row: Element): boolean {
  return [...row.querySelectorAll("h1")].some(h => {
    const max = Number(h.getAttribute("data-fit-lines"));
    return h.scrollWidth > h.clientWidth + 1 || (max > 0 && linesOf(h) > max);
  });
}

/** How many lines a title's words take (its line boxes, by their tops). */
export function linesOf(h: Element): number {
  const range = document.createRange();
  range.selectNodeContents(h);
  return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
}

/** Every marked row under `root`, measured as designed first, then made tight if its title is cut. */
export function fitRows(root: ParentNode) {
  for (const row of root.querySelectorAll("[data-fit-row]")) {
    row.removeAttribute("data-tight");
    if (titleCut(row)) row.setAttribute("data-tight", "");
  }
}

/** Fits the CRM's rows before each paint of the component that calls it, on a resize and once the fonts are in. */
export function useFitRows() {
  useLayoutEffect(() => { fitRows(document); });
  useEffect(() => {
    const again = () => fitRows(document);
    window.addEventListener("resize", again);
    void document.fonts?.ready.then(again);
    return () => window.removeEventListener("resize", again);
  }, []);
}
