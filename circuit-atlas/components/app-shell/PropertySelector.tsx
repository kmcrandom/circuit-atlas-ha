"use client";

import { Building2, Plus } from "lucide-react";

import { Combobox, type ComboboxOption } from "../ui/Combobox";
import { cx, focusRing } from "../ui/styles";

export interface PropertySelectorItem {
  id: string;
  name: string;
  description?: string;
  isArchived?: boolean;
}

export interface PropertySelectorProps {
  properties: readonly PropertySelectorItem[];
  activePropertyId?: string | null;
  onPropertyChange: (propertyId: string) => void;
  onCreateProperty?: () => void;
  label?: string;
  createLabel?: string;
  className?: string;
  hideLabel?: boolean;
  isDisabled?: boolean;
}

export function PropertySelector({
  properties,
  activePropertyId,
  onPropertyChange,
  onCreateProperty,
  label = "Property",
  createLabel = "Add property",
  className,
  hideLabel = false,
  isDisabled = false,
}: PropertySelectorProps) {
  const options: ComboboxOption[] = properties.map((property) => ({
    id: property.id,
    label: property.name,
    description: property.description,
    icon: <Building2 aria-hidden="true" className="size-4" />,
    isDisabled: property.isArchived,
  }));

  return (
    <div className={cx("flex min-w-0 items-end gap-2", className)}>
      <Combobox
        className="min-w-0 flex-1"
        emptyLabel="No active properties"
        hideLabel={hideLabel}
        isDisabled={isDisabled || options.length === 0}
        label={label}
        onSelectionChange={(key) => {
          if (key && key !== activePropertyId) onPropertyChange(key);
        }}
        options={options}
        placeholder={options.length ? "Choose a property" : "No properties yet"}
        selectedKey={activePropertyId}
      />
      {onCreateProperty ? (
        <button
          aria-label={createLabel}
          className={cx(
            "grid size-[2.875rem] shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950",
            focusRing,
          )}
          onClick={onCreateProperty}
          title={createLabel}
          type="button"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      ) : null}
    </div>
  );
}
