import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  type QuotaRailAccount,
  type QuotaRailPresentations,
  collectQuotaRailGroups,
  estimateQuota,
  primaryQuota,
  quotaForecast,
  quotaNotchPath,
  quotaWindows,
} from "./quotaRailModel";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.parse("2026-11-26T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function makeWindow(overrides: Partial<ServerProviderUsageWindow> = {}): ServerProviderUsageWindow {
  return {
    id: "primary",
    kind: "session",
    label: "5h",
    usedPercent: 40,
    resetsAt: iso(NOW + 3 * HOUR),
    windowDurationMins: 300,
    ...overrides,
  };
}

function account(key: string, windows: ServerProviderUsageWindow[]): QuotaRailAccount {
  return { key, displayName: null, environment: null, plan: undefined, limits: undefined, windows };
}

describe("estimateQuota", () => {
  it("projects what is left at reset from the average burn so far", () => {
    // 2 of 5 hours elapsed with 20% used burns 50% by reset.
    const window = makeWindow({ usedPercent: 20 });
    expect(estimateQuota(window, iso(NOW), NOW)).toEqual({ remaining: 50, expiresAt: null });
  });

  it("projects when the quota runs out when the burn outpaces the window", () => {
    // 80% in 2 hours empties at 2.5 hours, half an hour from now.
    const window = makeWindow({ usedPercent: 80 });
    expect(estimateQuota(window, iso(NOW), NOW)).toEqual({
      remaining: null,
      expiresAt: NOW + 30 * MINUTE,
    });
  });

  it("measures elapsed time at the sample, not at render", () => {
    const window = makeWindow({ usedPercent: 20 });
    const estimate = estimateQuota(window, iso(NOW - HOUR), NOW);
    // 1 hour elapsed at the sample, so 20% per hour reaches 100% exactly at reset.
    expect(estimate).toEqual({ remaining: 0, expiresAt: null });
  });

  it("infers the length of five-hour and weekly windows without a duration", () => {
    const fiveHour = makeWindow({ usedPercent: 20, windowDurationMins: undefined, label: "5h" });
    expect(estimateQuota(fiveHour, iso(NOW), NOW)?.remaining).toBe(50);
    const weekly = makeWindow({
      kind: "weekly",
      label: "Weekly",
      usedPercent: 10,
      windowDurationMins: undefined,
      resetsAt: iso(NOW + 84 * HOUR),
    });
    expect(estimateQuota(weekly, iso(NOW), NOW)?.remaining).toBe(80);
  });

  it("refuses windows it cannot measure", () => {
    const sample = iso(NOW);
    expect(estimateQuota(makeWindow({ resetsAt: undefined }), sample, NOW)).toBeNull();
    expect(estimateQuota(makeWindow(), undefined, NOW)).toBeNull();
    expect(estimateQuota(makeWindow(), "not a date", NOW)).toBeNull();
    // No known length.
    expect(
      estimateQuota(
        makeWindow({ kind: "other", label: "Daily", windowDurationMins: undefined }),
        sample,
        NOW,
      ),
    ).toBeNull();
    expect(estimateQuota(makeWindow({ windowDurationMins: 0 }), sample, NOW)).toBeNull();
  });

  it("refuses resets that already passed or samples taken at or after the reset", () => {
    expect(estimateQuota(makeWindow({ resetsAt: iso(NOW) }), iso(NOW - HOUR), NOW)).toBeNull();
    const window = makeWindow({ resetsAt: iso(NOW + 30_000) });
    expect(estimateQuota(window, iso(NOW + 30_000), NOW)).toBeNull();
  });

  it("refuses samples from more than a minute in the future", () => {
    expect(estimateQuota(makeWindow(), iso(NOW + MINUTE), NOW)).not.toBeNull();
    expect(estimateQuota(makeWindow(), iso(NOW + MINUTE + 1), NOW)).toBeNull();
  });

  it("refuses samples taken too early in the window", () => {
    // Five-hour window: the bar is 10 minutes (shorter than 5% = 15 minutes).
    const window = makeWindow({ resetsAt: iso(NOW + 5 * HOUR - 9 * MINUTE) });
    expect(estimateQuota(window, iso(NOW), NOW)).toBeNull();
    const later = makeWindow({ resetsAt: iso(NOW + 5 * HOUR - 10 * MINUTE) });
    expect(estimateQuota(later, iso(NOW), NOW)).not.toBeNull();
    // A one-hour window: the bar is 5% = 3 minutes.
    const hourly = makeWindow({
      kind: "other",
      label: "Hourly",
      windowDurationMins: 60,
      resetsAt: iso(NOW + 58 * MINUTE),
    });
    expect(estimateQuota(hourly, iso(NOW), NOW)).toBeNull();
  });
});

