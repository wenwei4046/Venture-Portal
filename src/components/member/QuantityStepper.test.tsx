import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuantityStepper from "./QuantityStepper";

afterEach(cleanup);

function Harness({
  min = 1,
  max = 10,
  initial = min,
  disabled = false,
}: {
  min?: number;
  max?: number;
  initial?: number;
  disabled?: boolean;
} = {}) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      label="Cloud Support Queen"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={setValue}
    />
  );
}

const decrease = () =>
  screen.getByRole("button", { name: "Decrease Cloud Support Queen quantity" });
const increase = () =>
  screen.getByRole("button", { name: "Increase Cloud Support Queen quantity" });
const count = () => screen.getByLabelText("Quantity");

describe("QuantityStepper", () => {
  it("announces the product and current quantity, without a dropdown", () => {
    render(<Harness initial={3} />);
    expect(
      screen.getByRole("group", { name: "Cloud Support Queen quantity" }),
    ).toBeInTheDocument();
    expect(count()).toHaveTextContent("3");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("increments and decrements by one", () => {
    render(<Harness initial={3} />);
    fireEvent.click(increase());
    expect(count()).toHaveTextContent("4");
    fireEvent.click(decrease());
    expect(count()).toHaveTextContent("3");
  });

  it("keeps catalogue quantities between 1 and 10", () => {
    render(<Harness />);
    expect(decrease()).toBeDisabled();
    fireEvent.click(decrease());
    expect(count()).toHaveTextContent("1");
    for (let i = 0; i < 9; i += 1) fireEvent.click(increase());
    expect(count()).toHaveTextContent("10");
    expect(increase()).toBeDisabled();
    fireEvent.click(increase());
    expect(count()).toHaveTextContent("10");
  });

  it("lets gifts be cleared to zero and caps them at four", () => {
    render(<Harness min={0} max={4} initial={1} />);
    fireEvent.click(decrease());
    expect(count()).toHaveTextContent("0");
    expect(decrease()).toBeDisabled();
    for (let i = 0; i < 4; i += 1) fireEvent.click(increase());
    expect(count()).toHaveTextContent("4");
    expect(increase()).toBeDisabled();
  });

  it("disables both actions without emitting changes", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper
        value={2}
        min={0}
        max={4}
        label="Cloud Support Queen"
        disabled
        onChange={onChange}
      />,
    );
    expect(decrease()).toBeDisabled();
    expect(increase()).toBeDisabled();
    fireEvent.click(decrease());
    fireEvent.click(increase());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses non-submit native buttons inside forms", () => {
    render(<Harness />);
    expect(increase()).toHaveAttribute("type", "button");
    expect(decrease()).toHaveAttribute("type", "button");
    increase().focus();
    expect(increase()).toHaveFocus();
  });
});
