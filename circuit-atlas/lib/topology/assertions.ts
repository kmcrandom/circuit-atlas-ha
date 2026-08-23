import type {
  AssertionTarget,
  AssetCircuitAssertion,
  Certainty,
  ElectricalTopology,
  TraceRoot,
} from "../domain/electrical";
import { combineCertainty } from "./certainty";
import {
  explainTracePath,
  traceTopology,
  type TracePath,
  type TraceResult,
} from "./trace";

export interface DerivedCircuitMembership {
  sourceId: string;
  circuitId: string;
  breakerPoleId: string;
  certainty: Certainty;
  path?: TracePath;
}

export interface CircuitMembershipEntry {
  circuitId: string;
  breakerPoleId?: string;
  provenance: "graph" | "assertion" | "both";
  status: "graph-only" | "asserted-only" | "confirmed" | "conflicting";
  certainty: Certainty;
  derived: readonly DerivedCircuitMembership[];
  assertions: readonly AssetCircuitAssertion[];
}

export interface AssertionConflict {
  id: string;
  code: "ASSERTED_SOURCE_NOT_REACHABLE" | "REACHABLE_SOURCE_NOT_ASSERTED";
  message: string;
  circuitId: string;
  breakerPoleId?: string;
  assertionIds: readonly string[];
  sourceIds: readonly string[];
}

export interface CircuitMembershipResolution {
  target?: AssertionTarget;
  trace?: TraceResult;
  derived: readonly DerivedCircuitMembership[];
  assertions: readonly AssetCircuitAssertion[];
  memberships: readonly CircuitMembershipEntry[];
  conflicts: readonly AssertionConflict[];
}

function targetToTraceRoot(target: AssertionTarget): TraceRoot {
  return target;
}

export function deriveCircuitMembership(
  topology: ElectricalTopology,
  target: AssertionTarget,
): Pick<CircuitMembershipResolution, "target" | "trace" | "derived"> {
  const trace = traceTopology(topology, [targetToTraceRoot(target)]);
  const derived = trace.sources.map((source) => ({
    sourceId: source.sourceId,
    circuitId: source.circuitId,
    breakerPoleId: source.breakerPoleId,
    certainty: source.certainty,
    path: explainTracePath(trace, source.nodeId),
  }));
  return { target, trace, derived };
}

function sameTarget(
  left: AssertionTarget,
  right: AssertionTarget | undefined,
): boolean {
  return !right || (left.kind === right.kind && left.id === right.id);
}

function assertionMatchesDerived(
  assertion: AssetCircuitAssertion,
  derived: DerivedCircuitMembership,
): boolean {
  return (
    assertion.circuitId === derived.circuitId &&
    (!assertion.breakerPoleId ||
      assertion.breakerPoleId === derived.breakerPoleId)
  );
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/**
 * Merges evidence without allowing either source to overwrite the other.
 * Additive assertions state a fact but need not list every reachable source;
 * an exclusive assertion additionally says the asserted set is exhaustive.
 */
export function mergeCircuitAssertions(
  derivedInput: readonly DerivedCircuitMembership[],
  assertionInput: readonly AssetCircuitAssertion[],
  target?: AssertionTarget,
): Omit<CircuitMembershipResolution, "trace"> {
  const derived = [...derivedInput];
  const assertions = uniqueById(
    assertionInput.filter(
      (assertion) =>
        assertion.status !== "retracted" && sameTarget(assertion.target, target),
    ),
  );
  const conflicts: AssertionConflict[] = [];

  const unmatchedAssertions = assertions.filter(
    (assertion) =>
      derived.length > 0 &&
      !derived.some((membership) =>
        assertionMatchesDerived(assertion, membership),
      ),
  );
  for (const assertion of unmatchedAssertions) {
    conflicts.push({
      id: `assertion-conflict:${assertion.id}:not-reachable`,
      code: "ASSERTED_SOURCE_NOT_REACHABLE",
      message: `Asserted circuit ${assertion.circuitId} is not graph-reachable from the target.`,
      circuitId: assertion.circuitId,
      breakerPoleId: assertion.breakerPoleId,
      assertionIds: [assertion.id],
      sourceIds: [],
    });
  }

  const exclusiveAssertions = assertions.filter(
    (assertion) => assertion.scope === "exclusive",
  );
  if (exclusiveAssertions.length > 0) {
    for (const membership of derived) {
      if (
        exclusiveAssertions.some((assertion) =>
          assertionMatchesDerived(assertion, membership),
        )
      ) {
        continue;
      }
      conflicts.push({
        id: `assertion-conflict:${membership.sourceId}:not-asserted`,
        code: "REACHABLE_SOURCE_NOT_ASSERTED",
        message: `Graph-reachable circuit ${membership.circuitId} is absent from the exclusive assertion set.`,
        circuitId: membership.circuitId,
        breakerPoleId: membership.breakerPoleId,
        assertionIds: exclusiveAssertions.map((assertion) => assertion.id),
        sourceIds: [membership.sourceId],
      });
    }
  }

  const memberships: CircuitMembershipEntry[] = [];
  const consumedAssertions = new Set<string>();
  const derivedGroups = new Map<string, DerivedCircuitMembership[]>();
  for (const membership of derived) {
    const key = `${membership.circuitId}\u0000${membership.breakerPoleId}`;
    const group = derivedGroups.get(key) ?? [];
    group.push(membership);
    derivedGroups.set(key, group);
  }

  for (const group of derivedGroups.values()) {
    const first = group[0];
    const matchingAssertions = assertions.filter((assertion) =>
      assertionMatchesDerived(assertion, first),
    );
    matchingAssertions.forEach((assertion) => consumedAssertions.add(assertion.id));
    const groupConflicts = conflicts.some(
      (conflict) =>
        conflict.circuitId === first.circuitId &&
        (!conflict.breakerPoleId ||
          conflict.breakerPoleId === first.breakerPoleId),
    );
    memberships.push({
      circuitId: first.circuitId,
      breakerPoleId: first.breakerPoleId,
      provenance: matchingAssertions.length > 0 ? "both" : "graph",
      status: groupConflicts
        ? "conflicting"
        : matchingAssertions.length > 0
          ? "confirmed"
          : "graph-only",
      certainty: combineCertainty(
        ...group.map((membership) => membership.certainty),
        ...matchingAssertions.map((assertion) => assertion.certainty),
      ),
      derived: group,
      assertions: matchingAssertions,
    });
  }

  for (const assertion of assertions) {
    if (consumedAssertions.has(assertion.id)) continue;
    const hasConflict = conflicts.some((conflict) =>
      conflict.assertionIds.includes(assertion.id),
    );
    memberships.push({
      circuitId: assertion.circuitId,
      breakerPoleId: assertion.breakerPoleId,
      provenance: "assertion",
      status: hasConflict ? "conflicting" : "asserted-only",
      certainty: assertion.certainty ?? "unknown",
      derived: [],
      assertions: [assertion],
    });
  }

  memberships.sort(
    (left, right) =>
      left.circuitId.localeCompare(right.circuitId) ||
      (left.breakerPoleId ?? "").localeCompare(right.breakerPoleId ?? ""),
  );

  return { target, derived, assertions, memberships, conflicts };
}

export function resolveCircuitMembership(
  topology: ElectricalTopology,
  target: AssertionTarget,
  assertions: readonly AssetCircuitAssertion[] = topology.assertions ?? [],
): CircuitMembershipResolution {
  const derivation = deriveCircuitMembership(topology, target);
  return {
    ...mergeCircuitAssertions(derivation.derived, assertions, target),
    target,
    trace: derivation.trace,
  };
}
