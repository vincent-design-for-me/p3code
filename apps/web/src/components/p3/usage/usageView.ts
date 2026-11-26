import { useSearch } from "@tanstack/react-router";
import { useState } from "react";

import type { UsagePagePreferences } from "../../usage/usagePagePreferences";

export interface UsageSearch {
  readonly view?: "limits" | undefined;
}

// `view` stays an own key even when undefined, so the parent route's raw search cannot leak in.
export function usageSearchFromUrl(raw: Record<string, unknown>): UsageSearch {
  return { view: raw.view === "limits" ? "limits" : undefined };
}

export function initialUsagePagePreferences(
  stored: UsagePagePreferences,
  view: UsageSearch["view"],
): UsagePagePreferences {
  return view === "limits" ? { ...stored, metric: "limits" } : stored;
}

/** `/usage?view=limits` opens on Limits; the saved metric is untouched until the user picks one. */
export function useUsagePagePreferencesState(read: () => UsagePagePreferences) {
  const view = useSearch({ strict: false, select: (search) => search.view });
  return useState(() => initialUsagePagePreferences(read(), view));
}
