import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Desk4aTop } from "./Desk4a";
import type { Frame4a } from "./vm/frame4a";

// The CRM on a computer, its top bar (2026-11-24 — the owner: one sub-department, no switch): with no openSubDept the
// sub-department is a label; with it, the switch.
const top = (openSubDept?: () => void) =>
  render(<Desk4aTop left={0} f4={{ greet: "Good morning", first: "KRIS", subName: "Fair", openSubDept, date: "Tue 24 Nov" } as unknown as Frame4a} />);

afterEach(cleanup);

describe("the CRM desktop's sub-department", () => {
  it("is a label when there is only one", () => {
    top();
    expect(screen.queryByRole("button", { name: "Switch sub-department" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-sub-only]")).toHaveTextContent("Fair view");
  });

  it("is the switch when there are more", () => {
    const open = vi.fn();
    top(open);
    fireEvent.click(screen.getByRole("button", { name: "Switch sub-department" }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-sub-only]")).toBeNull();
  });
});
