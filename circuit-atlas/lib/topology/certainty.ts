import type { Certainty } from "../domain/electrical";

const CERTAINTY_RANK: Readonly<Record<Exclude<Certainty, "conflicting">, number>> = {
  unknown: 0,
  assumed: 1,
  inferred: 2,
  "visually-observed": 3,
  "test-verified": 4,
  "documentation-verified": 5,
};

export function certaintyRank(certainty: Certainty | undefined): number {
  if (certainty === "conflicting") {
    return -1;
  }
  return CERTAINTY_RANK[certainty ?? "unknown"];
}

/** Returns the weakest evidence on a path; any explicit conflict is preserved. */
export function combineCertainty(
  ...values: readonly (Certainty | undefined)[]
): Certainty {
  if (values.some((value) => value === "conflicting")) {
    return "conflicting";
  }

  let weakest: Exclude<Certainty, "conflicting"> = "documentation-verified";
  for (const value of values) {
    const normalized = value ?? "unknown";
    if (normalized === "conflicting") {
      return normalized;
    }
    if (CERTAINTY_RANK[normalized] < CERTAINTY_RANK[weakest]) {
      weakest = normalized;
    }
  }
  return weakest;
}
