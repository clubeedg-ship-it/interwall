/*
  Readiness derivation for Build cards. The label set lives here so no page
  or component inlines a copy; if we rename a state, the card and the
  filter both see the change.
*/

import type { BuildListItem } from "../lib/types";

export type BuildReadiness =
  | "ready"
  | "needs_components"
  | "needs_xref"
  | "inactive"
  | "auto";

export interface ReadinessToken {
  label: string;
  led: "led-ok" | "led-miss" | "led-auto";
}

export const READINESS: Record<BuildReadiness, ReadinessToken> = {
  ready: { label: "Ready", led: "led-ok" },
  needs_components: { label: "Setup", led: "led-miss" },
  needs_xref: { label: "No SKU", led: "led-miss" },
  inactive: { label: "Inactive", led: "led-miss" },
  auto: { label: "Auto", led: "led-auto" },
};

export function readinessFor(
  b: BuildListItem,
  mappedMarketplaces: Set<string>,
  knownMarketplaces: string[]
): BuildReadiness {
  if (!b.is_active) return "inactive";
  if (b.is_auto_generated) return "auto";
  if (b.component_count === 0) return "needs_components";
  if (
    knownMarketplaces.length > 0 &&
    knownMarketplaces.some((m) => !mappedMarketplaces.has(m))
  ) {
    return "needs_xref";
  }
  return "ready";
}

export function compositionSummary(b: BuildListItem): string {
  if (b.component_count === 0) return "No lines yet";
  const parts: string[] = [];
  if (b.item_group_component_count > 0) {
    parts.push(
      `${b.item_group_component_count} Model${b.item_group_component_count === 1 ? "" : "s"}`
    );
  }
  if (b.product_component_count > 0) {
    parts.push(
      `${b.product_component_count} Part${b.product_component_count === 1 ? "" : "s"}`
    );
  }
  return parts.join(" · ");
}
