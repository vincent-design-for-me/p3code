import {
  ProviderDriverKind,
  type ServerProviderUsageLimits,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  modelQuotaWindows,
  pickerQuota,
  quotaWindowLabel,
  quotaWindowPeriod,
} from "./modelQuotaWindows";

const CLAUDEAGENT = ProviderDriverKind.make("claudeAgent");
const OPENCODE = ProviderDriverKind.make("opencode");
const CURSOR = ProviderDriverKind.make("cursor");
const CODEX = ProviderDriverKind.make("codex");
const ANTIGRAVITY = ProviderDriverKind.make("antigravity");

function window(
  id: string,
  kind: ServerProviderUsageWindow["kind"],
  extra: Partial<ServerProviderUsageWindow> = {},
): ServerProviderUsageWindow {
  return { id, kind, label: id, usedPercent: 0, ...extra };
}

function ids(windows: readonly ServerProviderUsageWindow[]) {
  return windows.map((entry) => entry.id);
}

function limits(windows: ServerProviderUsageWindow[]): ServerProviderUsageLimits {
  return { checkedAt: "2026-11-26T00:00:00.000Z", windows };
}

describe("modelQuotaWindows", () => {
  it("orders windows session, weekly, monthly, other", () => {
    const split = modelQuotaWindows(
      CLAUDEAGENT,
      [
        window("extra", "other"),
        window("monthly", "monthly"),
        window("seven_day", "weekly"),
        window("five_hour", "session"),
      ],
      "claude-opus-4-5",
    );
    expect(ids(split.current)).toEqual(["five_hour", "seven_day", "monthly", "extra"]);
    expect(split.other).toEqual([]);
  });

  it("honors modelIds and providerIds", () => {
    const windows = [
      window("listed", "weekly", { modelIds: ["anthropic/claude-sonnet"] }),
      window("other-provider", "weekly", { providerIds: ["openai"] }),
      window("plain", "session"),
    ];
    const split = modelQuotaWindows(OPENCODE, windows, "anthropic/claude-sonnet");
    expect(ids(split.current)).toEqual(["plain", "listed"]);
    expect(ids(split.other)).toEqual(["other-provider"]);
  });

  it("scopes Claude's model weekly windows by name", () => {
    const windows = [
      window("five_hour", "session"),
      window("seven_day", "weekly"),
      window("seven_day_opus", "weekly"),
      window("seven_day_sonnet", "weekly"),
      window("seven_day_fable", "weekly"),
    ];
    const opus = modelQuotaWindows(CLAUDEAGENT, windows, "claude-opus-4-5");
    expect(ids(opus.current)).toEqual(["five_hour", "seven_day", "seven_day_opus"]);
    expect(ids(opus.other)).toEqual(["seven_day_sonnet", "seven_day_fable"]);
    const fable = modelQuotaWindows(CLAUDEAGENT, windows, "claude-fable-1");
    expect(ids(fable.current)).toEqual(["five_hour", "seven_day", "seven_day_fable"]);
  });

  it("splits Cursor's own models from third-party ones", () => {
    const windows = [
      window("totalPercentUsed", "monthly"),
      window("autoPercentUsed", "monthly"),
      window("apiPercentUsed", "monthly"),
    ];
    expect(ids(modelQuotaWindows(CURSOR, windows, "composer-1").current)).toEqual([
      "totalPercentUsed",
      "autoPercentUsed",
    ]);
    expect(ids(modelQuotaWindows(CURSOR, windows, "claude-4-sonnet").current)).toEqual([
      "totalPercentUsed",
      "apiPercentUsed",
    ]);
  });

  it("hides Codex's credit cap behind plan windows", () => {
    const plan = [
      window("primary", "session"),
      window("secondary", "weekly"),
      window("individual", "monthly"),
    ];
    const split = modelQuotaWindows(CODEX, plan, "gpt-5.5");
    expect(ids(split.current)).toEqual(["primary", "secondary"]);
    expect(split.other).toEqual([]);
    expect(
      ids(modelQuotaWindows(CODEX, [window("individual", "monthly")], "gpt-5.5").current),
    ).toEqual(["individual"]);
  });

  it("meters OpenCode Go windows only for Go models", () => {
    const windows = [window("go_weekly", "weekly"), window("zen", "monthly")];
    expect(ids(modelQuotaWindows(OPENCODE, windows, "opencode-go/kimi").current)).toEqual([
      "go_weekly",
      "zen",
    ]);
    const zen = modelQuotaWindows(OPENCODE, windows, "opencode/kimi");
    expect(ids(zen.current)).toEqual(["zen"]);
    expect(ids(zen.other)).toEqual(["go_weekly"]);
  });

  describe(ANTIGRAVITY, () => {
    const summary = [
      window("gemini-5h", "session"),
      window("gemini-weekly", "weekly"),
      window("gemini-argon-5h", "session"),
      window("3p-5h", "session"),
    ];

    it("meters Gemini, Argon, and shared Claude/GPT buckets apart", () => {
      const gemini = modelQuotaWindows(ANTIGRAVITY, summary, "gemini-3.1-pro");
      expect(ids(gemini.current)).toEqual(["gemini-5h", "gemini-weekly"]);
      expect(ids(gemini.other)).toEqual(["gemini-argon-5h", "3p-5h"]);
      expect(ids(modelQuotaWindows(ANTIGRAVITY, summary, "gemini-argon-pro").current)).toEqual([
        "gemini-argon-5h",
      ]);
      expect(ids(modelQuotaWindows(ANTIGRAVITY, summary, "claude-sonnet-4-6").current)).toEqual([
        "3p-5h",
      ]);
    });

    it("falls back to Gemini quotas when no Argon or Carbon bucket is reported", () => {
      const older = [window("gemini-quota", "other"), window("claude-quota", "other")];
      expect(ids(modelQuotaWindows(ANTIGRAVITY, older, "gemini-carbon-pro").current)).toEqual([
        "gemini-quota",
      ]);
    });

    it("keeps per-model Claude and GPT quotas apart and reads hub-prefixed ids", () => {
      const older = [window("claude-quota", "other"), window("gpt-quota", "other")];
      expect(ids(modelQuotaWindows(ANTIGRAVITY, older, "ag/gpt-oss-120b").current)).toEqual([
        "gpt-quota",
      ]);
    });

    it("lets an alias spend every bucket", () => {
      expect(modelQuotaWindows(ANTIGRAVITY, summary, "fast").current).toHaveLength(4);
    });
  });

  it("keeps only unscoped windows current without a model", () => {
    const split = modelQuotaWindows(
      CLAUDEAGENT,
      [
        window("five_hour", "session"),
        window("seven_day_opus", "weekly"),
        window("listed", "weekly", { modelIds: ["x"] }),
      ],
      null,
    );
    expect(ids(split.current)).toEqual(["five_hour"]);
    expect(ids(split.other)).toEqual(["seven_day_opus", "listed"]);
  });
});

