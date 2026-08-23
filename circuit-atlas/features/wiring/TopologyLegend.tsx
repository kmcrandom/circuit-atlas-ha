import type { TopologyVisualModel } from "./model";
import { legendItemsForModel } from "./semantics";
import styles from "./wiring.module.css";

export interface TopologyLegendProps {
  model: TopologyVisualModel;
  className?: string;
}

export function TopologyLegend({ model, className }: TopologyLegendProps) {
  const items = legendItemsForModel(model);

  if (items.length === 0) return null;

  return (
    <aside
      className={`${styles.legend} ${className ?? ""}`}
      aria-label="Wiring diagram legend"
    >
      <h3>How to read this trace</h3>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span
              className={`${styles.legendSwatch} ${styles[`legendSwatch_${item.swatch}`]}`}
              aria-hidden="true"
            />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
