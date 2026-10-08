import f from "@/components/member/app/shell/frame.module.css";

// From one page of the Revenue app to another — /member and its Product List
// (2026-10-08) — the app's shell stays up and only the page waits: without a
// boundary here Next holds the screen being left until the server has rendered
// the next one (route-boundaries.test.ts explains why it must be this folder).
export default function Loading() {
  return (
    <div role="status" className={f.pageWait}>
      <span className={f.spinner} aria-hidden="true" />
      <span className={f.srOnly}>Loading…</span>
    </div>
  );
}
