import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItFile, ItNote, ItRequest } from "@/lib/it-requests/model";
import ItPage from "./ItPage";
import ItRequestForm from "./ItRequestForm";
import ItRequestSheet from "./ItRequestSheet";

// IT support (2026-10-20 — the user: "i want add on a button to get submit for IT support or help" … "他也能看到自己
// submit 的 case status。如果我们给它 fix 了，他那边就可以收到 fix 的通知"; everybody's in a list for "just principal or
// ulitmate full access").
const bucket = vi.hoisted(() => ({ remove: vi.fn(async () => {}) }));
vi.mock("@/lib/it-requests/upload", () => ({
  uploadItFile: vi.fn(async () => ({ ok: false, reason: "no bucket in this test" })),
  removeItUpload: bucket.remove,
}));
vi.mock("@/components/it-requests/ImageAnnotator", () => ({
  default: ({ src, onSave, onClose }: { src: string; onSave: (file: File) => void; onClose: () => void }) => <div role="dialog" aria-label="Annotate screenshot" data-src={src}>
    <button onClick={() => onSave(new File(["marked"], "shot-marked.png", { type: "image/png" }))}>Save marked copy</button>
    <button onClick={onClose}>Cancel annotation</button>
  </div>,
}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); bucket.remove.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const request = (over: Partial<ItRequest> = {}): ItRequest => ({
  id: "r1", ref: "IT-0007", category: "bug", title: "The Quote freezes on step 2", details: "Tapped Next twice.\nNothing happens.",
  status: "new", app: "revenue", device: "iPhone · iOS 18.1 · Safari · app · 390×844",
  createdAt: "2026-10-20T02:15:00Z", updatedAt: "2026-10-20T02:15:00Z", statusAt: null, statusByName: null,
  senderName: "CHEA HUAN", senderTitle: "Team Leader", mine: true, files: [], notes: [], ...over,
});
const file = (over: Partial<ItFile>): ItFile => ({ id: "f1", noteId: null, name: "shot.png", contentType: "image/png", size: 2048, at: "2026-10-20T02:15:00Z", ...over });
const note = (over: Partial<ItNote>): ItNote => ({
  id: "n1", side: "it", authorName: "ANTHONY", body: "Looking at it.", statusFrom: "new", statusTo: "in_progress", at: "2026-10-20T03:00:00Z", mine: false, ...over,
});

/** A bucket that takes every file at once: its path in the uploader's folder. */
const takes = () => vi.fn(async (f: File) => ({ ok: true as const, file: { path: `u1/k-${f.name}/${f.name}`, name: f.name, contentType: f.type, size: f.size } }));
const attach = (...files: File[]) => fireEvent.change(screen.getByTestId("it-files"), { target: { files } });
const png = (name = "shot.png") => new File(["picture"], name, { type: "image/png" });

describe("screenshot annotation in the Revenue thread", () => {
  it("attaches a marked copy to the draft without changing the original or sending until asked", async () => {
    const upload = takes();
    const onNote = vi.fn(async () => ({ ok: true as const, data: request() }));
    const sign = vi.fn(async () => ({ ok: true as const, data: { f1: "https://example.invalid/signed-shot" } }));
    render(<ItRequestSheet open request={request({ mine: false, files: [file({})] })} canEdit readOnly={false}
      onNote={onNote} onClose={vi.fn()} sign={sign} upload={upload} />);
    const annotate = await screen.findByRole("button", { name: "Annotate shot.png" });
    // The preview's link may have run out while the sheet stayed open: a fresh one is made at the press (2026-10-24).
    sign.mockResolvedValueOnce({ ok: true as const, data: { f1: "https://example.invalid/signed-at-the-press" } });
    fireEvent.click(annotate);
    expect(await screen.findByRole("dialog", { name: "Annotate screenshot" })).toHaveAttribute("data-src", "https://example.invalid/signed-at-the-press");
    expect(sign).toHaveBeenLastCalledWith(["f1"]);
    fireEvent.click(screen.getByRole("button", { name: "Save marked copy" }));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(onNote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open shot.png" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onNote).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({ name: "shot-marked.png" })],
    })));
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("offers no annotation when viewing a request read-only", async () => {
    render(<ItRequestSheet open request={request({ files: [file({})] })} canEdit={false} readOnly
      onNote={vi.fn()} onClose={vi.fn()} sign={async () => ({ ok: true, data: { f1: "https://example.invalid/shot" } })} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Annotate/ })).toBeNull();
  });
});

