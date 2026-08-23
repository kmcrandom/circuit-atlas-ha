"use client";

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui";

export function RouteLoading({ label = "Loading property data…" }: { label?: string }) {
  return (
    <div
      className="grid min-h-[22rem] place-items-center rounded-2xl border border-slate-200 bg-white"
      role="status"
    >
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-orange-600" />
        {label}
      </div>
    </div>
  );
}

export function RouteError({
  error,
  onRetry,
  title = "This view could not be loaded",
}: {
  error: Error;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <EmptyState
      action={
        onRetry ? (
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={onRetry}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" /> Try again
          </button>
        ) : undefined
      }
      className="min-h-[22rem] border-rose-200 bg-rose-50/50"
      description={error.message}
      icon={<AlertTriangle className="size-5 text-rose-700" />}
      title={title}
    />
  );
}

export function RouteFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-[110rem] p-3 sm:p-5 ${className}`}>{children}</div>;
}

export function RouteHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-orange-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950";

export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800";
