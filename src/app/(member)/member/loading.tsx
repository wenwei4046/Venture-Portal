import { Suspense } from "react";
import AppLoading from "@/components/member/app/shell/AppLoading";

// The app's own frame while the server loads the member's data (2026-10-06):
// header, bottom bar on the URL's tab, one spinner. AppLoading reads the URL —
// the Suspense is for a static render, which has no search params to read.
export default function Loading() {
  return (
    <Suspense>
      <AppLoading />
    </Suspense>
  );
}
