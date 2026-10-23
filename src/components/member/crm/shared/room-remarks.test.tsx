import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Phone4aRoomRemarks } from "./phone4a";

// Book visit shows the showroom's staff-only remarks under the times (the owner, 2026-10-23); none, nothing.
describe("Phone4aRoomRemarks", () => {
  it("shows the remarks, labelled staff only", () => {
    render(<Phone4aRoomRemarks text={"Park at B1, lift lobby B.\nBring them to the Cloud corner."} />);
    expect(screen.getByText("Remarks · staff only")).toBeInTheDocument();
    expect(screen.getByText(/Park at B1/)).toBeInTheDocument();
  });
  it("draws nothing without remarks", () => {
    const { container } = render(<Phone4aRoomRemarks text="" />);
    expect(container.firstChild).toBeNull();
  });
});
