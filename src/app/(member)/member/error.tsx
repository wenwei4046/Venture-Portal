"use client";
import s from "@/components/member/member.module.css";
export default function MemberError({ reset }: { reset: () => void }) {
  return (
    <div className={s.workspace}>
      <main className={s.login}>
        <div className={s.wordmark}>HOUZS VENTURE</div>
        <h1>Unable to load your workspace</h1>
        <p className={s.sub} style={{ margin: "16px 0 24px" }}>
          Please try again. Reloading will not submit an existing request again.
        </p>
        <button className={`${s.button} ${s.primary}`} onClick={reset}>
          Reload
        </button>
      </main>
    </div>
  );
}
