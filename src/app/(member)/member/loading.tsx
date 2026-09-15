import s from "@/components/member/member.module.css";
export default function Loading() {
  return (
    <div className={s.workspace} data-arena-design="c" style={{ background: "#fff", color: "rgb(78 47 32)" }}>
      <main className={s.login} role="status">
        <div className={s.wordmark}>HOUZS VENTURE</div>
        <p className={s.sub} style={{ marginTop: 28 }}>
          Preparing your Revenue workspace…
        </p>
      </main>
    </div>
  );
}
