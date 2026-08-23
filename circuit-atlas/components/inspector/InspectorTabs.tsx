"use client";

import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";

import { cx } from "../ui/styles";

export interface InspectorTab {
  id: string;
  label: ReactNode;
  content: ReactNode;
  isDisabled?: boolean;
}

export interface InspectorTabsProps {
  tabs: readonly InspectorTab[];
  selectedTabId?: string;
  defaultSelectedTabId?: string;
  onSelectedTabChange?: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function InspectorTabs({
  tabs,
  selectedTabId,
  defaultSelectedTabId,
  onSelectedTabChange,
  ariaLabel = "Record details",
  className,
}: InspectorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <Tabs
      className={cx("flex min-h-0 flex-1 flex-col", className)}
      defaultSelectedKey={defaultSelectedTabId ?? tabs[0]?.id}
      onSelectionChange={(key) => onSelectedTabChange?.(String(key))}
      selectedKey={selectedTabId}
    >
      <div className="shrink-0 border-b border-slate-200 px-4">
        <TabList aria-label={ariaLabel} className="flex gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => (
            <Tab
              className={({ isFocusVisible, isSelected }) =>
                cx(
                  "relative min-h-10 shrink-0 cursor-default rounded-lg px-3 py-2 text-sm font-semibold outline-none transition-colors",
                  isSelected ? "text-orange-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                  isSelected &&
                    "after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-orange-600",
                  isFocusVisible && "ring-2 ring-orange-500 ring-offset-1",
                  tab.isDisabled && "opacity-45",
                )
              }
              id={tab.id}
              isDisabled={tab.isDisabled}
              key={tab.id}
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
      </div>
      <TabPanels className="min-h-0 flex-1">
        {tabs.map((tab) => (
          <TabPanel
            className={({ isFocusVisible }) =>
              cx(
                "min-h-full px-5 py-5 outline-none",
                isFocusVisible && "ring-2 ring-inset ring-orange-500",
              )
            }
            id={tab.id}
            key={tab.id}
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
}
