import { useState, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMemberQuote } from "@/app/(member)/member/actions";
import { calculateQuote } from "@/lib/member/calculator";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, QuoteInput } from "@/lib/member/types";
import MemberQuoteBuilder from "./MemberQuoteBuilder";

vi.mock("@/app/(member)/member/actions", () => ({
  calculateMemberQuote: vi.fn(),
}));

const blankQuote = (): QuoteInput => ({
  schemeId: "fair-scheme",
  lines: [],
  price: "",
  delivery: "0",
});

function twoBrandCatalogue(): MemberData {
  const data = memberDemo();
  const products = data.products.filter((product) => product.brand === "Akemi");
  return {
    ...data,
    products: [
      ...products,
      ...products.map((product) => ({
        ...product,
        id: `zanotti-${product.id}`,
        code: `ZANOTTI-${product.code}`,
        name: `Zanotti ${product.name}`,
        brand: "Zanotti",
      })),
    ],
  };
}

/** The surrounding workspace owns the cart and dialogs across builder views. */
function WorkspaceHarness({
  initialInput = blankQuote(),
  data = memberDemo(),
  online = true,
  productSelection,
}: {
  initialInput?: QuoteInput;
  data?: MemberData;
  online?: boolean;
  productSelection?: { id: string; key: number } | null;
}) {
  const [input, setInput] = useState(initialInput);
  const [dialog, setDialog] = useState<{
    title: string;
    content: ReactNode;
  } | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <>
      <MemberQuoteBuilder
        data={data}
        input={input}
        setInput={setInput}
        online={online}
        notify={setNotice}
        openDialog={setDialog}
        closeDialog={() => setDialog(null)}
        productSelection={productSelection}
      />
      {notice && (
        <p role="status" aria-label="Notification">
          {notice}
        </p>
      )}
      {dialog && (
        <section role="dialog" aria-label={dialog.title}>
          <h2>{dialog.title}</h2>
          {dialog.content}
          <button onClick={() => setDialog(null)}>Close dialog</button>
        </section>
      )}
    </>
  );
}

function productCard(category = "Mattress") {
  return within(
    screen.getByRole("article", { name: `${category} product card` }),
  );
}

function selectModel(name: string | RegExp, category = "Mattress") {
  const card = productCard(category);
  const option = card.getByRole("option", { name }) as HTMLOptionElement;
  fireEvent.change(card.getByRole("combobox", { name: `${category} model` }), {
    target: { value: option.value },
  });
}

function selectBrand(brand: string, category = "Mattress") {
  fireEvent.change(
    productCard(category).getByRole("combobox", { name: `${category} brand` }),
    { target: { value: brand } },
  );
}

function addProduct(category = "Mattress") {
  fireEvent.click(
    productCard(category).getByRole("button", { name: "Add to cart" }),
  );
  expect(
    screen.getByRole("heading", { name: "Build your offer", level: 1 }),
  ).toBeInTheDocument();
  expect(new URL(window.location.href).searchParams.get("quoteView")).not.toBe(
    "calculator",
  );
}

function openCalculator() {
  fireEvent.click(screen.getByRole("button", { name: "Calculator" }));
  expect(
    screen.getByRole("heading", { name: "Calculator", level: 1 }),
  ).toBeInTheDocument();
}

function openCombination() {
  const toggle = screen.getByRole("button", { name: "Your combination" });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
}

function increaseQuantity(
  scope: ReturnType<typeof within>,
  name: string,
  times = 1,
) {
  for (let count = 0; count < times; count++)
    fireEvent.click(
      scope.getByRole("button", { name: `Increase ${name} quantity` }),
    );
}

function quantity(scope: ReturnType<typeof within>, name: string) {
  return within(scope.getByRole("group", { name: `${name} quantity` }));
}

function priceAndMargin() {
  return within(
    screen.getByRole("region", { name: "Price and margin calculator" }),
  );
}

function cart() {
  return within(screen.getByRole("region", { name: "Cart items" }));
}

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  window.history.replaceState({}, "", "/member/preview?page=quote");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  vi.mocked(calculateMemberQuote).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalScrollIntoView)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

