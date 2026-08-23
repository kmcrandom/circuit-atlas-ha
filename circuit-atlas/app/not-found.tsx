import { MapPinOff } from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-100 p-5">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <MapPinOff aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.15em] text-orange-700">Not found</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">That property record or view is unavailable</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          It may have been archived, renamed, or belong to another property. Property-scoped links never fall back to data from a different house.
        </p>
        <AppLink className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href="/properties">
          Choose a property
        </AppLink>
      </section>
    </main>
  );
}