describe("quotaForecast", () => {
  it("reports a reached limit before any estimate", () => {
    expect(quotaForecast(makeWindow({ usedPercent: 100 }), iso(NOW), NOW)).toEqual({
      kind: "limitReached",
    });
    expect(
      quotaForecast(makeWindow({ usedPercent: 100, resetsAt: undefined }), undefined, NOW),
    ).toEqual({ kind: "limitReached" });
  });

  it("does not report a limit whose reset already passed as reached", () => {
    const window = makeWindow({ usedPercent: 100, resetsAt: iso(NOW - MINUTE) });
    expect(quotaForecast(window, iso(NOW - HOUR), NOW)).toEqual({ kind: "unavailable" });
  });

  it("names the time left until empty, or warns once that moment passed", () => {
    expect(quotaForecast(makeWindow({ usedPercent: 80 }), iso(NOW), NOW)).toEqual({
      kind: "emptyIn",
      ms: 30 * MINUTE,
    });
    // 80% used 30 minutes into the window, sampled 30 minutes ago: it ran out 22.5 minutes ago.
    const window = makeWindow({ usedPercent: 80, resetsAt: iso(NOW + 4 * HOUR) });
    expect(quotaForecast(window, iso(NOW - 30 * MINUTE), NOW)).toEqual({ kind: "beforeReset" });
  });

  it("reports the share left at reset", () => {
    expect(quotaForecast(makeWindow({ usedPercent: 20 }), iso(NOW), NOW)).toEqual({
      kind: "atReset",
      remaining: 50,
    });
  });
});

describe("quotaWindows", () => {
  it("orders five-hour, then weekly, then other windows, the most used first", () => {
    const other = makeWindow({
      id: "o",
      kind: "monthly",
      label: "Monthly",
      windowDurationMins: 43_200,
    });
    const weekly = makeWindow({
      id: "w",
      kind: "weekly",
      label: "Weekly",
      windowDurationMins: 10_080,
    });
    const light = makeWindow({ id: "a", usedPercent: 10 });
    const heavy = makeWindow({ id: "b", usedPercent: 70 });
    const windows = quotaWindows({
      checkedAt: iso(NOW),
      windows: [other, weekly, light, heavy],
    });
    expect(windows.map((window) => window.id)).toEqual(["b", "a", "w", "o"]);
  });

  it("shows nothing for unavailable limits", () => {
    expect(
      quotaWindows({
        checkedAt: iso(NOW),
        windows: [makeWindow()],
        unavailable: { reason: "probeFailed" },
      }),
    ).toEqual([]);
    expect(quotaWindows(undefined)).toEqual([]);
  });
});

describe("primaryQuota", () => {
  it("prefers the lowest account among those with the best-ranked window", () => {
    const weeklyLow = account("weekly", [
      makeWindow({ kind: "weekly", label: "Weekly", windowDurationMins: 10_080, usedPercent: 95 }),
    ]);
    const fiveHourA = account("a", [makeWindow({ usedPercent: 30 })]);
    const fiveHourB = account("b", [makeWindow({ usedPercent: 60 })]);
    expect(primaryQuota([weeklyLow, fiveHourA, fiveHourB])).toEqual({
      account: fiveHourB,
      remaining: 40,
    });
    expect(primaryQuota([account("empty", [])])).toBeNull();
  });
});

