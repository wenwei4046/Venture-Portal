"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/nav.ts. To change the look, change the design and regenerate.
import { Phone4aBar } from "../shared/phone4a";
import type { NavVM } from "./vm/nav";

/** The bottom bar. */
export default function SalesNav({ v }: { v: NavVM }) {
  return (<>
    <Phone4aBar items={v.nav3b} />
  </>);
}
