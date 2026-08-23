import type { ReactNode } from "react";
import styles from "./feature-ui.module.css";

export type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  neutral: styles.toneNeutral,
  positive: styles.tonePositive,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`${styles.badge} ${toneClasses[tone]}`}>{children}</span>
  );
}