describe("Member quote builder workflows", () => {
  it("offers brand and model selection in every category and changes one category without changing the others", () => {
    render(<WorkspaceHarness data={twoBrandCatalogue()} />);
    const categories = ["Mattress", "Bed frame", "Accessory", "Sofa"];
    for (const category of categories) {
      const card = productCard(category);
      expect(
        card.getByRole("combobox", { name: `${category} brand` }),
      ).toHaveDisplayValue("Akemi");
      expect(
        card.getByRole("combobox", { name: `${category} model` }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Quote steps")).not.toBeInTheDocument();

    fireEvent.click(productCard().getByRole("button", { name: "King" }));
    selectBrand("Zanotti");
    expect(
      productCard().getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Zanotti Cloud Support");
    expect(productCard().getByText("ZANOTTI-CLOUD-K")).toBeInTheDocument();
    expect(productCard().getByRole("button", { name: "King" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      productCard().queryByRole("option", {
        name: "Cloud Support",
      }),
    ).not.toBeInTheDocument();
    for (const category of categories.slice(1))
      expect(
        productCard(category).getByRole("combobox", {
          name: `${category} brand`,
        }),
      ).toHaveDisplayValue("Akemi");

    selectModel("Zanotti Cloud Comfort");
    expect(productCard().getByText("ZANOTTI-COMFORT-K")).toBeInTheDocument();
    selectBrand("Zanotti", "Sofa");
    expect(
      productCard("Sofa").getByRole("combobox", { name: "Sofa model" }),
    ).toHaveDisplayValue("Zanotti Everyday Sofa");
    expect(
      productCard().getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Zanotti Cloud Comfort");
    expect(
      productCard("Bed frame").getByRole("combobox", {
        name: "Bed frame brand",
      }),
    ).toHaveDisplayValue("Akemi");
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });

  it("lets another brand be browsed while blocking its addition and preserving the existing cart, price and charges", () => {
    render(
      <WorkspaceHarness
        data={twoBrandCatalogue()}
        initialInput={{
          ...blankQuote(),
          price: "5000",
          delivery: "150",
          lines: [
            { productId: "cloud-q", quantity: 1, gift: false },
            { productId: "pillow", quantity: 2, gift: true },
          ],
        }}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /^Calculator(?:\s|$)/ }),
    ).toHaveLength(1);
    selectBrand("Zanotti");
    selectModel("Zanotti Cloud Comfort");
    expect(
      productCard().getByText(
        "Your cart contains Akemi products. Quote Zanotti separately to use the correct margin tiers.",
      ),
    ).toBeInTheDocument();
    const add = productCard().getByRole("button", { name: "Add to cart" });
    expect(add).toBeDisabled();
    fireEvent.click(add);

    openCalculator();
    openCombination();
    expect(cart().getByText("1 product · 2 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Cloud Support")).toBeInTheDocument();
    expect(cart().getByText("Comfort Pillow")).toBeInTheDocument();
    expect(cart().queryByText(/Zanotti/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("58.60%")).toBeInTheDocument();
    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("150");
    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    expect(
      productCard().getByRole("combobox", { name: "Mattress brand" }),
    ).toHaveDisplayValue("Zanotti");
    expect(
      productCard().getByRole("button", { name: "Add to cart" }),
    ).toBeDisabled();
    selectBrand("Akemi");
    expect(
      productCard().getByRole("button", { name: "Add to cart" }),
    ).toBeEnabled();
  });

  it("clears free-gift drafts when changing brands, including when returning to a previously configured brand", () => {
    render(<WorkspaceHarness data={twoBrandCatalogue()} />);
    increaseQuantity(productCard(), "Cloud Support", 2);
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    let gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Comfort Pillow Standard", 2);
    fireEvent.click(gifts.getByRole("button", { name: "Use 2 free gifts" }));
    expect(
      productCard().getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("2 selected");

    selectBrand("Zanotti");
    expect(
      productCard().getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("Choose from accessories");
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      quantity(gifts, "Zanotti Comfort Pillow Standard").getByText("0"),
    ).toBeInTheDocument();
    expect(
      gifts.queryByRole("group", {
        name: "Comfort Pillow Standard quantity",
      }),
    ).not.toBeInTheDocument();
    increaseQuantity(gifts, "Zanotti Comfort Pillow Standard");
    fireEvent.click(gifts.getByRole("button", { name: "Use 1 free gifts" }));

    selectBrand("Akemi");
    expect(
      quantity(productCard(), "Cloud Support").getByText("1"),
    ).toBeInTheDocument();
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      quantity(gifts, "Comfort Pillow Standard").getByText("0"),
    ).toBeInTheDocument();
    fireEvent.click(gifts.getByRole("button", { name: "Use 0 free gifts" }));
    selectBrand("Zanotti");
    expect(
      productCard().getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("Choose from accessories");
    expect(screen.getByRole("button", { name: "Calculator" })).toBeDisabled();
  });

  it("opens a searched variant repeatedly without adding it or changing the current cart, selling price or charges", async () => {
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    const data = memberDemo();
    const initialInput: QuoteInput = {
      ...blankQuote(),
      price: "5000",
      delivery: "150",
      lines: [
        { productId: "cloud-q", quantity: 1, gift: false },
        { productId: "pillow", quantity: 2, gift: true },
      ],
    };
    const { rerender } = render(
      <WorkspaceHarness data={data} initialInput={initialInput} />,
    );
    expect(
      screen.getByRole("heading", { name: "Calculator", level: 1 }),
    ).toBeInTheDocument();

    rerender(
      <WorkspaceHarness
        data={data}
        initialInput={initialInput}
        productSelection={{ id: "comfort-s", key: 1 }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Build your offer", level: 1 }),
    ).toBeInTheDocument();
    expect(
      productCard().getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Cloud Comfort");
    expect(
      productCard().getByRole("button", { name: "Single" }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled(),
    );

    openCalculator();
    openCombination();
    expect(cart().getByText("Cloud Support")).toBeInTheDocument();
    expect(cart().getByText("Comfort Pillow")).toBeInTheDocument();
    expect(cart().queryByText("Cloud Comfort")).not.toBeInTheDocument();
    expect(cart().getByText("1 product · 2 free gifts")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("58.60%")).toBeInTheDocument();
    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("150");

    // Selecting the same search result again must navigate back to that variant.
    rerender(
      <WorkspaceHarness
        data={data}
        initialInput={initialInput}
        productSelection={{ id: "comfort-s", key: 2 }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Build your offer", level: 1 }),
    ).toBeInTheDocument();
    expect(
      productCard().getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Cloud Comfort");
    expect(
      productCard().getByRole("button", { name: "Single" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows one hero card per category in browsing order and switches mattress models in the same card", () => {
    render(<WorkspaceHarness />);
    expect(
      screen
        .getAllByRole("article")
        .map((card) => card.getAttribute("aria-label")),
    ).toEqual([
      "Mattress product card",
      "Bed frame product card",
      "Accessory product card",
      "Sofa product card",
    ]);
    expect(screen.getByRole("button", { name: "Calculator" })).toBeDisabled();
    const mattress = screen.getByRole("article", {
      name: "Mattress product card",
    });
    expect(
      within(mattress).getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Cloud Support");
    selectModel("Cloud Comfort");
    expect(
      within(mattress).getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Cloud Comfort");
    expect(within(mattress).getByText("COMFORT-Q")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    for (const size of ["Queen", "King", "Super Single", "Single"])
      expect(
        within(mattress).getByRole("button", { name: size }),
      ).toBeEnabled();
  });

  it("keeps browsing after each addition and clears quantity and free gifts before adding another model", () => {
    render(<WorkspaceHarness />);
    increaseQuantity(productCard(), "Cloud Support");
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    let gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Comfort Pillow Standard", 2);
    fireEvent.click(gifts.getByRole("button", { name: "Use 2 free gifts" }));
    addProduct();
    expect(
      screen.queryByRole("status", { name: "Notification" }),
    ).not.toBeInTheDocument();
    expect(
      productCard().getByRole("button", { name: "Add to cart" }),
    ).toHaveTextContent("Added");
    expect(
      quantity(productCard(), "Cloud Support").getByText("1"),
    ).toBeInTheDocument();
    expect(
      productCard().getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("Choose from accessories");
    expect(screen.getByRole("button", { name: "Calculator" })).toBeEnabled();
    expect(
      screen.queryByRole("textbox", { name: "Selling price" }),
    ).not.toBeInTheDocument();

    // Reopening the same model starts a new gift selection, not its last bundle.
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      quantity(gifts, "Comfort Pillow Standard").getByText("0"),
    ).toBeInTheDocument();
    fireEvent.click(gifts.getByRole("button", { name: "Use 0 free gifts" }));

    selectModel("Cloud Comfort");
    fireEvent.click(productCard().getByRole("button", { name: "Single" }));
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Mattress Protector Single");
    fireEvent.click(gifts.getByRole("button", { name: "Use 1 free gifts" }));
    addProduct();
    // A second click adds another mattress, without repeating the previous gift.
    addProduct();
    fireEvent.click(screen.getByRole("button", { name: "Calculator" }));
    expect(
      screen.getByRole("heading", { name: "Calculator", level: 1 }),
    ).toBeInTheDocument();
    openCombination();
    expect(cart().getByText("4 products · 3 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Cloud Support")).toBeInTheDocument();
    expect(cart().getByText("Cloud Comfort")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "10000" },
    });
    // Two Queens, two Singles, two pillows and one Single protector cost RM 6,405.
    expect(priceAndMargin().getByText("35.95%")).toBeInTheDocument();
  });

  it("keeps the combination collapsed for fast pricing and preserves the offer through expanding and returning from products", () => {
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    render(
      <WorkspaceHarness
        initialInput={{
          ...blankQuote(),
          price: "5000",
          lines: [{ productId: "cloud-q", quantity: 1, gift: false }],
        }}
      />,
    );
    const combination = screen.getByRole("button", {
      name: "Your combination",
    });
    expect(combination).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", {
        name: "Decrease Cloud Support Queen quantity",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add product" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("60.00%")).toBeInTheDocument();

    openCombination();
    expect(cart().getByRole("button", { name: "Add product" })).toBeEnabled();
    fireEvent.click(combination);
    expect(combination).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Add product" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("60.00%")).toBeInTheDocument();

    openCombination();
    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    openCalculator();
    expect(
      screen.getByRole("button", { name: "Your combination" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Add product" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("60.00%")).toBeInTheDocument();
  });

  it("clears the complete quote in one action and restores all products, gifts, price and charges with Undo", () => {
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    render(
      <WorkspaceHarness
        initialInput={{
          ...blankQuote(),
          price: "7999",
          delivery: "500",
          lines: [
            { productId: "cloud-ss", quantity: 3, gift: false },
            { productId: "pillow", quantity: 2, gift: true },
            { productId: "protector-ss", quantity: 1, gift: true },
          ],
        }}
      />,
    );
    openCombination();
    expect(cart().getByRole("button", { name: "Add product" })).toBeEnabled();
    expect(cart().getByRole("button", { name: "Clear all" })).toBeEnabled();
    expect(priceAndMargin().getByText("40.49%")).toBeInTheDocument();

    fireEvent.click(cart().getByRole("button", { name: "Clear all" }));
    expect(
      screen.getByRole("heading", { name: "Calculator", level: 1 }),
    ).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("quoteView")).toBe(
      "calculator",
    );
    expect(cart().getByText("0 products · 0 free gifts")).toBeInTheDocument();
    expect(
      cart().getByRole("heading", { name: "Your cart is empty" }),
    ).toBeInTheDocument();
    expect(cart().queryByText("Cloud Support")).not.toBeInTheDocument();
    expect(cart().queryByText("Comfort Pillow")).not.toBeInTheDocument();
    expect(cart().queryByText("Mattress Protector")).not.toBeInTheDocument();
    expect(cart().getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "",
    );
    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("0");
    expect(priceAndMargin().queryByText("40.49%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Undo clear all" }));
    expect(cart().getByText("3 products · 3 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Cloud Support")).toBeInTheDocument();
    expect(cart().getByText("Comfort Pillow")).toBeInTheDocument();
    expect(cart().getByText("Mattress Protector")).toBeInTheDocument();
    expect(
      cart()
        .getAllByLabelText("Quantity")
        .map((count) => count.textContent),
    ).toEqual(["3", "2", "1"]);
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "7999",
    );
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("500");
    expect(priceAndMargin().getByText("40.49%")).toBeInTheDocument();
    expect(cart().getByRole("button", { name: "Clear all" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Undo clear all" }),
    ).not.toBeInTheDocument();
  });

  it("clears pending product quantities and gifts before browsing again and does not restore an old quote after a new add", () => {
    render(
      <WorkspaceHarness
        initialInput={{
          ...blankQuote(),
          price: "7999",
          delivery: "500",
          lines: [{ productId: "cloud-ss", quantity: 3, gift: false }],
        }}
      />,
    );
    selectModel("Cloud Comfort");
    increaseQuantity(productCard(), "Cloud Comfort", 2);
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    let gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Comfort Pillow Standard", 2);
    fireEvent.click(gifts.getByRole("button", { name: "Use 2 free gifts" }));
    increaseQuantity(productCard("Bed frame"), "Studio Frame");
    fireEvent.click(
      productCard("Bed frame").getByRole("button", { name: /Free gifts/ }),
    );
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Mattress Protector Queen");
    fireEvent.click(gifts.getByRole("button", { name: "Use 1 free gifts" }));

    openCalculator();
    openCombination();
    fireEvent.click(cart().getByRole("button", { name: "Clear all" }));
    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    expect(
      productCard().getByRole("combobox", { name: "Mattress model" }),
    ).toHaveDisplayValue("Cloud Support");
    expect(
      quantity(productCard(), "Cloud Support").getByText("1"),
    ).toBeInTheDocument();
    selectModel("Cloud Comfort");
    expect(
      quantity(productCard(), "Cloud Comfort").getByText("1"),
    ).toBeInTheDocument();
    expect(
      productCard().getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("Choose from accessories");
    expect(
      quantity(productCard("Bed frame"), "Studio Frame").getByText("1"),
    ).toBeInTheDocument();
    expect(
      productCard("Bed frame").getByRole("button", { name: /Free gifts/ }),
    ).toHaveTextContent("Choose from accessories");
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      quantity(gifts, "Comfort Pillow Standard").getByText("0"),
    ).toBeInTheDocument();
    fireEvent.click(gifts.getByRole("button", { name: "Use 0 free gifts" }));

    addProduct();
    openCalculator();
    openCombination();
    expect(cart().getByText("1 product · 0 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Cloud Comfort")).toBeInTheDocument();
    expect(cart().queryByText("Cloud Support")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "",
    );
    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("0");
    expect(
      screen.queryByRole("button", { name: "Undo clear all" }),
    ).not.toBeInTheDocument();
  });

  it("keeps bed frames out of the accessory picker and sells a Hero Card frame without requiring a matching product", () => {
    render(<WorkspaceHarness />);
    expect(
      productCard("Accessory").queryByRole("option", { name: /Frame/ }),
    ).not.toBeInTheDocument();
    expect(
      productCard("Bed frame").getByRole("option", { name: /Essential Frame/ }),
    ).toBeEnabled();
    selectModel(/Essential Frame/, "Bed frame");
    for (const category of ["Bed frame", "Accessory"]) {
      const card = productCard(category);
      expect(card.queryByText("Free gift")).not.toBeInTheDocument();
      expect(
        card.queryByText(/This item is included as a free gift/),
      ).not.toBeInTheDocument();
      expect(
        card.queryByText("Add a matching product to your cart first."),
      ).not.toBeInTheDocument();
      expect(card.getByRole("button", { name: "Add to cart" })).toBeEnabled();
    }
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    const gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      gifts.queryByRole("option", { name: "Bed frame" }),
    ).not.toBeInTheDocument();
    expect(
      gifts.queryByRole("group", { name: /Essential Frame/ }),
    ).not.toBeInTheDocument();
    expect(
      gifts.getByRole("group", { name: "Comfort Pillow Standard quantity" }),
    ).toBeInTheDocument();
    fireEvent.click(gifts.getByRole("button", { name: "Use 0 free gifts" }));
    addProduct();
    for (const category of ["Bed frame", "Accessory"]) {
      const card = productCard(category);
      expect(
        card.queryByText("Add a matching product to your cart first."),
      ).not.toBeInTheDocument();
      expect(card.queryByText("Free gift")).not.toBeInTheDocument();
      expect(
        card.queryByText(/This item is included as a free gift/),
      ).not.toBeInTheDocument();
      expect(card.getByRole("button", { name: "Add to cart" })).toBeEnabled();
    }
    addProduct("Bed frame");
    openCalculator();
    openCombination();
    expect(cart().getByText("2 products · 0 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Essential Frame")).toBeInTheDocument();
    expect(cart().queryByText("Free gift")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    // The configured RM 280 frame cost is included even when it is sold as a product.
    expect(priceAndMargin().getByText("54.40%")).toBeInTheDocument();
  });

  it.each([
    {
      category: "Accessory",
      model: "Comfort Pillow",
      price: "100",
      margin: "65.00%",
      giftSofa: false,
    },
    {
      category: "Bed frame",
      model: "Essential Frame",
      price: "500",
      margin: "44.00%",
      giftSofa: false,
    },
    {
      category: "Sofa",
      model: "Everyday Sofa",
      price: "5000",
      margin: "56.00%",
      giftSofa: true,
    },
  ])(
    "sells $model as a standalone product even when its catalogue metadata permits gifts",
    async ({ category, model, price, margin, giftSofa }) => {
      const data = memberDemo();
      if (giftSofa)
        data.products = data.products.map((product) =>
          product.name === model ? { ...product, gift: true } : product,
        );
      render(<WorkspaceHarness data={data} />);
      selectModel(model, category);
      expect(
        productCard(category).getByRole("combobox", {
          name: `${category} model`,
        }),
      ).toHaveDisplayValue(model);
      expect(
        productCard(category).getByRole("button", { name: "Add to cart" }),
      ).toBeEnabled();
      expect(
        productCard(category).queryByText(/Add a matching product/),
      ).not.toBeInTheDocument();
      addProduct(category);
      openCalculator();
      openCombination();
      expect(cart().getByText("1 product · 0 free gifts")).toBeInTheDocument();
      expect(cart().getByText(model)).toBeInTheDocument();
      expect(cart().queryByText("Free gift")).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
        target: { value: price },
      });
      expect(priceAndMargin().getByText(margin)).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Preview customer quote" }),
      );
      const preview = await screen.findByRole("dialog", {
        name: "Customer quote",
      });
      expect(preview).toHaveTextContent(`Product · Akemi ${model}`);
      expect(preview).not.toHaveTextContent(`Free gift · Akemi ${model}`);
    },
  );

  it("keeps paid and free-gift copies of the same SKU independent when changing quantities or deleting either role", () => {
    render(<WorkspaceHarness />);
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    const gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Comfort Pillow Standard", 2);
    fireEvent.click(gifts.getByRole("button", { name: "Use 2 free gifts" }));
    addProduct();
    selectModel("Comfort Pillow", "Accessory");
    addProduct("Accessory");
    openCalculator();
    openCombination();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    expect(cart().getByText("2 products · 2 free gifts")).toBeInTheDocument();
    expect(cart().getAllByText("Comfort Pillow")).toHaveLength(2);
    expect(priceAndMargin().getByText("57.90%")).toBeInTheDocument();

    increaseQuantity(cart(), "Comfort Pillow Standard");
    expect(cart().getByText("3 products · 2 free gifts")).toBeInTheDocument();
    expect(priceAndMargin().getByText("57.20%")).toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Decrease Comfort Pillow Standard free gift quantity",
      }),
    );
    expect(cart().getByText("3 products · 1 free gift")).toBeInTheDocument();
    expect(priceAndMargin().getByText("57.90%")).toBeInTheDocument();

    fireEvent.click(
      cart().getByRole("button", {
        name: "Actions for Comfort Pillow Standard",
      }),
    );
    fireEvent.click(
      cart().getByRole("button", { name: "Delete Comfort Pillow Standard" }),
    );
    expect(cart().getByText("1 product · 1 free gift")).toBeInTheDocument();
    expect(cart().getAllByText("Comfort Pillow")).toHaveLength(1);
    expect(
      cart().getByRole("button", {
        name: "Increase Comfort Pillow Standard free gift quantity",
      }),
    ).toBeEnabled();
    expect(
      cart().queryByRole("button", {
        name: "Increase Comfort Pillow Standard quantity",
      }),
    ).not.toBeInTheDocument();
    expect(priceAndMargin().getByText("59.30%")).toBeInTheDocument();

    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    addProduct("Accessory");
    openCalculator();
    openCombination();
    expect(cart().getByText("2 products · 1 free gift")).toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Actions for Comfort Pillow Standard free gift",
      }),
    );
    fireEvent.click(
      cart().getByRole("button", {
        name: "Delete Comfort Pillow Standard free gift",
      }),
    );
    expect(cart().getByText("2 products · 0 free gifts")).toBeInTheDocument();
    expect(cart().getAllByText("Comfort Pillow")).toHaveLength(1);
    expect(
      cart().getByRole("button", {
        name: "Increase Comfort Pillow Standard quantity",
      }),
    ).toBeEnabled();
    expect(
      cart().queryByRole("button", {
        name: "Increase Comfort Pillow Standard free gift quantity",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      cart().getByRole("button", {
        name: "Decrease Cloud Support Queen quantity",
      }),
    );
    expect(cart().getByText("1 product · 0 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Comfort Pillow")).toBeInTheDocument();
    expect(cart().queryByText("Cloud Support")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("99.30%")).toBeInTheDocument();
  });

  it("updates quantities and the margin immediately without an edit mode", () => {
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    render(
      <WorkspaceHarness
        initialInput={{
          ...blankQuote(),
          price: "5000",
          lines: [
            { productId: "cloud-q", quantity: 2, gift: false },
            { productId: "pillow", quantity: 2, gift: true },
            { productId: "protector-q", quantity: 1, gift: true },
          ],
        }}
      />,
    );
    openCombination();
    expect(
      cart().queryByRole("button", { name: /Edit cart|Done editing/ }),
    ).not.toBeInTheDocument();
    expect(priceAndMargin().getByText("17.60%")).toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Decrease Cloud Support Queen quantity",
      }),
    );
    expect(cart().getByText("1 product · 3 free gifts")).toBeInTheDocument();
    expect(priceAndMargin().getByText("57.60%")).toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Increase Comfort Pillow Standard free gift quantity",
      }),
    );
    expect(cart().getByText("1 product · 4 free gifts")).toBeInTheDocument();
    expect(priceAndMargin().getByText("56.90%")).toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Decrease Mattress Protector Queen free gift quantity",
      }),
    );
    expect(cart().queryByText("Mattress Protector")).not.toBeInTheDocument();
    expect(cart().getByText("1 product · 3 free gifts")).toBeInTheDocument();
    expect(priceAndMargin().getByText("57.90%")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
  });

  it("selects a size, adds the product and calculates the typed price without including delivery in margin", () => {
    render(<WorkspaceHarness />);
    const card = productCard();
    for (const size of ["Queen", "King", "Super Single", "Single"])
      expect(card.getByRole("button", { name: size })).toBeEnabled();

    fireEvent.click(card.getByRole("button", { name: "King" }));
    expect(card.getByRole("button", { name: "King" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    addProduct();
    openCalculator();
    openCombination();

    expect(cart().getByText("King")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    // The King mattress costs RM 2,300: (5,000 - 2,300) / 5,000 = 54%.
    expect(priceAndMargin().getByText("54.00%")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeEnabled();

    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Additional charges" }),
      {
        target: { value: "300" },
      },
    );
    expect(priceAndMargin().getByText("54.00%")).toBeInTheDocument();
    expect(calculateMemberQuote).not.toHaveBeenCalled();
  });

  it("keeps the cart and selling price while browsing, then includes an additional size in the same calculation", () => {
    render(<WorkspaceHarness />);
    addProduct();
    openCalculator();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    openCombination();
    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    expect(
      screen.getByRole("heading", { name: "Build your offer" }),
    ).toBeInTheDocument();

    selectModel("Cloud Comfort");
    fireEvent.click(productCard().getByRole("button", { name: "Single" }));
    addProduct();
    openCalculator();
    openCombination();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(cart().getByText("Cloud Support")).toBeInTheDocument();
    expect(cart().getByText("Queen")).toBeInTheDocument();
    expect(cart().getByText("Cloud Comfort")).toBeInTheDocument();
    expect(cart().getByText("Single")).toBeInTheDocument();
    expect(cart().getByText("2 products · 0 free gifts")).toBeInTheDocument();
    // RM 2,000 Queen + RM 1,150 Single, offered together at RM 5,000.
    expect(priceAndMargin().getByText("37.00%")).toBeInTheDocument();

    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculator" }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("37.00%")).toBeInTheDocument();
  });

  it("selects compatible accessories as free gifts and includes their cost in the margin", () => {
    render(<WorkspaceHarness />);
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(dialog, "Comfort Pillow Standard", 2);
    fireEvent.change(
      dialog.getByRole("combobox", { name: "Accessory category" }),
      {
        target: { value: "protector" },
      },
    );
    expect(
      dialog.queryByRole("group", {
        name: "Comfort Pillow Standard quantity",
      }),
    ).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("group", {
        name: "Mattress Protector King quantity",
      }),
    ).not.toBeInTheDocument();
    increaseQuantity(dialog, "Mattress Protector Queen");
    fireEvent.click(dialog.getByRole("button", { name: "Use 3 free gifts" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    addProduct();
    openCalculator();
    openCombination();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    expect(cart().getByText("1 product · 3 free gifts")).toBeInTheDocument();
    expect(cart().getByText("Comfort Pillow")).toBeInTheDocument();
    expect(cart().getByText("Mattress Protector")).toBeInTheDocument();
    // RM 2,000 + two RM 35 pillows + RM 50 protector = RM 2,120 cost.
    expect(priceAndMargin().getByText("57.60%")).toBeInTheDocument();
  });

  it("removes the last product by decreasing its quantity and clears gifts that no longer have a matching product", () => {
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    render(
      <WorkspaceHarness
        initialInput={{
          ...blankQuote(),
          price: "5000",
          lines: [
            { productId: "cloud-q", quantity: 1, gift: false },
            { productId: "pillow", quantity: 2, gift: true },
            { productId: "protector-q", quantity: 1, gift: true },
          ],
        }}
      />,
    );
    openCombination();
    expect(
      cart().queryByRole("button", { name: "Edit cart" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      cart().getByRole("button", {
        name: "Decrease Cloud Support Queen quantity",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Your cart is empty" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Price and margin calculator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
    fireEvent.click(cart().getByRole("button", { name: "Add product" }));
    selectModel("Cloud Comfort");
    addProduct();
    openCalculator();
    openCombination();
    expect(cart().getByText("1 product · 0 free gifts")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("64.00%")).toBeInTheDocument();
  });

  it("uses the calculator keypad for a quick offer and clears the margin when the price is cleared", () => {
    render(<WorkspaceHarness />);
    addProduct();
    openCalculator();
    for (const digit of ["5", "0", "0", "0"])
      fireEvent.click(screen.getByRole("button", { name: digit }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000",
    );
    expect(priceAndMargin().getByText("60.00%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decimal point" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000.25",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete last digit" }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "5000.2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear price" }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue(
      "",
    );
    expect(priceAndMargin().getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
  });

  it("blocks a customer quote when the selected product has no configured cost", () => {
    render(<WorkspaceHarness />);
    selectModel("New Comfort");
    addProduct();
    openCalculator();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/cost/i);
    expect(priceAndMargin().getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
  });

  it("selects an available alternative colour when the current colour is unavailable in the new size", () => {
    const data = memberDemo();
    data.products = data.products.map((product) =>
      product.id === "frame-k-w" ? { ...product, available: false } : product,
    );
    render(<WorkspaceHarness data={data} />);
    const card = productCard("Bed frame");
    expect(
      card.getByRole("combobox", { name: "Studio Frame colour" }),
    ).toHaveValue("frame-q-w");
    expect(card.getByRole("button", { name: "King" })).toBeEnabled();

    fireEvent.click(card.getByRole("button", { name: "King" }));
    expect(
      card.getByRole("combobox", { name: "Studio Frame colour" }),
    ).toHaveValue("frame-k-o");
    expect(
      card.getByRole("option", { name: "Walnut · unavailable" }),
    ).toBeDisabled();
    expect(card.getByRole("button", { name: "Add to cart" })).toBeEnabled();
    addProduct("Bed frame");
    openCalculator();
    openCombination();
    expect(cart().getByText("King · Oat")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    expect(priceAndMargin().getByText("82.00%")).toBeInTheDocument();
  });

  it("opens accessories for the visible fallback when a catalogue refresh removes the selected variant", () => {
    const data = memberDemo();
    const { rerender } = render(<WorkspaceHarness data={data} />);
    fireEvent.click(productCard().getByRole("button", { name: "King" }));
    increaseQuantity(productCard(), "Cloud Support");
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    let gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    increaseQuantity(gifts, "Mattress Protector King");
    fireEvent.click(gifts.getByRole("button", { name: "Use 1 free gifts" }));

    const refreshed: MemberData = {
      ...data,
      refreshedAt: "2026-09-11T07:00:00Z",
      products: data.products.filter((product) => product.id !== "cloud-k"),
    };
    rerender(<WorkspaceHarness data={refreshed} />);
    expect(
      productCard().getByRole("button", { name: "Queen" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      productCard().queryByRole("button", { name: "King" }),
    ).not.toBeInTheDocument();
    fireEvent.click(productCard().getByRole("button", { name: /Free gifts/ }));
    gifts = within(
      screen.getByRole("dialog", { name: "Free gifts · Accessories" }),
    );
    expect(
      gifts.getByText(/Accessories for Cloud Support · Queen/),
    ).toBeInTheDocument();
    expect(
      gifts.queryByRole("group", {
        name: "Mattress Protector King quantity",
      }),
    ).not.toBeInTheDocument();
    expect(
      gifts.getByRole("button", { name: "Use 0 free gifts" }),
    ).toBeEnabled();
    increaseQuantity(gifts, "Mattress Protector Queen");
    fireEvent.click(gifts.getByRole("button", { name: "Use 1 free gifts" }));
    addProduct();
    openCalculator();
    openCombination();
    expect(cart().getByText("2 products · 1 free gift")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    // The refreshed choice is two RM 2,000 Queens and one RM 50 Queen protector.
    expect(priceAndMargin().getByText("19.00%")).toBeInTheDocument();
  });

  it("clears a suggestion undo after a delivery edit so undo cannot restore an outdated fee", () => {
    render(<WorkspaceHarness />);
    addProduct();
    openCalculator();
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this gift" }));
    expect(
      screen.getByRole("button", { name: "Undo offer change" }),
    ).toBeInTheDocument();
    openCombination();
    expect(cart().getByText("1 product · 1 free gift")).toBeInTheDocument();
    expect(priceAndMargin().getByText("59.30%")).toBeInTheDocument();

    fireEvent.click(
      screen.getByText(/Additional charges/, { selector: "summary" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Additional charges" }),
      {
        target: { value: "150" },
      },
    );
    expect(
      screen.queryByRole("button", { name: "Undo offer change" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Additional charges" }),
    ).toHaveValue("150");
    expect(cart().getByText("1 product · 1 free gift")).toBeInTheDocument();
    expect(priceAndMargin().getByText("59.30%")).toBeInTheDocument();
  });

  it("ignores an older live response after the salesperson changes the selling price", async () => {
    const data = memberDemo();
    data.demo = false;
    const initial: QuoteInput = {
      ...blankQuote(),
      price: "5000",
      lines: [{ productId: "cloud-q", quantity: 1, gift: false }],
    };
    type Response = Awaited<ReturnType<typeof calculateMemberQuote>>;
    let resolveOld!: (response: Response) => void;
    let resolveNew!: (response: Response) => void;
    vi.mocked(calculateMemberQuote)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    render(<WorkspaceHarness data={data} initialInput={initial} />);
    await waitFor(() => expect(calculateMemberQuote).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("textbox", { name: "Selling price" }), {
      target: { value: "6000" },
    });
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
    await waitFor(() => expect(calculateMemberQuote).toHaveBeenCalledTimes(2));
    const latest = { ...initial, price: "6000" };
    await act(async () =>
      resolveNew({
        ok: true,
        data: calculateQuote(latest, data.products, data.bands),
      }),
    );
    expect(priceAndMargin().getByText("66.67%")).toBeInTheDocument();
    await act(async () =>
      resolveOld({
        ok: true,
        data: calculateQuote(initial, data.products, data.bands),
      }),
    );
    expect(priceAndMargin().getByText("66.67%")).toBeInTheDocument();
    expect(priceAndMargin().queryByText("60.00%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeEnabled();
  });

  it("waits for a fresh live margin after reconnecting instead of restoring the offline result", async () => {
    const data = memberDemo();
    data.demo = false;
    const initial: QuoteInput = {
      ...blankQuote(),
      price: "5000",
      lines: [{ productId: "cloud-q", quantity: 1, gift: false }],
    };
    type Response = Awaited<ReturnType<typeof calculateMemberQuote>>;
    let resolveReconnected!: (response: Response) => void;
    vi.mocked(calculateMemberQuote)
      .mockResolvedValueOnce({
        ok: true,
        data: calculateQuote(initial, data.products, data.bands),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReconnected = resolve;
          }),
      );
    window.history.replaceState(
      {},
      "",
      "/member/preview?page=quote&quoteView=calculator",
    );
    const { rerender } = render(
      <WorkspaceHarness data={data} initialInput={initial} />,
    );
    await waitFor(() =>
      expect(priceAndMargin().getByText("60.00%")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeEnabled();

    rerender(
      <WorkspaceHarness data={data} initialInput={initial} online={false} />,
    );
    expect(priceAndMargin().queryByText("60.00%")).not.toBeInTheDocument();
    expect(priceAndMargin().getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reconnect to check the latest product costs.",
    );
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();

    rerender(<WorkspaceHarness data={data} initialInput={initial} online />);
    expect(priceAndMargin().queryByText("60.00%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeDisabled();
    await waitFor(() => expect(calculateMemberQuote).toHaveBeenCalledTimes(2));
    expect(priceAndMargin().queryByText("60.00%")).not.toBeInTheDocument();
    // Costs can change while disconnected, even when the cart and price stay the same.
    const freshProducts = data.products.map((product) =>
      product.id === "cloud-q"
        ? { ...product, cost: 2500, version: "2026-09-11T09:00:00Z" }
        : product,
    );
    await act(async () =>
      resolveReconnected({
        ok: true,
        data: calculateQuote(initial, freshProducts, data.bands),
      }),
    );
    expect(priceAndMargin().getByText("50.00%")).toBeInTheDocument();
    expect(priceAndMargin().queryByText("60.00%")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview customer quote" }),
    ).toBeEnabled();
  });
});

// Product List › Modular decides what the calculator's dropdowns offer (user
// 2026-09-24): a sofa's leg heights and specials, a bed frame's divan / leg /
// total / gap heights and specials — only what every model in the cart was
// ticked for.
describe("build options from the Product List", () => {
  function catalogueData(): MemberData {
    const data = memberDemo();
    return {
      ...data,
      products: data.products.map((product) =>
        product.id === "sofa-2-o"
          ? { ...product, modelId: "everyday", kind: "SOFA" }
          : product.id === "sofa-3-w"
            ? { ...product, modelId: "lounge", kind: "SOFA" }
            : product,
      ),
      catalogueModels: [
        { id: "everyday", kind: "SOFA", options: { leg_heights: ["Default", '4"'], specials: ["Nylon Fabric", "Pillow Back"] } },
        { id: "lounge", kind: "SOFA", options: { leg_heights: ['4"'], specials: ["Nylon Fabric"] } },
      ],
    };
  }
  const sofaCart = (ids: string[], build?: QuoteInput["build"]): QuoteInput => ({
    ...blankQuote(),
    lines: ids.map((productId) => ({ productId, quantity: 1, gift: false })),
    build,
  });

  it("offers the ticked leg heights and specials for the sofa in the cart", () => {
    render(<WorkspaceHarness data={catalogueData()} initialInput={sofaCart(["sofa-2-o"])} />);
    openCalculator();
    const build = within(screen.getByRole("region", { name: "Sofa build" }));
    const leg = build.getByRole("combobox", { name: "Leg height" }) as HTMLSelectElement;
    expect([...leg.options].map((o) => o.textContent)).toEqual(["Not chosen", "Default", '4"']);
    fireEvent.change(leg, { target: { value: '4"' } });
    expect(leg.value).toBe('4"');
    const nylon = build.getByRole("checkbox", { name: "Nylon Fabric" });
    fireEvent.click(nylon);
    expect(nylon).toBeChecked();
    expect(build.getByRole("checkbox", { name: "Pillow Back" })).not.toBeChecked();
  });

  it("offers only what every sofa model in the cart shares", () => {
    render(<WorkspaceHarness data={catalogueData()} initialInput={sofaCart(["sofa-2-o", "sofa-3-w"])} />);
    openCalculator();
    const build = within(screen.getByRole("region", { name: "Sofa build" }));
    const leg = build.getByRole("combobox", { name: "Leg height" }) as HTMLSelectElement;
    expect([...leg.options].map((o) => o.textContent)).toEqual(["Not chosen", '4"']);
    expect(build.queryByRole("checkbox", { name: "Pillow Back" })).not.toBeInTheDocument();
    expect(build.getByRole("checkbox", { name: "Nylon Fabric" })).toBeInTheDocument();
  });

  it("drops a chosen option the cart no longer offers", () => {
    render(
      <WorkspaceHarness
        data={catalogueData()}
        initialInput={sofaCart(["sofa-2-o", "sofa-3-w"], { leg: "Default", specials: ["Pillow Back"] })}
      />,
    );
    openCalculator();
    const build = within(screen.getByRole("region", { name: "Sofa build" }));
    expect((build.getByRole("combobox", { name: "Leg height" }) as HTMLSelectElement).value).toBe("");
    expect(build.getByRole("checkbox", { name: "Nylon Fabric" })).not.toBeChecked();
  });

  it("shows no build options for a cart without a ticked model", () => {
    render(<WorkspaceHarness data={memberDemo()} initialInput={sofaCart(["sofa-2-o"])} />);
    openCalculator();
    expect(screen.queryByRole("combobox", { name: "Leg height" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Bed frame build" })).not.toBeInTheDocument();
  });
});
