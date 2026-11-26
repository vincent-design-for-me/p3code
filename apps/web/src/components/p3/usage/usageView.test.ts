import { describe, expect, it } from "vite-plus/test";

import { initialUsagePagePreferences, usageSearchFromUrl } from "./usageView";

describe("usageSearchFromUrl", () => {
  it("accepts only the limits view and always sets the key", () => {
    expect(usageSearchFromUrl({ view: "limits" })).toEqual({ view: "limits" });
    const other = usageSearchFromUrl({ view: "cost" });
    expect(other).toEqual({ view: undefined });
    expect(Object.hasOwn(other, "view")).toBe(true);
  });
});

describe("initialUsagePagePreferences", () => {
  const stored = { metric: "cost", windowDays: 7 } as const;

  it("opens on Limits for the limits view and keeps the rest", () => {
    expect(initialUsagePagePreferences(stored, "limits")).toEqual({
      metric: "limits",
      windowDays: 7,
    });
    expect(initialUsagePagePreferences(stored, undefined)).toBe(stored);
  });
});
