import type { ReactNode } from "react";
import styles from "./feature-ui.module.css";

export type FormFieldProps = {
  label: string;
  children: ReactNode;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

export function FormField({
  label,
  children,
  description,
  error,
  required = false,
  className,
}: FormFieldProps) {
  return (
    <label className={[styles.field, className].filter(Boolean).join(" ")}>
      <span className={styles.fieldLabel}>
        {label}
        {required ? (
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      {children}
      {description ? <span className={styles.hint}>{description}</span> : null}
      {error ? <span className={styles.errorText}>{error}</span> : null}
    </label>
  );
}
