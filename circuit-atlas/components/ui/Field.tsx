"use client";

import { useId, type ReactNode } from "react";

import { cx } from "./styles";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
}

export interface FieldProps {
  label: ReactNode;
  children: ReactNode | ((controlProps: FieldControlProps) => ReactNode);
  className?: string;
  controlId?: string;
  description?: ReactNode;
  error?: ReactNode;
  isRequired?: boolean;
  labelHidden?: boolean;
}

/**
 * Associates a label, help text, and validation message with any form control.
 * Prefer the render-prop form so every accessible relationship is applied.
 */
export function Field({
  label,
  children,
  className,
  controlId,
  description,
  error,
  isRequired = false,
  labelHidden = false,
}: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? `field-${generatedId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const controlProps: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": isRequired ? true : undefined,
  };

  return (
    <div className={cx("grid gap-1.5", className)} data-invalid={error ? "true" : undefined}>
      <label
        className={cx(
          "text-sm font-semibold text-slate-800",
          labelHidden && "sr-only",
        )}
        htmlFor={id}
      >
        {label}
        {isRequired ? (
          <span aria-hidden="true" className="ml-1 text-rose-700">
            *
          </span>
        ) : null}
      </label>
      {typeof children === "function" ? children(controlProps) : children}
      {description ? (
        <p className="text-xs leading-5 text-slate-600" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium leading-5 text-rose-700" id={errorId} role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
