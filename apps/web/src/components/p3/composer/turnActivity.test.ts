import { ProviderThreadId, type TurnTokenUsage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { type ActivityTurn, lastTurnActivity } from "./turnActivity";

const THREAD = ProviderThreadId.make("provider-thread-1");
const OTHER_THREAD = ProviderThreadId.make("provider-thread-2");

function usage(extra: Partial<TurnTokenUsage> = {}): TurnTokenUsage {
  return {
    usageScope: "main_agent",
    hasSubagents: false,
    usageStatus: "complete",
    inputTokens: 1_000,
    outputTokens: 200,
    ...extra,
  } as TurnTokenUsage;
}

function turn(ordinal: number, extra: Partial<ActivityTurn> = {}): ActivityTurn {
  return { providerThreadId: THREAD, status: "completed", ordinal, ...extra };
}

describe("lastTurnActivity", () => {
  it("counts completed model turns on the provider thread and reads the latest", () => {
    const activity = lastTurnActivity(
      [
        turn(2, { turnTokenUsage: usage({ cachedInputTokens: 800, cacheCreationTokens: 50 }) }),
        turn(1, { turnTokenUsage: usage({ inputTokens: 10, outputTokens: 10 }) }),
        turn(3, { status: "running" }),
        turn(4, { status: "failed" }),
        turn(5, { providerThreadId: OTHER_THREAD }),
        turn(6, { turnTokenUsage: usage({ localCommand: true }) }),
        turn(7, { promptDropped: true }),
      ],
      THREAD,
    );
    expect(activity).toEqual({
      count: 2,
      tokens: 1_200,
      cacheHit: 0.8,
      cacheRead: 800,
      cacheWrite: 50,
    });
  });

  it("leaves totals out of partial usage but keeps cache counters", () => {
    const activity = lastTurnActivity(
      [
        turn(1, {
          turnTokenUsage: usage({
            usageStatus: "partial",
            inputTokens: undefined,
            cachedInputTokens: 300,
          } as Partial<TurnTokenUsage>),
        }),
      ],
      THREAD,
    );
    expect(activity).toMatchObject({ count: 1, tokens: null, cacheHit: null, cacheRead: 300 });
  });

  it("rejects a cache read larger than the input", () => {
    const activity = lastTurnActivity(
      [turn(1, { turnTokenUsage: usage({ inputTokens: 100, cachedInputTokens: 200 }) })],
      THREAD,
    );
    expect(activity.cacheHit).toBeNull();
  });

  it("is empty without a provider thread", () => {
    expect(lastTurnActivity([turn(1, { turnTokenUsage: usage() })], null)).toEqual({
      count: 0,
      tokens: null,
      cacheHit: null,
      cacheRead: null,
      cacheWrite: null,
    });
  });
});
