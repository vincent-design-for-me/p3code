import type {
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import { paceRemainingPercent, remainingPercent } from "@t3tools/shared/usageLimits";
import { limitsNotice } from "@t3tools/shared/usageLimitsCopy";

import { m, type MessageResolver } from "~/i18n/messages";
import {
  nextPoolReset,
  resolveThreadDetailsLimits,
  resolveThreadHttpQuotas,
} from "../../chat/ThreadDetailsUsage.logic";
import { modelQuotaWindows } from "./modelQuotaWindows";

/** One quota row, whether an account's own window, a hub pool, or an HTTP quota source. */
export interface QuotaEntry {
  readonly key: string;
  readonly kind: ServerProviderUsageWindow["kind"];
  /** The provider-reported label; localize with `quotaWindowLabel`. */
  readonly label: string;
  readonly windowDurationMins: number | undefined;
  readonly remaining: number;
  /** Percent of the window's time left, for an even-pace marker. Pools have none. */
  readonly pace: number | null;
  /** The window whose `resetsAt` is the next refill, for `formatResetsIn`. */
  readonly resetWindow: ServerProviderUsageWindow | null;
  readonly account: string | null;
}

export interface ModelQuota {
  readonly current: readonly QuotaEntry[];
  readonly other: readonly QuotaEntry[];
  /** Why no windows are shown, when the provider says. */
  readonly notice: string | null;
}

function windowEntry(
  window: ServerProviderUsageWindow,
  now: number,
  account: string | null = null,
  key = window.id,
): QuotaEntry {
  return {
    key,
    kind: window.kind,
    label: window.label,
    windowDurationMins: window.windowDurationMins,
    remaining: remainingPercent(window),
    pace: paceRemainingPercent(window, now),
    resetWindow: window.resetsAt ? window : null,
    account,
  };
}

/**
 * The quota rows for the selected provider instance and model, split into those that meter the
 * model and the rest. Reads the same limits the thread details card resolves; no requests.
 */
export function resolveModelQuota(
  provider: ServerProvider,
  model: string | null,
  providers: readonly ServerProvider[],
  sources: UsageLimitSourceSnapshots,
  now: number,
  resolve: MessageResolver = m,
): ModelQuota {
  const resolved = resolveThreadDetailsLimits(provider.instanceId, model, providers, sources, now);
  const quotas = resolveThreadHttpQuotas(provider.instanceId, sources).map(
    ({ key, accountLabel, window }) => windowEntry(window, now, accountLabel, key),
  );
  if (resolved?.kind === "pool") {
    const split = modelQuotaWindows(provider.driver, resolved.windows, model);
    const entry = (pool: (typeof resolved.windows)[number]): QuotaEntry => ({
      key: pool.id,
      kind: pool.kind,
      label: pool.label,
      windowDurationMins: pool.members[0]?.window.windowDurationMins,
      remaining: pool.remainingPercent,
      pace: null,
      resetWindow: nextPoolReset(pool, now)?.member.window ?? null,
      account: null,
    });
    return {
      current: [...split.current.map(entry), ...quotas],
      other: split.other.map(entry),
      notice: null,
    };
  }
  const notice = resolved ? limitsNotice(resolved.limits, resolve) : null;
  if (!resolved || notice !== null) {
    return { current: quotas, other: [], notice: quotas.length > 0 ? null : notice };
  }
  const split = modelQuotaWindows(provider.driver, resolved.limits.windows, model);
  return {
    current: [...split.current.map((window) => windowEntry(window, now)), ...quotas],
    other: split.other.map((window) => windowEntry(window, now)),
    notice: null,
  };
}
