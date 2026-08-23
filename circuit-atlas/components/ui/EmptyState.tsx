import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "./styles";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <section
      aria-label={typeof title === "string" ? title : "Empty state"}
      className={cx(
        "grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm"
      >
        {icon ?? <Inbox className="size-5" />}
      </span>
      <div className="max-w-md">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </section>
  );
}
