import type { ReactNode } from "react";
import styles from "./feature-ui.module.css";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div>
        {icon ? <div className={styles.emptyStateIcon}>{icon}</div> : null}
        <h3 className={styles.emptyStateTitle}>{title}</h3>
        <p className={styles.emptyStateCopy}>{description}</p>
        {action ? <div className={`${styles.buttonRow} ${styles.buttonRowEnd}`}>{action}</div> : null}
      </div>
    </div>
  );
}
