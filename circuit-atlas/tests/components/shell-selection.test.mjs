import assert from "node:assert/strict";
import test from "node:test";

import {
  createPropertyHref,
  createSelectionHref,
  parseUrlSelection,
  withInspectorTab,
  withUrlSelection,
  withoutUrlSelection,
} from "../../features/selection/url-selection.ts";

test("a complete URL selection round-trips without losing unrelated filters", () => {
  const original = new URLSearchParams("floor=level-a&assetType=switch");
  const next = withUrlSelection(original, {
    kind: "breaker",
    id: "breaker-17",
    tab: "connections",
  });

  assert.equal(next.get("floor"), "level-a");
  assert.deepEqual(parseUrlSelection(next), {
    kind: "breaker",
    id: "breaker-17",
    tab: "connections",
  });
});

test("partial and malformed selections are ignored", () => {
  assert.equal(parseUrlSelection(new URLSearchParams("selectedKind=breaker")), null);
  assert.equal(
    parseUrlSelection(new URLSearchParams("selectedKind=Breaker%20Panel&selectedId=1")),
    null,
  );
});

test("clearing selection preserves the page's other query state", () => {
  const original =
    "floor=level-a&selectedKind=fixture&selectedId=fixture-2&inspectorTab=overview";
  const next = withoutUrlSelection(original);

  assert.equal(next.toString(), "floor=level-a");
  assert.equal(createSelectionHref("/p/example/map", original, null), "/p/example/map?floor=level-a");
});

test("changing an inspector tab does not change the selected record", () => {
  const original = "selectedKind=conductor&selectedId=conductor-a";
  const next = withInspectorTab(original, "diagram");

  assert.equal(next.get("selectedId"), "conductor-a");
  assert.equal(next.get("inspectorTab"), "diagram");
});

test("property links drop property-scoped selection and filters", () => {
  const href = createPropertyHref(
    "property-b",
    "inventory",
    "selectedKind=breaker&selectedId=breaker-a&floor=level-a&view=compact",
    ["view", "floor"],
  );

  assert.equal(href, "/p/property-b/inventory?view=compact");
});
