export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

export const controlSurface =
  "rounded-xl border border-slate-300 bg-white text-slate-950 shadow-sm transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-55";
