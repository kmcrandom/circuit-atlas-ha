const TRACE_ROOT_KINDS: Record<string, string> = {
  breaker: "breaker",
  "breaker-pole": "breaker-pole",
  circuit: "circuit",
  asset: "asset",
  "asset-function": "asset-function",
  device: "asset",
  switch: "asset",
  receptacle: "asset",
  fixture: "asset",
  "light-source": "asset",
  appliance: "asset",
  panel: "asset",
  junction: "asset",
  other: "asset",
  custom: "asset",
  box: "box",
  cable: "cable",
  conductor: "conductor",
  "electrical-node": "node",
  node: "node",
  terminal: "node",
  splice: "node",
  bond: "node",
  "open-end": "node",
};

/** Maps presentation selection names to the finite trace-root API contract. */
export function toTraceRootKind(value: string | null): string | null {
  if (!value) return null;
  return TRACE_ROOT_KINDS[value.replaceAll("_", "-")] ?? null;
}
