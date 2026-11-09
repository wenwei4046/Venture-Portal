import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";

// notes/10 §5 (2026-11-10): the desktop's own history steps (desk/nav.ts › useDeskPlace, and the prototype's
// vm/proto-logic.ts) each listen to popstate; on the phone they must not be mounted, or two listeners would each handle
// the same Back. The phone's CrmApp mounts neither — DeskScreens only on a computer (`desk && deskApp`), DeskProto only on
// /member/preview?app=desk-proto.
const deskPlace = vi.fn();
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
vi.mock("./desk/nav", async orig => ({ ...(await orig<typeof import("./desk/nav")>()), useDeskPlace: (...a: unknown[]) => { deskPlace(...a); } }));
const protoMounted = vi.fn();
vi.mock("./desk/vm/proto-logic", () => ({ Component: class { constructor() { protoMounted(); } } }));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("the phone's Back has one listener of the CRM's", () => {
  it.each([["the Principal (Team side)", "boss"], ["a salesperson", ""]])("%s on a phone: no desktop history mounted", async (_w, as) => {
    window.history.replaceState({}, "", as ? `/member/preview?crmAs=${as}` : "/member/preview");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    expect(deskPlace).not.toHaveBeenCalled();
    expect(protoMounted).not.toHaveBeenCalled();
  });
});
