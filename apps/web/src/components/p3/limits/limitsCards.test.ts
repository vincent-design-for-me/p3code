import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { collectLimitAccounts, collectLimitPools } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import {
  type LimitCardEntry,
  limitCardSections,
  primaryEntry,
  splitCardEntries,
  windowlessLimitAccounts,
} from "./limitsCards";

const now = Date.parse("2026-09-03T12:00:00.000Z");
const checkedAt = "2026-09-03T11:00:00.000Z";

const session: ServerProviderUsageWindow = {
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent: 40,
  windowDurationMins: 300,
  resetsAt: "2026-09-03T14:00:00.000Z",
};
const weekly: ServerProviderUsageWindow = {
  id: "weekly",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 10,
  windowDurationMins: 10_080,
  resetsAt: "2026-09-08T12:00:00.000Z",
};
const monthly: ServerProviderUsageWindow = {
  id: "monthly",
  kind: "monthly",
  label: "Monthly",
  usedPercent: 5,
};

function provider(
  instanceId: string,
  overrides: Partial<ServerProvider> & { readonly windows?: ServerProviderUsageWindow[] } = {},
): ServerProvider {
  const { windows, ...rest } = overrides;
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    displayName: instanceId,
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    ...(windows ? { usageLimits: { checkedAt, windows } } : {}),
    ...rest,
  };
}

function presentations(...environments: ReadonlyArray<readonly [string, ServerProvider[]]>) {
  return new Map(
    environments.map(([id, providers]) => [
      EnvironmentId.make(id),
      { entry: { target: { label: id } }, serverConfig: { providers } },
    ]),
  );
}

function sections(input: ReturnType<typeof presentations>) {
  const accounts = collectLimitAccounts(input);
  return limitCardSections(
    collectLimitPools(accounts, now),
    windowlessLimitAccounts(input, accounts),
    now,
  );
}

describe("primaryEntry", () => {
  it.each([
    ["session over weekly", [weekly, session], session],
    ["weekly over others", [monthly, weekly], weekly],
    ["the first report otherwise", [monthly], monthly],
  ])("picks %s", (_, windows, expected) => {
    expect(primaryEntry(windows.map((window) => ({ window })))?.window).toBe(expected);
  });

  it("returns null without windows", () => {
    expect(primaryEntry([])).toBeNull();
  });
});

describe("splitCardEntries", () => {
  const entry = (
    id: string,
    kind: ServerProviderUsageWindow["kind"],
    usedPercent: number,
  ): LimitCardEntry => ({
    key: id,
    label: id,
    description: undefined,
    reset: undefined,
    window: { id, kind, label: id, usedPercent },
  });
  const ids = (entries: readonly LimitCardEntry[]) => entries.map((item) => item.key);

  it("bars the binding weekly and keeps every five-hour window as a chip", () => {
    const split = splitCardEntries([
      entry("gemini-5h", "session", 25),
      entry("gemini-weekly", "weekly", 35),
      entry("3p-5h", "session", 0),
      entry("3p-weekly", "weekly", 8),
      entry("monthly", "monthly", 50),
    ]);
    expect(ids(split.chips)).toEqual(["gemini-5h", "3p-5h"]);
    expect(split.main?.key).toBe("gemini-weekly");
    expect(ids(split.rest)).toEqual(["3p-weekly", "monthly"]);
  });

  it("falls back to monthly, then other windows, then the lowest five-hour window", () => {
    expect(splitCardEntries([entry("other", "other", 0), entry("m", "monthly", 0)]).main?.key).toBe(
      "m",
    );
    expect(splitCardEntries([entry("other", "other", 0)]).main?.key).toBe("other");
    const sessionsOnly = splitCardEntries([entry("a", "session", 10), entry("b", "session", 60)]);
    expect(sessionsOnly.main?.key).toBe("b");
    expect(ids(sessionsOnly.chips)).toEqual(["a"]);
    expect(splitCardEntries([]).main).toBeNull();
  });
});

describe("limitCardSections", () => {
  it("orders accounts by key, numbers them, and splits chips, bar, and the rest", () => {
    const [codex] = sections(
      presentations([
        "desk",
        [
          provider("work10", { windows: [weekly, session] }),
          provider("work2", { windows: [weekly] }),
        ],
      ]),
    );
    expect(codex?.cards.map((card) => [card.account.key, card.number])).toEqual([
      ["desk:work2", 1],
      ["desk:work10", 2],
    ]);
    const work10 = codex?.cards[1];
    expect(work10?.chips.map((entry) => entry.window.id)).toEqual(["five_hour"]);
    expect(work10?.main?.window.id).toBe("weekly");
    expect(work10?.rest).toEqual([]);
  });

  it("leaves a lone account unnumbered and without a pooled refill", () => {
    const [codex] = sections(presentations(["desk", [provider("solo", { windows: [session] })]]));
    expect(codex?.cards[0]?.number).toBeNull();
    expect(codex?.nextRefill).toBeNull();
  });

  it("gives windowless providers a card in their provider's section, or a section of their own", () => {
    const result = sections(
      presentations([
        "desk",
        [
          provider("work", { windows: [session] }),
          provider("broken", {
            usageLimits: {
              checkedAt,
              windows: [],
              unavailable: { reason: "probeFailed", message: "Could not read limits." },
            },
          }),
          provider("claude", { driver: ProviderDriverKind.make("claudeAgent") }),
          provider("custom", { driver: ProviderDriverKind.make("someUnknownDriver") }),
        ],
      ]),
    );
    expect(
      result.map((section) => [
        section.driver,
        section.cards.map((card) => [card.account.key, card.main === null]),
      ]),
    ).toEqual([
      [
        "codex",
        [
          ["desk:broken", true],
          ["desk:work", false],
        ],
      ],
      ["claudeAgent", [["desk:claude", true]]],
    ]);
  });

  it("does not add a windowless card for an account another environment already shows", () => {
    const auth = { status: "authenticated", email: "me@example.com" } as const;
    const result = sections(
      presentations(
        ["desk", [provider("codex", { auth, windows: [session] })]],
        [
          "laptop",
          [
            provider("codex", {
              auth,
              usageLimits: { checkedAt, windows: [], unavailable: { reason: "probeFailed" } },
            }),
          ],
        ],
      ),
    );
    expect(result.flatMap((section) => section.cards.map((card) => card.account.key))).toEqual([
      "desk:codex",
    ]);
  });

  it("skips providers whose usage lives behind an external link", () => {
    const external = provider("chatgpt", {
      usageLimits: {
        checkedAt,
        windows: [],
        unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
        externalUsage: { label: "ChatGPT usage", url: "https://chatgpt.com/#settings/Usage" },
      },
    });
    expect(sections(presentations(["desk", [external]]))).toEqual([]);
  });
});
