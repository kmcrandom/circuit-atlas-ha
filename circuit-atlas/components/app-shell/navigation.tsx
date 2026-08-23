import {
  Boxes,
  CircuitBoard,
  Map,
  Network,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AppLink } from "@/lib/client/runtime-path";

import { cx, focusRing } from "../ui/styles";

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  badge?: string;
  isDisabled?: boolean;
}

export function createPrimaryNavigation(propertyId: string): NavigationItem[] {
  const propertyPath = `/p/${encodeURIComponent(propertyId)}`;
  return [
    { id: "map", label: "Map", href: `${propertyPath}/map`, icon: Map },
    {
      id: "circuits",
      label: "Circuits",
      href: `${propertyPath}/circuits`,
      icon: CircuitBoard,
    },
    {
      id: "inventory",
      label: "Inventory",
      href: `${propertyPath}/inventory`,
      icon: Boxes,
    },
    {
      id: "wiring",
      label: "Wiring",
      href: `${propertyPath}/wiring`,
      icon: Network,
    },
    {
      id: "upgrades",
      label: "Upgrade Plan",
      href: `${propertyPath}/upgrades`,
      icon: Sparkles,
    },
  ];
}

interface PrimaryNavigationProps {
  items: readonly NavigationItem[];
  activeItemId?: string;
  ariaLabel?: string;
  onNavigate?: (item: NavigationItem) => void;
  className?: string;
}

function NavigationLink({
  item,
  isActive,
  compact,
  onNavigate,
}: {
  item: NavigationItem;
  isActive: boolean;
  compact: boolean;
  onNavigate?: (item: NavigationItem) => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={cx("shrink-0", compact ? "size-5" : "size-[1.125rem]")}
        />
      ) : null}
      <span className={cx(compact ? "max-w-[4.6rem] truncate text-[0.68rem]" : "truncate")}>
        {item.label}
      </span>
      {!compact && item.badge ? (
        <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[0.68rem] font-bold text-slate-700">
          {item.badge}
        </span>
      ) : null}
    </>
  );
  const classes = cx(
    "relative flex text-sm font-semibold transition-colors",
    compact
      ? "min-w-[4rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2"
      : "min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5",
    isActive
      ? compact
        ? "text-orange-700 before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-orange-600"
        : "bg-orange-50 text-orange-950 ring-1 ring-inset ring-orange-200"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    item.isDisabled && "cursor-not-allowed opacity-45",
    focusRing,
  );

  if (item.isDisabled) {
    return (
      <span aria-disabled="true" className={classes} title={`${item.label} is unavailable`}>
        {content}
      </span>
    );
  }

  return (
    <AppLink
      aria-current={isActive ? "page" : undefined}
      className={classes}
      href={item.href}
      onClick={() => onNavigate?.(item)}
    >
      {content}
    </AppLink>
  );
}

export function DesktopPrimaryNavigation({
  items,
  activeItemId,
  ariaLabel = "Primary navigation",
  onNavigate,
  className,
}: PrimaryNavigationProps) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className="grid gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <NavigationLink
              compact={false}
              isActive={item.id === activeItemId}
              item={item}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobilePrimaryNavigation({
  items,
  activeItemId,
  ariaLabel = "Primary navigation",
  onNavigate,
  className,
}: PrimaryNavigationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        "border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur",
        className,
      )}
    >
      <ul className="flex min-w-0 items-stretch justify-around overflow-x-auto">
        {items.map((item) => (
          <li className="contents" key={item.id}>
            <NavigationLink
              compact
              isActive={item.id === activeItemId}
              item={item}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
