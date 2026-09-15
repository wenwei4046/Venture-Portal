// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InsightDesignReview from "./InsightDesignReview";

afterEach(cleanup);

describe("Insight design review", () => {
  it("preserves the Insight entry while switching the two shared designs and phone size", () => {
    const { container } = render(<InsightDesignReview />);
    const frame = () => container.querySelector("iframe")!;
    expect(frame()).toHaveAttribute("src", "/member/preview?design=c&view=insight");
    expect(screen.queryByRole("button", { name: "Current" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "B · Cocoa & Apricot" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "A · Espresso & Clay" }));
    expect(frame()).toHaveAttribute("src", "/member/preview?design=a&view=insight");
    fireEvent.change(screen.getByRole("combobox", { name: "Phone width" }), { target: { value: "430" } });
    expect(frame().closest("[data-device]")).toHaveStyle({ width: "430px" });
    expect(frame()).toHaveAttribute("src", "/member/preview?design=a&view=insight");
    fireEvent.click(screen.getByRole("button", { name: "C · Orange & Brown" }));
    expect(frame()).toHaveAttribute("src", "/member/preview?design=c&view=insight");
    expect(screen.getByRole("combobox", { name: "Phone width" })).toHaveValue("430");
  });
});
