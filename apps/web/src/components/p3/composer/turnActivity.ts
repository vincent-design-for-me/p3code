import { isDeliveredProviderTurn, type OrchestrationV2ProviderTurn } from "@t3tools/contracts";

export type ActivityTurn = Pick<
  OrchestrationV2ProviderTurn,
  "providerThreadId" | "status" | "ordinal" | "turnTokenUsage" | "promptDropped"
>;

export interface TurnActivity {
  /** Completed model turns on the provider thread; local commands do not count. */
  readonly count: number;
  /** The last turn's input plus output tokens, when the provider reported both. */
  readonly tokens: number | null;
  /** Share of the last turn's input read from cache, 0 to 1. */
  readonly cacheHit: number | null;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

export function lastTurnActivity(
  turns: readonly ActivityTurn[],
  providerThreadId: string | null,
): TurnActivity {
  let latest: ActivityTurn | null = null;
  let count = 0;
  for (const turn of turns) {
    if (
      providerThreadId === null ||
      turn.providerThreadId !== providerThreadId ||
      turn.status !== "completed" ||
      !isDeliveredProviderTurn(turn) ||
      turn.turnTokenUsage?.localCommand === true
    ) {
      continue;
    }
    count += 1;
    if (latest === null || turn.ordinal > latest.ordinal) latest = turn;
  }
  const usage = latest?.turnTokenUsage;
  const cacheRead = usage?.cachedInputTokens ?? null;
  const complete = usage?.usageStatus === "complete" ? usage : null;
  return {
    count,
    tokens: complete ? complete.inputTokens + complete.outputTokens : null,
    // Input includes cache reads, so the hit rate is their share of it.
    cacheHit:
      complete &&
      complete.inputTokens > 0 &&
      cacheRead !== null &&
      cacheRead <= complete.inputTokens
        ? cacheRead / complete.inputTokens
        : null,
    cacheRead,
    cacheWrite: usage?.cacheCreationTokens ?? null,
  };
}
