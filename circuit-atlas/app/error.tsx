"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-100 p-5">
      <section className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl sm:p-8" role="alert">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-rose-50 text-rose-700">
          <AlertTriangle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Circuit Atlas hit an unexpected problem</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          Your stored property data was not removed. Try opening this view again; if the problem continues, return to the property list.
        </p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-slate-500">Reference {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={reset} type="button">
            <RotateCcw aria-hidden="true" className="size-4" /> Try again
          </button>
          <AppLink className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" href="/properties">
            Choose a property
          </AppLink>
        </div>
      </section>
    </main>
  );
}
