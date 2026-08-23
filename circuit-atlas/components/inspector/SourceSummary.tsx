import { CircuitBoard, GitCompareArrows, Route, UserRoundPen } from "lucide-react";
import type { ReactNode } from "react";
import { AppLink } from "@/lib/client/runtime-path";

import { EmptyState } from "../ui/EmptyState";
import { StatusBadge, type StatusTone } from "../ui/StatusBadge";
import { cx, focusRing } from "../ui/styles";

export type SourceProvenance =
  | "asserted"
  | "derived"
  | "asserted_and_derived"
  | "conflict"
  | "unknown";

export interface SourceSummaryItem {
  id: string;
  label: string;
  code?: string;
  details?: ReactNode;
  href?: string;
  provenance?: SourceProvenance;
}

export interface SourceSummaryProps {
  sources: readonly SourceSummaryItem[];
  title?: ReactNode;
  description?: ReactNode;
  emptyLabel?: ReactNode;
  className?: string;
  onSelect?: (source: SourceSummaryItem) => void;
}

const provenancePresentation: Record<
  SourceProvenance,
  { label: string; tone: StatusTone; icon: ReactNode }
> = {
  asserted: {
    label: "Manually asserted",
    tone: "info",
    icon: <UserRoundPen aria-hidden="true" className="size-3.5" />,
  },
  derived: {
    label: "Traced from wiring",
    tone: "success",
    icon: <Route aria-hidden="true" className="size-3.5" />,
  },
  asserted_and_derived: {
    label: "Assertion and trace agree",
    tone: "success",
    icon: <Route aria-hidden="true" className="size-3.5" />,
  },
  conflict: {
    label: "Sources conflict",
    tone: "danger",
    icon: <GitCompareArrows aria-hidden="true" className="size-3.5" />,
  },
  unknown: {
    label: "Not verified",
    tone: "neutral",
    icon: <CircuitBoard aria-hidden="true" className="size-3.5" />,
  },
};

export function SourceSummary({
  sources,
  title = "Power source",
  description,
  emptyLabel = "No breaker source has been documented yet.",
  className,
  onSelect,
}: SourceSummaryProps) {
  return (
    <section
      aria-label={typeof title === "string" ? title : undefined}
      className={cx("grid gap-3", className)}
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p> : null}
      </div>
      {sources.length ? (
        <ul className="grid gap-2">
          {sources.map((source) => {
            const provenance = provenancePresentation[source.provenance ?? "unknown"];
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"
                >
                  <CircuitBoard className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-950">{source.label}</span>
                    {source.code ? (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-slate-600">
                        {source.code}
                      </span>
                    ) : null}
                  </span>
                  {source.details ? (
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{source.details}</span>
                  ) : null}
                  <StatusBadge
                    className="mt-2"
                    icon={provenance.icon}
                    label={provenance.label}
                    tone={provenance.tone}
                  />
                </span>
              </>
            );
            const itemClasses = cx(
              "flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left",
              (source.href || onSelect) && "transition hover:border-slate-300 hover:bg-slate-50",
              focusRing,
            );
            return (
              <li key={source.id}>
                {source.href ? (
                  <AppLink className={itemClasses} href={source.href} onClick={() => onSelect?.(source)}>
                    {content}
                  </AppLink>
                ) : onSelect ? (
                  <button className={itemClasses} onClick={() => onSelect(source)} type="button">
                    {content}
                  </button>
                ) : (
                  <div className={itemClasses}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          description={emptyLabel}
          icon={<CircuitBoard className="size-5" />}
          title="Source unknown"
        />
      )}
    </section>
  );
}
