"use client";

import type { CSSProperties } from "react";
import styles from "./feature-ui.module.css";

export type ProgressStep<T extends string> = {
  id: T;
  label: string;
};

export function ProgressSteps<T extends string>({
  steps,
  current,
  onSelect,
}: {
  steps: readonly ProgressStep<T>[];
  current: T;
  onSelect?: (step: T) => void;
}) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  );

  return (
    <ol
      className={styles.steps}
      aria-label="Progress"
      style={{ "--step-count": steps.length } as CSSProperties}
    >
      {steps.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        return (
          <li key={step.id}>
            <button
              className={styles.stepButton}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-label={`${step.label}${done ? ", completed" : active ? ", current step" : ""}`}
              onClick={() => onSelect?.(step.id)}
              disabled={!onSelect}
            >
              <span
                className={`${styles.stepTrack} ${done ? styles.stepTrackDone : ""} ${active ? styles.stepTrackActive : ""}`}
              />
              <span
                className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""}`}
              >
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