describe("IT support's page", () => {
  const page = (over: Partial<Parameters<typeof ItPage>[0]> = {}) => {
    const props = {
      mode: "mine" as const, mine: [request(), request({ id: "r2", ref: "IT-0003", title: "Arena shows last month", status: "fixed" as const, category: "suggestion" as const })],
      desk: null, deskOn: false, newCount: 0, error: null, filter: "all" as const, readOnly: false,
      onFilter: vi.fn(), onMode: vi.fn(), onBack: vi.fn(), onNew: vi.fn(), onOpen: vi.fn(), ...over,
    };
    render(<ItPage {...props} />);
    return props;
  };

  it("lists what one sent with its status, under Send a request — no Mine | All for a member", () => {
    const p = page();
    expect(screen.getByRole("heading", { name: "IT support" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Send a request/ }));
    expect(p.onNew).toHaveBeenCalledOnce();
    const row = screen.getByRole("button", { name: /The Quote freezes on step 2/ });
    expect(row).toHaveTextContent("IT-0007 · Bug · 20 Oct");
    expect(row).toHaveTextContent("New");
    fireEvent.click(row);
    expect(p.onOpen).toHaveBeenCalledWith("r1");
    fireEvent.click(screen.getByRole("button", { name: "Fixed" }));
    expect(p.onFilter).toHaveBeenCalledWith("fixed");
  });

  it("shows only the status picked, and says when none is", () => {
    page({ filter: "fixed" });
    expect(screen.getByRole("button", { name: /Arena shows last month/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /The Quote freezes/ })).toBeNull();
    cleanup();
    page({ filter: "closed" });
    expect(screen.getByText("None with this status.")).toBeInTheDocument();
  });

  it("says nothing was sent, that it is reading, or why it could not", () => {
    page({ mine: [] });
    expect(screen.getByText("Nothing sent yet.")).toBeInTheDocument();
    cleanup();
    page({ mine: null });
    expect(screen.getByRole("status")).toHaveTextContent("Loading the requests…");
    cleanup();
    page({ mine: null, error: "The read failed." });
    expect(screen.getByRole("alert")).toHaveTextContent("The read failed.");
  });

  it("gives the desk Mine | All — All counting the New ones, each row naming who sent it", () => {
    const p = page({ deskOn: true, mode: "all", newCount: 2, desk: [request({ mine: false }), request({ id: "r9", ref: "IT-0009", mine: false, senderName: "YUNY", status: "in_progress" })] });
    expect(screen.getByRole("heading", { name: "IT requests" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All · 2 new" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Everybody’s requests" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send a request/ })).toBeNull();
    expect(screen.getByRole("button", { name: /IT-0009/ })).toHaveTextContent("IT-0009 · Bug · YUNY · 20 Oct");
    fireEvent.click(screen.getByRole("tab", { name: "Mine" }));
    expect(p.onMode).toHaveBeenCalledWith("mine");
  });

  it("sends nothing in View as", () => {
    page({ readOnly: true });
    expect(screen.queryByRole("button", { name: /Send a request/ })).toBeNull();
  });
});

