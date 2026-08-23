"use client";

import { CircuitBoard } from "lucide-react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Sheet } from "../ui/Sheet";
import { cx, focusRing } from "../ui/styles";
import { PropertySelector, type PropertySelectorItem } from "./PropertySelector";
import {
  DesktopPrimaryNavigation,
  MobilePrimaryNavigation,
  type NavigationItem,
} from "./navigation";

export interface AppShellProps {
  children: ReactNode;
  properties: readonly PropertySelectorItem[];
  activePropertyId?: string | null;
  onPropertyChange: (propertyId: string) => void;
  onCreateProperty?: () => void;
  navigationItems: readonly NavigationItem[];
  activeNavigationItemId?: string;
  search?: ReactNode;
  inspector?: ReactNode;
  isInspectorOpen?: boolean;
  onInspectorOpenChange?: (isOpen: boolean) => void;
  inspectorSheetTitle?: string;
  utilityActions?: ReactNode;
  sidebarFooter?: ReactNode;
  pageHeader?: ReactNode;
  productName?: string;
  productMark?: ReactNode;
  className?: string;
  contentClassName?: string;
  isBusy?: boolean;
  announcement?: string;
}

function useLargeViewport(): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return matches;
}

export function AppShell({
  children,
  properties,
  activePropertyId,
  onPropertyChange,
  onCreateProperty,
  navigationItems,
  activeNavigationItemId,
  search,
  inspector,
  isInspectorOpen = false,
  onInspectorOpenChange,
  inspectorSheetTitle = "Record details",
  utilityActions,
  sidebarFooter,
  pageHeader,
  productName = "Circuit Atlas",
  productMark,
  className,
  contentClassName,
  isBusy = false,
  announcement,
}: AppShellProps) {
  const isLargeViewport = useLargeViewport();
  const propertySelectorProps = {
    activePropertyId,
    onCreateProperty,
    onPropertyChange,
    properties,
  };

  return (
    <div
      aria-busy={isBusy || undefined}
      className={cx(
        "min-h-dvh bg-slate-100 text-slate-950 md:h-dvh md:overflow-hidden",
        className,
      )}
    >
      <a
        className={cx(
          "fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0",
          focusRing,
        )}
        href="#main-content"
      >
        Skip to main content
      </a>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="md:grid md:h-full md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-slate-200 bg-white md:flex md:flex-col">
          <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-xl bg-slate-950 text-orange-400 shadow-sm"
            >
              {productMark ?? <CircuitBoard className="size-5" />}
            </span>
            <span className="truncate text-sm font-bold tracking-tight">{productName}</span>
          </div>
          <div className="shrink-0 border-b border-slate-200 p-4">
            <PropertySelector {...propertySelectorProps} />
          </div>
          <DesktopPrimaryNavigation
            activeItemId={activeNavigationItemId}
            className="min-h-0 flex-1 overflow-y-auto p-3"
            items={navigationItems}
          />
          {sidebarFooter ? (
            <div className="shrink-0 border-t border-slate-200 p-4">{sidebarFooter}</div>
          ) : null}
        </aside>

        <div className="min-w-0 md:grid md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)]">
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur md:static">
            <div className="flex min-h-14 items-center gap-3 px-3 md:hidden">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-orange-400"
              >
                {productMark ?? <CircuitBoard className="size-5" />}
              </span>
              <PropertySelector
                {...propertySelectorProps}
                className="min-w-0 flex-1"
                hideLabel
              />
              {utilityActions ? <div className="shrink-0">{utilityActions}</div> : null}
            </div>
            <div className="flex min-h-16 items-center gap-4 px-3 pb-3 md:px-5 md:pb-0">
              {pageHeader ? <div className="hidden min-w-0 shrink-0 md:block">{pageHeader}</div> : null}
              {search ? <div className="mx-auto min-w-0 flex-1 md:max-w-2xl">{search}</div> : null}
              {utilityActions ? <div className="hidden shrink-0 md:block">{utilityActions}</div> : null}
            </div>
          </header>

          <div
            className={cx(
              "min-w-0 md:min-h-0",
              Boolean(inspector) && "lg:grid lg:grid-cols-[minmax(0,1fr)_23rem]",
            )}
          >
            <main
              className={cx(
                "min-w-0 scroll-mt-32 pb-24 md:min-h-0 md:overflow-y-auto md:pb-0",
                contentClassName,
              )}
              id="main-content"
            >
              {children}
            </main>
            {inspector ? (
              <aside
                aria-label="Selected record inspector"
                className="hidden min-h-0 border-l border-slate-200 bg-white lg:flex lg:overflow-hidden"
              >
                {isLargeViewport !== false ? inspector : null}
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <MobilePrimaryNavigation
        activeItemId={activeNavigationItemId}
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        items={navigationItems}
      />

      {inspector && isLargeViewport === false ? (
        <Sheet
          isOpen={isInspectorOpen}
          onOpenChange={onInspectorOpenChange ?? (() => undefined)}
          placement="bottom"
          title={inspectorSheetTitle}
        >
          {inspector}
        </Sheet>
      ) : null}
    </div>
  );
}
