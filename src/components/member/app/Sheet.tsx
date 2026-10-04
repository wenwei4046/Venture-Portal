"use client";

import type { CSSProperties, ReactNode } from "react";
import s from "./sheet.module.css";

export type SheetDim = "a" | "b" | "c" | "d";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** The layer's z-index — the prototype stacks each sheet at its own. */
  z: number;
  dim?: SheetDim;
  /** Phone only: the panel's height / max-height (the prototype's ph84, pm86 …). */
  height?: string;
  maxHeight?: string;
  scroll?: boolean;
  /** Padding, gap and flex of the panel itself — they differ per sheet. */
  className?: string;
  label: string;
  children: ReactNode;
}

const dims = { a: s.dimA, b: s.dimB, c: s.dimC, d: s.dimD } as const;

/** A bottom sheet on a phone, a right-hand panel on desktop. */
export default function Sheet({ open, onClose, z, dim = "a", height, maxHeight, scroll, className, label, children }: SheetProps) {
  const vars = { "--sheet-h": height, "--sheet-max": maxHeight } as CSSProperties;
  return (
    <div className={`${s.layer} ${open ? s.layerOpen : ""}`} style={{ zIndex: z }} aria-hidden={!open}>
      <div className={`${s.dim} ${dims[dim]} ${open ? s.dimOpen : ""}`} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label}
        className={`${s.panel} ${open ? s.panelOpen : ""} ${scroll ? s.panelScroll : ""} ${className ?? ""}`}
        style={vars} inert={!open}>
        {children}
      </div>
    </div>
  );
}

export function SheetHandle() {
  return <span className={s.handle} />;
}
