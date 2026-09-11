import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SwipeCartRow from "./SwipeCartRow";

afterEach(cleanup);

function Harness({
  onDelete = () => {},
  initialOpen = false,
}: {
  onDelete?: () => void;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [quantity, setQuantity] = useState(1);
  return (
    <SwipeCartRow
      id="mattress-queen"
      label="Cloud Support Queen"
      open={open}
      onOpenChange={setOpen}
      onDelete={onDelete}
    >
      <p>Cloud Support</p>
      <button onClick={() => setQuantity((value) => value + 1)}>
        Increase quantity
      </button>
      <output>{quantity}</output>
    </SwipeCartRow>
  );
}

const actions = () =>
  screen.getByRole("button", { name: "Actions for Cloud Support Queen" });
const content = () => screen.getByText("Cloud Support");
const deleteButton = () =>
  screen.getByRole("button", { name: "Delete Cloud Support Queen" });

function start(target: Element, x = 240, y = 100) {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
}

function move(target: Element, x: number, y = 100) {
  fireEvent.pointerMove(target, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

function end(target: Element, x: number, y = 100) {
  fireEvent.pointerUp(target, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

describe("SwipeCartRow", () => {
  it("keeps the hidden Delete action out of the tab order", () => {
    const { container } = render(<Harness />);
    const hiddenDelete = container.querySelector<HTMLButtonElement>(
      "button[id^='cart-delete-']",
    )!;
    expect(actions()).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Delete Cloud Support Queen" }),
    ).not.toBeInTheDocument();
    expect(hiddenDelete).toBeDisabled();
    expect(hiddenDelete.tabIndex).toBe(-1);
  });

  it("offers an actions button for keyboard and desktop use, and only deletes on click", () => {
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    fireEvent.click(actions());
    expect(actions()).toHaveAttribute("aria-expanded", "true");
    expect(deleteButton()).toBeEnabled();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(deleteButton());
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("opens after a left swipe without deleting the item", () => {
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    start(content());
    move(content(), 180);
    end(content(), 180);
    expect(actions()).toHaveAttribute("aria-expanded", "true");
    expect(deleteButton()).toBeEnabled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("snaps a short swipe closed", () => {
    render(<Harness />);
    start(content());
    move(content(), 220);
    end(content(), 220);
    expect(actions()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes an open row with a right swipe", () => {
    render(<Harness initialOpen />);
    start(content(), 100);
    move(content(), 160);
    end(content(), 160);
    expect(actions()).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves vertical scrolling even if a vertical gesture later moves sideways", () => {
    render(<Harness />);
    start(content());
    move(content(), 235, 130);
    move(content(), 100, 140);
    end(content(), 100, 140);
    expect(actions()).toHaveAttribute("aria-expanded", "false");
  });

  it("does not intercept quantity controls", () => {
    render(<Harness />);
    const quantity = screen.getByRole("button", { name: "Increase quantity" });
    start(quantity);
    move(quantity, 130);
    end(quantity, 130);
    fireEvent.click(quantity);
    expect(actions()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("status")).toHaveTextContent("2");
  });

  it.each([false, true])(
    "cancelling a swipe returns to the previous open state (%s)",
    (initialOpen) => {
      render(<Harness initialOpen={initialOpen} />);
      start(content(), initialOpen ? 100 : 240);
      move(content(), initialOpen ? 180 : 150);
      fireEvent.pointerCancel(content(), { pointerId: 1 });
      expect(actions()).toHaveAttribute("aria-expanded", String(initialOpen));
    },
  );

  it("Escape closes Delete and restores focus to the actions button", () => {
    render(<Harness initialOpen />);
    deleteButton().focus();
    fireEvent.keyDown(deleteButton(), { key: "Escape" });
    expect(actions()).toHaveAttribute("aria-expanded", "false");
    expect(actions()).toHaveFocus();
  });

  it("lets the parent keep only one row open", () => {
    function Cart() {
      const [openId, setOpenId] = useState<string | null>(null);
      return ["Mattress", "Pillow"].map((label) => (
        <SwipeCartRow
          key={label}
          id={label}
          label={label}
          open={openId === label}
          onOpenChange={(open) => setOpenId(open ? label : null)}
          onDelete={() => {}}
        >
          {label}
        </SwipeCartRow>
      ));
    }
    render(<Cart />);
    const mattress = within(screen.getByRole("group", { name: "Mattress" }));
    const pillow = within(screen.getByRole("group", { name: "Pillow" }));
    fireEvent.click(
      mattress.getByRole("button", { name: "Actions for Mattress" }),
    );
    fireEvent.click(pillow.getByRole("button", { name: "Actions for Pillow" }));
    expect(
      mattress.queryByRole("button", { name: "Delete Mattress" }),
    ).not.toBeInTheDocument();
    expect(pillow.getByRole("button", { name: "Delete Pillow" })).toBeEnabled();
  });
});
