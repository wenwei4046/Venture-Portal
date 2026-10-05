"use client";

import { Suspense } from "react";
import AppError from "@/components/member/app/shell/AppError";

// When /member cannot load (2026-10-06): the app's own frame, what went wrong and
// Try again — a fresh load rather than `reset`, which would re-render the same
// failed server answer. The Suspense is for AppFrame's read of the URL.
export default function MemberError({ error }: { error: Error & { digest?: string } }) {
  return (
    <Suspense>
      <AppError digest={error.digest} />
    </Suspense>
  );
}