describe("collectQuotaRailGroups", () => {
  const provider = (overrides: Record<string, unknown>) => ({
    instanceId: "codex",
    driver: "codex",
    displayName: undefined,
    enabled: true,
    installed: true,
    auth: { status: "authenticated", label: "Pro" },
    usageLimits: { checkedAt: iso(NOW), windows: [makeWindow()] },
    ...overrides,
  });
  const presentations = (
    entries: ReadonlyArray<{
      id: string;
      phase: string;
      providers: unknown[];
      sources?: unknown[];
    }>,
  ) =>
    new Map(
      entries.map(({ id, phase, providers, sources = [] }) => [
        id,
        {
          entry: { target: { label: id } },
          connection: { phase },
          serverConfig: { providers, usageLimitSources: sources },
        },
      ]),
    ) as unknown as QuotaRailPresentations;

  it("lists connected, signed-in accounts in the fixed provider order", () => {
    const groups = collectQuotaRailGroups(
      presentations([
        {
          id: "local",
          phase: "connected",
          providers: [
            provider({ instanceId: "kiro", driver: "kiro" }),
            provider({ instanceId: "claude", driver: "claudeAgent" }),
            provider({}),
            provider({ instanceId: "off", driver: "grok", enabled: false }),
            provider({ instanceId: "out", driver: "cursor", auth: { status: "unauthenticated" } }),
            provider({
              instanceId: "unknown-empty",
              driver: "antigravity",
              auth: { status: "unknown" },
              usageLimits: undefined,
            }),
          ],
        },
        { id: "remote", phase: "disconnected", providers: [provider({ instanceId: "codex-2" })] },
      ]),
    );
    expect(groups.map((group) => [group.driver, group.name, group.color])).toEqual([
      ["codex", "Codex", "#299a7d"],
      ["claudeAgent", "Claude", "#d67c57"],
      ["kiro", "Kiro", "var(--ring)"],
    ]);
    expect(groups[0]?.accounts.map((entry) => [entry.key, entry.plan, entry.environment])).toEqual([
      ["local:codex", "Pro", null],
    ]);
  });

  it("keeps an unknown auth state that still reports windows, and labels environments", () => {
    const groups = collectQuotaRailGroups(
      presentations([
        {
          id: "a",
          phase: "connected",
          providers: [provider({ auth: { status: "unknown" } })],
        },
        { id: "b", phase: "connected", providers: [provider({ displayName: " Work " })] },
      ]),
    );
    expect(
      groups[0]?.accounts.map((entry) => [entry.key, entry.displayName, entry.environment]),
    ).toEqual([
      ["a:codex", null, "a"],
      ["b:codex", "Work", "b"],
    ]);
  });
  it("adds accounts only an auxiliary usage source reports, labeled by the source", () => {
    const hubAccount = (id: string, driver: string, usedPercent: number) => ({
      id,
      driver,
      plan: "Plus",
      usageLimits: { checkedAt: iso(NOW), windows: [makeWindow({ usedPercent })] },
    });
    const groups = collectQuotaRailGroups(
      presentations([
        {
          id: "local",
          phase: "connected",
          providers: [],
          sources: [
            {
              id: "hub",
              kind: "cliproxy",
              label: "CLIProxy",
              checkedAt: iso(NOW),
              accounts: [hubAccount("one", "codex", 10), hubAccount("two", "codex", 70)],
            },
          ],
        },
      ]),
    );
    expect(groups.map((group) => group.driver)).toEqual(["codex"]);
    expect(
      groups[0]?.accounts.map((entry) => [entry.environment, entry.plan, entry.windows.length]),
    ).toEqual([
      ["CLIProxy", "Plus", 1],
      ["CLIProxy", "Plus", 1],
    ]);
    expect(primaryQuota(groups[0]?.accounts ?? [])?.remaining).toBe(30);
  });
});

describe("quotaNotchPath", () => {
  it("draws fillets into the window edge around rounded inner corners", () => {
    expect(quotaNotchPath({ width: 50, height: 100, curve: 20, radius: 10 })).toBe(
      "M 50 0 A 20 20 0 0 1 30 20 L 10 20 A 10 10 0 0 0 0 30 L 0 110 A 10 10 0 0 0 10 120 L 30 120 A 20 20 0 0 1 50 140",
    );
  });
});