describe("pickerQuota", () => {
  it("picks the scarcest session window", () => {
    const quota = pickerQuota(
      CLAUDEAGENT,
      limits([
        window("five_hour", "session", { usedPercent: 40 }),
        window("other_session", "other", { usedPercent: 70, windowDurationMins: 300 }),
        window("seven_day", "weekly", { usedPercent: 95 }),
      ]),
      "claude-opus-4-5",
    );
    expect(quota).toMatchObject({ remaining: 30, weekly: false });
    expect(quota?.window.id).toBe("other_session");
  });

  it("falls back to the scarcest weekly window", () => {
    const quota = pickerQuota(
      CLAUDEAGENT,
      limits([
        window("seven_day", "weekly", { usedPercent: 20 }),
        window("seven_day_opus", "weekly", { usedPercent: 60 }),
      ]),
      "claude-opus-4-5",
    );
    expect(quota).toMatchObject({ remaining: 40, weekly: true });
  });

  it("is null for unavailable limits or no matching window", () => {
    expect(pickerQuota(CODEX, undefined, "gpt-5.5")).toBeNull();
    expect(
      pickerQuota(
        CODEX,
        { ...limits([window("primary", "session")]), unavailable: { reason: "probeFailed" } },
        "gpt-5.5",
      ),
    ).toBeNull();
    expect(pickerQuota(CURSOR, limits([window("total", "monthly")]), "auto")).toBeNull();
  });
});

describe("window labels", () => {
  it("localizes provider label parts and five-hour windows", () => {
    expect(
      quotaWindowLabel({ label: "Claude & GPT (shared) · 5-hour", windowDurationMins: 300 }, "en"),
    ).toBe("Claude & GPT (shared) · 5 hr");
    expect(quotaWindowLabel({ label: "Session", windowDurationMins: 300 }, "en")).toBe("5 hr");
    expect(quotaWindowLabel({ label: "Gemini · Weekly", windowDurationMins: 10_080 }, "en")).toBe(
      "Gemini · Weekly",
    );
    expect(
      quotaWindowLabel({ label: "Gemini · Reported quota", windowDurationMins: undefined }, "en"),
    ).toBe("Gemini · Reported quota");
  });

  it("names a period by its length when it has one", () => {
    const base = { label: "Weekly", windowDurationMins: undefined } as const;
    expect(quotaWindowPeriod({ ...base, kind: "session", windowDurationMins: 300 }, "en")).toBe(
      "5h",
    );
    expect(quotaWindowPeriod({ ...base, kind: "weekly" }, "en")).toBe("1w");
    expect(quotaWindowPeriod({ ...base, kind: "other", windowDurationMins: 1_440 }, "en")).toBe(
      "1d",
    );
    expect(quotaWindowPeriod({ ...base, kind: "monthly", label: "Monthly" }, "en")).toBe("Monthly");
  });
});
