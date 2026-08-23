"use client";

import { MoreHorizontal, X } from "lucide-react";
import { useId, type ReactNode } from "react";

import { EmptyState } from "../ui/EmptyState";
import { cx, focusRing } from "../ui/styles";
import { InspectorTabs, type InspectorTab } from "./InspectorTabs";

export interface InspectorProps {
  title?: ReactNode;
  kind?: ReactNode;
  permanentCode?: ReactNode;
  badges?: ReactNode;
  tabs?: readonly InspectorTab[];
  selectedTabId?: string;
  defaultSelectedTabId?: string;
  onSelectedTabChange?: (tabId: string) => void;
  headerActions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  footer?: ReactNode;
  className?: string;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
}

export function Inspector({
  title,
  kind,
  permanentCode,
  badges,
  tabs = [],
  selectedTabId,
  defaultSelectedTabId,
  onSelectedTabChange,
  headerActions,
  onClose,
  closeLabel = "Close inspector",
  footer,
  className,
  emptyTitle = "Nothing selected",
  emptyDescription = "Choose a breaker, device, fixture, box, cable, or conductor to inspect it.",
}: InspectorProps) {
  const headingId = `inspector-title-${useId()}`;
  const hasSelection = Boolean(title);

  return (
    <section
      aria-labelledby={hasSelection ? headingId : undefined}
      aria-label={hasSelection ? undefined : "Inspector"}
      className={cx(
        "flex min-h-0 flex-1 flex-col bg-white text-slate-950",
        className,
      )}
    >
      {hasSelection ? (
        <>
          <header className="shrink-0 border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {kind ? (
                  <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-orange-700">
                    {kind}
                  </p>
                ) : null}
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight" id={headingId}>
                    {title}
                  </h2>
                  {permanentCode ? (
                    <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[0.68rem] font-semibold text-slate-600">
                      {permanentCode}
                    </span>
                  ) : null}
                </div>
                {badges ? <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerActions}
                {onClose ? (
                  <button
                    aria-label={closeLabel}
                    className={cx(
                      "grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                      focusRing,
                    )}
                    onClick={onClose}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <InspectorTabs
              defaultSelectedTabId={defaultSelectedTabId}
              onSelectedTabChange={onSelectedTabChange}
              selectedTabId={selectedTabId}
              tabs={tabs}
            />
          </div>
          {footer ? (
            <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4">{footer}</footer>
          ) : null}
        </>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-5">
          <EmptyState
            compact
            description={emptyDescription}
            icon={<MoreHorizontal className="size-5" />}
            title={emptyTitle}
          />
        </div>
      )}
    </section>
  );
}