describe("Send to IT", () => {
  const form = (over: Partial<Parameters<typeof ItRequestForm>[0]> = {}) => {
    const props = { open: true, readOnly: false, onSubmit: vi.fn(async () => ({ ok: true as const, data: request() })), onClose: vi.fn(), upload: takes(), ...over };
    const view = render(<ItRequestForm {...props} />);
    return { ...props, view };
  };
  const send = () => fireEvent.click(screen.getByRole("button", { name: /^(Send to IT|Uploading files…|Sending…)$/ }));
  const fill = (title: string, details = "") => {
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: title } });
    if (details) fireEvent.change(screen.getByRole("textbox", { name: "Details" }), { target: { value: details } });
  };

  it("asks what it is, then a title, before anything is sent", () => {
    const f = form();
    send();
    expect(screen.getByRole("alert")).toHaveTextContent("Pick what it is: a bug, a new feature or a suggestion.");
    fireEvent.click(screen.getByRole("button", { name: "Fix a bug" }));
    expect(screen.getByRole("button", { name: "Fix a bug" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Something is broken or wrong")).toBeInTheDocument();
    send();
    expect(screen.getByRole("alert")).toHaveTextContent("Add a title.");
    expect(f.onSubmit).not.toHaveBeenCalled();
  });

  it("sends the files that went up and the device, and says its number", async () => {
    const f = form();
    fireEvent.click(screen.getByRole("button", { name: "New feature" }));
    fill("Export my income", "A PDF of the month.");
    attach(png());
    await waitFor(() => expect(screen.getByText("1 KB")).toBeInTheDocument());
    expect(f.upload).toHaveBeenCalledOnce();
    send();
    await screen.findByText("Sent to IT", { selector: "span" });
    expect(f.onSubmit).toHaveBeenCalledWith({
      category: "feature", title: "Export my income", details: "A PDF of the month.", device: expect.any(String),
      files: [{ path: "u1/k-shot.png/shot.png", name: "shot.png", contentType: "image/png", size: 7 }],
    });
    expect(screen.getByText("IT-0007")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(f.onClose).toHaveBeenCalled();
    // Sent: the files are filed — closing takes nothing out of the bucket.
    f.view.rerender(<ItRequestForm open={false} readOnly={false} onSubmit={f.onSubmit} onClose={f.onClose} upload={f.upload} />);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("says why a file cannot go, and holds the send until it is taken off", async () => {
    const f = form();
    fireEvent.click(screen.getByRole("button", { name: "Fix a bug" }));
    fill("It crashes");
    attach(new File(["MZ"], "tool.exe", { type: "application/x-msdownload" }));
    expect(screen.getByRole("alert")).toHaveTextContent("tool.exe: a picture, a video, a PDF, an Office file, a zip or a text file.");
    expect(f.upload).not.toHaveBeenCalled();
    send();
    expect(await screen.findByText("Take off the files that could not be uploaded, or add them again.")).toBeInTheDocument();
    expect(f.onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove tool.exe" }));
    send();
    await waitFor(() => expect(f.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: "bug", title: "It crashes", files: [] })));
  });

  it("waits for a file still going up", async () => {
    form({ upload: vi.fn(() => new Promise<never>(() => {})) });
    fireEvent.click(screen.getByRole("button", { name: "Suggestion" }));
    fill("Bigger buttons");
    attach(png());
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploading files…" })).toBeInTheDocument();
    send();
    expect(screen.getByRole("alert")).toHaveTextContent("Wait for the files to finish uploading.");
  });

  it("closed unsent, takes what went up out of the bucket again", async () => {
    const f = form();
    attach(png("a.png"), png("b.png"));
    await waitFor(() => expect(screen.getAllByText("1 KB")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(bucket.remove).toHaveBeenCalledWith("u1/k-a.png/a.png");
    f.view.rerender(<ItRequestForm open={false} readOnly={false} onSubmit={f.onSubmit} onClose={f.onClose} upload={f.upload} />);
    expect(bucket.remove).toHaveBeenCalledWith("u1/k-b.png/b.png");
    expect(bucket.remove).toHaveBeenCalledTimes(2);
    expect(f.onSubmit).not.toHaveBeenCalled();
  });

  it.each([true, false])("closing while a request sends waits for its result (saved: %s)", async saved => {
    type Result = Awaited<ReturnType<Parameters<typeof ItRequestForm>[0]["onSubmit"]>>;
    let finish!: (value: Result) => void;
    const onSubmit = vi.fn(() => new Promise<Result>(resolve => { finish = resolve; }));
    const f = form({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Fix a bug" }));
    fill("The Quote freezes");
    attach(png());
    await screen.findByText("1 KB");
    send();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    fireEvent.paste(screen.getByRole("textbox", { name: "Details" }), { clipboardData: { files: [png("late.png")] } });
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("it-files")).toBeDisabled();
    f.view.rerender(<ItRequestForm {...f} open={false} />);
    expect(bucket.remove).not.toHaveBeenCalled();
    await act(async () => { finish(saved ? { ok: true, data: request() } : { ok: false, error: "Could not send." }); });
    if (saved) expect(bucket.remove).not.toHaveBeenCalled();
    else expect(bucket.remove).toHaveBeenCalledExactlyOnceWith("u1/k-shot.png/shot.png");
  });

  it("fills in and sends nothing in View as", () => {
    form({ readOnly: true });
    expect(screen.getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add screenshots or files/ })).toBeDisabled();
  });
});

describe("A request, read", () => {
  const sheet = (r: ItRequest, over: Partial<Parameters<typeof ItRequestSheet>[0]> = {}) => {
    const props = {
      open: true, request: r, canEdit: false, readOnly: false, onClose: vi.fn(),
      onNote: vi.fn(async () => ({ ok: true as const, data: r })), openFile: vi.fn(),
      sign: vi.fn(async (ids: string[]) => ({ ok: true as const, data: Object.fromEntries(ids.map(id => [id, `https://files.example/${id}.png`])) })),
      upload: takes(), ...over,
    };
    const view = render(<ItRequestSheet {...props} />);
    return { ...props, view };
  };

  it("shows its sender what was sent, its pictures and files, and IT's notes — and the reply goes to IT", async () => {
    const r = request({
      status: "in_progress", statusAt: "2026-10-20T03:00:00Z", statusByName: "ANTHONY",
      files: [file({ id: "pic" }), file({ id: "log", name: "crash.pdf", contentType: "application/pdf", size: 3_565_158 })],
      notes: [note({})],
    });
    const p = sheet(r);
    const box = screen.getByRole("dialog", { name: "The Quote freezes on step 2" });
    expect(within(box).getByText("IT-0007")).toBeInTheDocument();
    expect(within(box).getByText("By").nextSibling).toHaveTextContent("You");
    expect(within(box).getByText("Type").nextSibling).toHaveTextContent("Bug");
    expect(within(box).getByText("Device").nextSibling).toHaveTextContent("iPhone · iOS 18.1 · Safari · app · 390×844");
    expect(within(box).getByText("ANTHONY · 20 Oct · 11:00").previousSibling).toHaveTextContent("In progress");
    expect(within(box).getByText(/Tapped Next twice/)).toBeInTheDocument();
    await waitFor(() => expect(box.querySelector('img[alt="shot.png"]')).toHaveAttribute("src", "https://files.example/pic.png"));
    expect(p.sign).toHaveBeenCalledWith(["pic"]);
    fireEvent.click(within(box).getByRole("button", { name: /crash\.pdf\s*3\.4 MB\s*Open/ }));
    expect(p.openFile).toHaveBeenCalledWith("log", "view");
    expect(within(box).getByText("IT · ANTHONY")).toBeInTheDocument();
    expect(within(box).getByText("Looking at it.")).toBeInTheDocument();
    expect(within(box).getByText(/^Marked/)).toHaveTextContent("Marked In progress");
    // Their reply: words, no status of their own.
    expect(within(box).getByText("REPLY")).toBeInTheDocument();
    expect(within(box).queryByRole("group", { name: "Status" })).toBeNull();
    expect(within(box).getByText("IT is told.")).toBeInTheDocument();
    fireEvent.click(within(box).getByRole("button", { name: "Send" }));
    expect(within(box).getByRole("alert")).toHaveTextContent("Write a note, attach a file or change the status.");
    fireEvent.change(within(box).getByRole("textbox", { name: "Your note" }), { target: { value: "Still happening." } });
    fireEvent.click(within(box).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(p.onNote).toHaveBeenCalledWith({ id: "r1", body: "Still happening.", files: [], status: null, current: "in_progress" }));
    await waitFor(() => expect(within(box).getByRole("textbox", { name: "Your note" })).toHaveValue(""));
  });

  it("lets IT requests · Edit write on anybody's and set its status — its sender is told", async () => {
    const p = sheet(request({ mine: false }), { canEdit: true });
    const box = screen.getByRole("dialog", { name: "The Quote freezes on step 2" });
    expect(within(box).getByText("By").nextSibling).toHaveTextContent("CHEA HUAN · Team Leader");
    expect(within(box).getByText("WRITE ON IT")).toBeInTheDocument();
    const status = within(box).getByRole("group", { name: "Status" });
    expect(within(status).getByRole("button", { name: "New" })).toHaveAttribute("aria-pressed", "true");
    expect(within(box).getByText("CHEA HUAN is told.")).toBeInTheDocument();
    fireEvent.click(within(status).getByRole("button", { name: "Fixed" }));
    fireEvent.click(within(box).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(p.onNote).toHaveBeenCalledWith({ id: "r1", body: "", files: [], status: "fixed", current: "new" }));
  });

  // 2026-10-27 — the user: "我这边写已经 fix 了，所以那个 close 是不需要的。等我这边按了已经 fix，这个 close 其实应该是由提出
  // 这个 request / support 的人去操作。他那边去 try 了功能之后，就可以在自己那边 close".
  it("gives IT New, In progress and Fixed — Closed is its sender's", () => {
    sheet(request({ mine: false, status: "fixed" }), { canEdit: true });
    const status = screen.getByRole("group", { name: "Status" });
    expect(within(status).getAllByRole("button").map(b => b.textContent)).toEqual(["New", "In progress", "Fixed"]);
    expect(screen.queryByRole("button", { name: "Close request" })).toBeNull();
  });

  it("lets its sender close it once IT has marked it Fixed, with their words if any", async () => {
    const p = sheet(request({ status: "fixed", statusAt: "2026-10-21T03:00:00Z", statusByName: "ANTHONY" }));
    const box = screen.getByRole("dialog", { name: "The Quote freezes on step 2" });
    fireEvent.change(within(box).getByRole("textbox", { name: "Your note" }), { target: { value: "Works now, thanks." } });
    fireEvent.click(within(box).getByRole("button", { name: "Close request" }));
    await waitFor(() => expect(p.onNote).toHaveBeenCalledWith({ id: "r1", body: "Works now, thanks.", files: [], status: "closed", current: "fixed" }));
    // Words alone are still a reply.
    p.onNote.mockClear();
    fireEvent.change(within(box).getByRole("textbox", { name: "Your note" }), { target: { value: "Not yet on Android." } });
    fireEvent.click(within(box).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(p.onNote).toHaveBeenCalledWith({ id: "r1", body: "Not yet on Android.", files: [], status: null, current: "fixed" }));
  });

  it.each(["new", "in_progress", "closed"] as const)("offers no Close request while it is %s, nor in View as", status => {
    sheet(request({ status }));
    expect(screen.queryByRole("button", { name: "Close request" })).toBeNull();
    cleanup();
    sheet(request({ status: "fixed" }), { readOnly: true });
    expect(screen.queryByRole("button", { name: "Close request" })).toBeNull();
  });

  it("says a refusal where it was sent", async () => {
    sheet(request(), { onNote: vi.fn(async () => ({ ok: false as const, error: "That request is not yours to write on." })) });
    fireEvent.change(screen.getByRole("textbox", { name: "Your note" }), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That request is not yours to write on.");
  });

  it("closing an unsent reply removes its uploads", async () => {
    const p = sheet(request());
    attach(png());
    await screen.findByText("1 KB");
    p.view.rerender(<ItRequestSheet {...p} open={false} />);
    expect(bucket.remove).toHaveBeenCalledExactlyOnceWith("u1/k-shot.png/shot.png");
    expect(p.onNote).not.toHaveBeenCalled();
  });

  it("closing while a reply's file uploads removes it when it arrives", async () => {
    type Uploaded = Awaited<ReturnType<ReturnType<typeof takes>>>;
    let finish!: (value: Uploaded) => void;
    const upload = vi.fn(() => new Promise<Uploaded>(resolve => { finish = resolve; }));
    const p = sheet(request(), { upload });
    attach(png());
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    p.view.unmount();
    await act(async () => { finish(await takes()(png())); });
    expect(bucket.remove).toHaveBeenCalledExactlyOnceWith("u1/k-shot.png/shot.png");
  });

  it("a sent reply keeps its files when the request closes", async () => {
    const p = sheet(request());
    attach(png());
    await screen.findByText("1 KB");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.queryByText("shot.png")).toBeNull());
    p.view.unmount();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it.each([true, false])("closing while a reply sends waits for its result (saved: %s)", async saved => {
    type Result = Awaited<ReturnType<Parameters<typeof ItRequestSheet>[0]["onNote"]>>;
    let finish!: (value: Result) => void;
    const onNote = vi.fn(() => new Promise<Result>(resolve => { finish = resolve; }));
    const p = sheet(request(), { onNote });
    attach(png());
    await screen.findByText("1 KB");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    fireEvent.paste(screen.getByRole("textbox", { name: "Your note" }), { clipboardData: { files: [png("late.png")] } });
    expect(p.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("it-files")).toBeDisabled();
    p.view.unmount();
    expect(bucket.remove).not.toHaveBeenCalled();
    await act(async () => { finish(saved ? { ok: true, data: request() } : { ok: false, error: "Could not save." }); });
    if (saved) expect(bucket.remove).not.toHaveBeenCalled();
    else expect(bucket.remove).toHaveBeenCalledExactlyOnceWith("u1/k-shot.png/shot.png");
  });

  it("reads and writes nothing in View as", async () => {
    sheet(request({ mine: false }), { canEdit: true, readOnly: true });
    await act(async () => {});
    expect(screen.queryByRole("textbox", { name: "Your note" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
