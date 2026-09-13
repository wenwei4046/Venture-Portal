// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InsightDesignReview from "./InsightDesignReview";

afterEach(cleanup);

describe("Standalone Insight design review", () => {
  it("switches the Insight palette and phone size without introducing an Arena view", () => {
    const { container } = render(<InsightDesignReview />);
    const frame = () => container.querySelector("iframe")!;
    expect(frame()).toHaveAttribute("src", "/member/preview?design=a&view=insight");
    expect(frame()).toHaveStyle({ width: "390px" });
    expect(screen.queryByRole("button", { name: /Ranking Arena/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ranking Arena/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "B · Cocoa & Apricot" }));
    expect(frame()).toHaveAttribute("src", "/member/preview?design=b&view=insight");
    fireEvent.change(screen.getByRole("combobox", { name: "Phone width" }), { target: { value: "430" } });
    expect(screen.getByRole("combobox", { name: "Phone width" })).toHaveValue("430");
    expect(frame()).toHaveAttribute("src", "/member/preview?design=b&view=insight");
    expect(frame()).toHaveStyle({ width: "430px" });

    fireEvent.click(screen.getByRole("button", { name: "A · Espresso & Clay" }));
    expect(frame()).toHaveAttribute("src", "/member/preview?design=a&view=insight");
    expect(screen.getByRole("combobox", { name: "Phone width" })).toHaveValue("430");
  });

  it("opens the current app at Insight and keeps that route when resizing", () => {
    render(<InsightDesignReview />);
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(screen.getByTitle("Revenue mobile · Current app")).toHaveAttribute("src", "/member/preview?page=insight");
    const width = screen.getByRole("combobox", { name: "Phone width" });
    for (const value of ["320", "375", "390", "430"]) {
      fireEvent.change(width, { target: { value } });
      expect(width).toHaveValue(value);
      expect(screen.getByTitle("Revenue mobile · Current app")).toHaveAttribute("src", "/member/preview?page=insight");
      expect(screen.getByTitle("Revenue mobile · Current app")).toHaveStyle({ width: `${value}px` });
    }
  });
});
