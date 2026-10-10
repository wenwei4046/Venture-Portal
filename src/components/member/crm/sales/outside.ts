import { useEffect } from "react";

/**
 * The chat's ⋮ menu closes on a tap anywhere outside it (rev 1010 §1.5). A
 * document-level pointerdown, in the capture phase, closes it unless the tap
 * is inside the menu or on the ⋮ button (data-hm-menu / data-hm-toggle). It
 * replaces the fixed transparent backdrop, which sat inside the header and
 * under the chat list, so a tap on the messages never reached it.
 */
export function useCloseOnOutside(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("[data-hm-menu]") || t?.closest?.("[data-hm-toggle]")) return;
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);
}
