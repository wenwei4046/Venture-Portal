"use client";

import { createContext, useContext } from "react";

/**
 * What the Revenue app tells the Product List page it holds (2026-10-08), and
 * what the page tells it back. The page is rendered by the server and handed
 * to the app as its children, so the two meet here rather than through props.
 *
 * - `shift`: a right-hand panel is open (notifications, the sub-department or
 *   brand sheet, View as) — the list makes room for it and an open model
 *   window closes, as the prototype's `shift` does.
 * - `closePanels`: a model opening closes those panels (the prototype's
 *   `onPanel`).
 * - `setDraft`: the list's unsaved changes, so the app asks before it leaves
 *   the page for one of its own screens.
 */
export interface ProductShell {
  shift: boolean;
  closePanels: () => void;
  setDraft: (draft: { dirty: boolean; saving: boolean }) => void;
}

const NONE: ProductShell = { shift: false, closePanels: () => {}, setDraft: () => {} };

export const ProductShellContext = createContext<ProductShell>(NONE);

export function useProductShell(): ProductShell {
  return useContext(ProductShellContext);
}
