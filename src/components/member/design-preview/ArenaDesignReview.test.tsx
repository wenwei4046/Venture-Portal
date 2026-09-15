// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ArenaDesignReview from "./ArenaDesignReview";

afterEach(cleanup);

describe("Arena design comparison", () => {
  it("offers only A and C and opens each in a fresh Arena frame", () => {
    const { container } = render(<ArenaDesignReview />);
    const originalFrame = container.querySelector("iframe")!;
    expect(originalFrame).toHaveAttribute("src", "/member/preview?design=c&view=arena");
    expect(screen.queryByRole("button", { name: "Current" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "B · Cocoa & Apricot" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "A · Espresso & Clay" }));

    const canvasFrame = screen.getByTitle("Revenue mobile · Espresso & Clay");
    expect(canvasFrame).toHaveAttribute("src", "/member/preview?design=a&view=arena");
    expect(canvasFrame).not.toBe(originalFrame);
    expect(originalFrame).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A · Espresso & Clay" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "C · Orange & Brown" }));
    expect(screen.getByTitle("Revenue mobile · Orange & Brown")).toHaveAttribute("src", "/member/preview?design=c&view=arena");
    expect(canvasFrame).not.toBeInTheDocument();
  });

  it("retains the active product document when changing device chrome, width and preview scale", () => {
    const { container } = render(<ArenaDesignReview />);
    fireEvent.click(screen.getByRole("button", { name: "C · Orange & Brown" }));
    const frame = container.querySelector("iframe")!;
    const currentDocument = frame.contentDocument!;
    // Stand in for an in-progress child page without making a frame network request.
    const currentPage = currentDocument.createElement("main");
    currentPage.textContent = "My brand weeks · unsaved allocation";
    currentDocument.body.appendChild(currentPage);
    const device = screen.getByRole("combobox", { name: "Device preview" });
    expect(device).toHaveValue("iphone");

    for (const value of ["android", "browser", "iphone"]) {
      fireEvent.change(device, { target: { value } });

      expect(device).toHaveValue(value);
      expect(container.querySelector("iframe")).toBe(frame);
      expect(frame).toHaveAttribute("src", "/member/preview?design=c&view=arena");
      expect(frame.contentDocument).toBe(currentDocument);
      expect(frame.contentDocument?.body.contains(currentPage)).toBe(true);
      expect(frame.closest("[data-device]")).toHaveAttribute("data-device", value);
    }
    expect(frame.closest("[data-device]")).toHaveStyle({ width: "390px", height: "844px" });

    for (const value of ["320", "430", "390"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Phone width" }), { target: { value } });
      expect(container.querySelector("iframe")).toBe(frame);
      expect(frame.contentDocument).toBe(currentDocument);
      expect(frame.contentDocument?.body.contains(currentPage)).toBe(true);
      expect(frame.closest("[data-device]")).toHaveStyle({ width: `${value}px`, height: `${Math.round(Number(value) * 844 / 390)}px` });
    }
    for (const name of ["100%", "Fit phone", "100%", "Fit phone"]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(container.querySelector("iframe")).toBe(frame);
      expect(frame.contentDocument).toBe(currentDocument);
      expect(frame.contentDocument?.body.contains(currentPage)).toBe(true);
      expect(frame.closest("[data-device]")).toHaveStyle({ width: "390px", height: "844px" });
    }
  });
});
