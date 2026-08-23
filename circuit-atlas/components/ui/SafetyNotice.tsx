import { Info, ShieldAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./styles";

export interface SafetyNoticeProps {
  children: ReactNode;
  title?: ReactNode;
  severity?: "info" | "caution" | "critical";
  className?: string;
}

const severityClasses = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  caution: "border-amber-300 bg-amber-50 text-amber-950",
  critical: "border-rose-300 bg-rose-50 text-rose-950",
};

export function SafetyNotice({
  children,
  title = "Safety note",
  severity = "caution",
  className,
}: SafetyNoticeProps) {
  const Icon = severity === "info" ? Info : severity === "critical" ? TriangleAlert : ShieldAlert;
  return (
    <aside
      className={cx(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        severityClasses[severity],
        className,
      )}
      role={severity === "critical" ? "alert" : "note"}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-sm leading-6">
        <p className="font-semibold">{title}</p>
        <div className="opacity-90">{children}</div>
      </div>
    </aside>
  );
}
