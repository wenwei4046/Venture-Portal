import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { fixtureTrainingApi } from "@/lib/rev-training/fixture";
import { NO_RIGHTS } from "@/lib/rev-training/api";
import TestsPage from "./TestsPage";
import LibraryPage from "./LibraryPage";

// 2026-11-16 — the Revenue app's Free test and Library, on the preview's sample; 2026-11-17 — points per question,
// written answers marked by hand.

const WRITER = { view: true, create: true, edit: true };

async function startSofa() {
  const card = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /Start|Take it again/ }));
  await screen.findByText(/of 3 answered/);
}

describe("Free test", () => {
  it("takes a test of points and a written answer: scored so far, the rest waiting for marking", async () => {
    const api = fixtureTrainingApi();
    const submit = vi.spyOn(api, "submit");
    render(<TestsPage api={api} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Manage/ })).toBeNull();
    const card = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article") as HTMLElement;
    expect(card.textContent).toContain("3 questions · 5 points");
    expect(card.textContent).toContain("Not taken yet");
    expect(card.textContent).toContain("your manager marks them");
    await startSofa();
    expect(screen.getByText(/Question 2 · Pick every right answer · 2 points/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /True/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /PU/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Nappa-touch/ }));
    fireEvent.change(screen.getByLabelText("Answer to question 3"), { target: { value: "  PU — a wipe is enough " } });
    expect(screen.getByText(/3 of 3 answered/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hand in" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("3 / 5");
    expect(status.textContent).toContain("2 points waiting for marking");
    expect(submit).toHaveBeenCalledWith("t-sofa", { "t-sofa-q0": [0], "t-sofa-q1": [1, 3], "t-sofa-q2": "  PU — a wipe is enough " });
    expect(screen.getByText(/Waiting for marking/, { selector: "span" })).toBeTruthy();
    // Back on the list: the last one waits, and no best yet.
    fireEvent.click(screen.getByRole("button", { name: "All tests" }));
    const again = (await screen.findByRole("heading", { name: "Sofa fabrics" })).closest("article") as HTMLElement;
    expect(again.textContent).toContain("waiting for marking");
    expect(within(again).getByRole("button", { name: "My last answers" })).toBeTruthy();
  });

  it("marks a wrong answer and the right one, and a blank written answer is 0", async () => {
    render(<TestsPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} />);
    await startSofa();
    fireEvent.click(screen.getByRole("radio", { name: /False/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hand in · 2 not answered" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("0 / 5");
    expect(screen.getAllByText(/Wrong/).length).toBe(2);
    expect(screen.getByText(/0 of 2/)).toBeTruthy();
    expect(screen.getByText("Left blank")).toBeTruthy();
    expect(screen.getAllByText("The right answer").length).toBeGreaterThan(0);
  });

  it("opens one's own marked attempt with the writer's points and comment", async () => {
    render(<TestsPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} />);
    const card = (await screen.findByRole("heading", { name: "Mattress basics" })).closest("article") as HTMLElement;
    expect(card.textContent).toContain("Best 7 / 10");
    fireEvent.click(within(card).getByRole("button", { name: "My last answers" }));
    expect((await screen.findByRole("status")).textContent).toContain("marked by PETER NG");
    expect(screen.getByText(/3 of 5/)).toBeTruthy();
    expect(screen.getByText("Good — also offer a topper.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save marks/ })).toBeNull();
  });

  it("nothing is handed in while viewing as somebody", async () => {
    render(<TestsPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly onBack={() => {}} />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Start|Take it again/ }))[0]);
    fireEvent.click((await screen.findAllByRole("radio"))[0]);
    expect((screen.getByRole("button", { name: "Read-only while viewing as" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a writer marks a written answer: every one its points, never past the question's", async () => {
    const api = fixtureTrainingApi();
    render(<TestsPage api={api} rights={WRITER} readOnly={false} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Manage · 1 to mark" }));
    fireEvent.click(await screen.findByRole("button", { name: /DANIEL LIM/ }));
    expect((await screen.findByRole("status")).textContent).toContain("5 points waiting for marking");
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give every written answer its points.");
    fireEvent.change(screen.getByLabelText("Points for question 5"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A written answer gets at most its question's 5 points.");
    fireEvent.change(screen.getByLabelText("Points for question 5"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Comment on question 5"), { target: { value: "Mention the topper." } });
    fireEvent.click(screen.getByRole("button", { name: "Save marks" }));
    await screen.findByText("Marks saved.");
    expect(screen.getAllByRole("status")[0].textContent).toContain("7 / 10");
    const toMark = await api.toMark();
    expect(toMark.ok && toMark.data).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Manage/ }));
    expect(await screen.findByRole("tab", { name: "Manage" })).toBeTruthy();
  });

  it("a writer writes a test of every type with its points, and reads everybody's scores", async () => {
    const api = fixtureTrainingApi();
    render(<TestsPage api={api} rights={WRITER} readOnly={false} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Manage/ }));
    fireEvent.click(await screen.findByRole("button", { name: "+ New test" }));
    fireEvent.click(screen.getByRole("button", { name: "Save test" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give the test a title.");
    fireEvent.change(screen.getByPlaceholderText("e.g. Mattress basics"), { target: { value: "Deposits" } });
    fireEvent.change(screen.getByLabelText("Question 1"), { target: { value: "Is a deposit refundable?" } });
    fireEvent.change(screen.getByLabelText("Question 1 type"), { target: { value: "truefalse" } });
    fireEvent.change(screen.getByLabelText("Question 1 points"), { target: { value: "2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Right?" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "+ Add a question" }));
    fireEvent.change(screen.getByLabelText("Question 2 type"), { target: { value: "paragraph" } });
    fireEvent.change(screen.getByLabelText("Question 2 points"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Question 2"), { target: { value: "Explain the deposit to a customer." } });
    expect(screen.getByText(/2 questions · 12 points in all/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Published/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save test" }));
    await screen.findByRole("heading", { name: "Deposits" });
    const id = (await api.adminTests() as { ok: true; data: { id: string; title: string }[] }).data.find(t => t.title === "Deposits")!.id;
    const saved = await api.adminTest(id);
    expect(saved.ok && saved.data.questions.map(q => [q.kind, q.correct, q.points, q.choices])).toEqual([["truefalse", [1], 2, ["True", "False"]], ["paragraph", [], 10, []]]);

    const mattress = screen.getByRole("heading", { name: "Mattress basics" }).closest("article") as HTMLElement;
    fireEvent.click(within(mattress).getByRole("button", { name: "Scores" }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("SHAWN WONG").closest("tr")!.textContent).toContain("Not taken");
    expect(within(table).getByText("DANIEL LIM").closest("tr")!.textContent).toContain("To mark");
  });
});

describe("Library", () => {
  it("lists every category, New until opened, and counts it for Profile", async () => {
    const seen = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<LibraryPage api={fixtureTrainingApi()} rights={NO_RIGHTS} readOnly={false} onBack={() => {}} onSeen={seen} />);
    await screen.findByText("November price list");
    expect(screen.getByRole("tab", { name: "All · 2 new" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ Add file or link" })).toBeNull();
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith(2));
    fireEvent.click(screen.getByRole("button", { name: /November price list/ }));
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith(1));
    expect(screen.getByRole("tab", { name: "All · 1 new" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Sales skills" }));
    expect(screen.queryByText("Showroom tour")).toBeNull();
    expect(screen.getByText(/too expensive/)).toBeTruthy();
  });

  it("a writer adds a link and a category, and deletes", async () => {
    render(<LibraryPage api={fixtureTrainingApi()} rights={WRITER} readOnly={false} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Add file or link" }));
    fireEvent.click(screen.getByRole("radio", { name: "A link" }));
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "https://youtu.be/abc" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "How to close" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to the Library" }));
    expect(await screen.findByText("How to close")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+ Category" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Objection handling"), { target: { value: "product knowledge" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const row = screen.getByText("How to close").closest("[data-lib-item]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(row).getByRole("button", { name: "Tap again to delete" }));
    await waitFor(() => expect(screen.queryByText("How to close")).toBeNull());
  });
});
