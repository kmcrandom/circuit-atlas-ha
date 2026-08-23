"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  Button,
  ComboBox as AriaComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";

import { cx, focusRing } from "./styles";

export interface ComboboxOption {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: ReactNode;
  isDisabled?: boolean;
}

export interface ComboboxProps<T extends ComboboxOption = ComboboxOption> {
  label: string;
  options: readonly T[];
  selectedKey?: string | null;
  defaultSelectedKey?: string;
  onSelectionChange?: (key: string | null, option: T | undefined) => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  description?: string;
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  allowsCustomValue?: boolean;
  hideLabel?: boolean;
  emptyLabel?: string;
  className?: string;
  menuClassName?: string;
}

/** Accessible, filterable single-select input with keyboard and touch support. */
export function Combobox<T extends ComboboxOption>({
  label,
  options,
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  inputValue,
  onInputChange,
  placeholder = "Search options",
  description,
  errorMessage,
  isRequired = false,
  isDisabled = false,
  allowsCustomValue = false,
  hideLabel = false,
  emptyLabel = "No matching options",
  className,
  menuClassName,
}: ComboboxProps<T>) {
  const disabledKeys = new Set(options.filter((option) => option.isDisabled).map((option) => option.id));

  return (
    <AriaComboBox
      allowsCustomValue={allowsCustomValue}
      className={cx("grid min-w-0 gap-1.5", className)}
      defaultSelectedKey={defaultSelectedKey}
      disabledKeys={disabledKeys}
      inputValue={inputValue}
      isDisabled={isDisabled}
      isInvalid={Boolean(errorMessage)}
      isRequired={isRequired}
      onInputChange={onInputChange}
      onSelectionChange={(key) => {
        const normalizedKey = key === null ? null : String(key);
        onSelectionChange?.(
          normalizedKey,
          options.find((option) => option.id === normalizedKey),
        );
      }}
      selectedKey={selectedKey}
    >
      <Label className={cx("text-sm font-semibold text-slate-800", hideLabel && "sr-only")}>
        {label}
        {isRequired ? (
          <span aria-hidden="true" className="ml-1 text-rose-700">
            *
          </span>
        ) : null}
      </Label>
      <div className="flex min-w-0 rounded-xl border border-slate-300 bg-white shadow-sm transition-colors focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-200">
        <Input
          className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
          placeholder={placeholder}
        />
        <Button
          aria-label={`Show ${label.toLocaleLowerCase()} options`}
          className={cx(
            "grid w-11 shrink-0 place-items-center rounded-r-xl border-l border-slate-200 text-slate-600 hover:bg-slate-50",
            focusRing,
          )}
        >
          <ChevronsUpDown aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {description ? (
        <Text className="text-xs leading-5 text-slate-600" slot="description">
          {description}
        </Text>
      ) : null}
      {errorMessage ? (
        <Text className="text-xs font-medium leading-5 text-rose-700" slot="errorMessage">
          {errorMessage}
        </Text>
      ) : null}
      <Popover
        className={cx(
          "z-[70] w-[var(--trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-xl",
          menuClassName,
        )}
        offset={6}
      >
        <ListBox
          className="max-h-72 overflow-y-auto p-1 outline-none"
          items={[...options]}
          renderEmptyState={() => (
            <div className="px-3 py-6 text-center text-sm text-slate-600">{emptyLabel}</div>
          )}
        >
          {(option) => (
            <ListBoxItem
              className={({ isDisabled: itemDisabled, isFocused, isSelected }) =>
                cx(
                  "group flex min-h-11 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none",
                  isFocused && "bg-orange-50",
                  isSelected && "font-semibold text-orange-950",
                  itemDisabled && "opacity-45",
                )
              }
              id={option.id}
              textValue={[option.label, option.description, ...(option.keywords ?? [])]
                .filter(Boolean)
                .join(" ")}
            >
              {({ isSelected }) => (
                <>
                  {option.icon ? (
                    <span aria-hidden="true" className="shrink-0 text-slate-500">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block truncate text-xs font-normal text-slate-600">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

export { Combobox as ComboBox };
