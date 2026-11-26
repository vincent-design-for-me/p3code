import {
  type EnvironmentId,
  PROVIDER_DISPLAY_NAMES,
  type ProviderDriverKind,
  type ServerProviderUsageLimits,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import {
  collectLimitAccounts,
  type LimitPresentations,
  remainingPercent,
} from "@t3tools/shared/usageLimits";

const MINUTE = 60_000;
const FIVE_HOUR_MINS = 300;
const WEEK_MINS = 10_080;

const KNOWN_PROVIDERS: ReadonlyArray<readonly [driver: string, color: string]> = [
  ["codex", "#299a7d"],
  ["claudeAgent", "#d67c57"],
  ["cursor", "#8b7ec4"],
  ["grok", "#6c91d8"],
  ["antigravity", "#9b7ad9"],
];

/** Notch stroke gradient, top to bottom. */
export const QUOTA_NOTCH_GRADIENT = ["#299a7d", "#d67c57", "#9b7ad9"] as const;

type LimitPresentation = LimitPresentations extends ReadonlyMap<EnvironmentId, infer P> ? P : never;

export type QuotaRailPresentations = ReadonlyMap<
  EnvironmentId,
  LimitPresentation & { readonly connection: { readonly phase: string } }
>;

export interface QuotaRailAccount {
  readonly key: string;
  readonly displayName: string | null;
  readonly environment: string | null;
  readonly plan: string | undefined;
  readonly limits: ServerProviderUsageLimits | undefined;
  /** Usable windows, best first: five-hour, weekly, then the rest. */
  readonly windows: readonly ServerProviderUsageWindow[];
}

export interface QuotaRailGroup {
  readonly driver: ProviderDriverKind;
  readonly name: string;
  readonly color: string;
  readonly accounts: readonly QuotaRailAccount[];
}

function isFiveHourWindow(window: ServerProviderUsageWindow): boolean {
  return (
    window.windowDurationMins === FIVE_HOUR_MINS ||
    (window.windowDurationMins === undefined &&
      /(?:^|[ ·])5[-\s]?(?:h|hours?)\b/i.test(window.label))
  );
}

export function isWeeklyWindow(window: ServerProviderUsageWindow): boolean {
  return window.kind === "weekly" || window.windowDurationMins === WEEK_MINS;
}

function windowRank(window: ServerProviderUsageWindow): number {
  if (isFiveHourWindow(window)) return 0;
  if (isWeeklyWindow(window)) return 1;
  return 2;
}

function parseTime(value: string | undefined): number {
  return value === undefined ? Number.NaN : Date.parse(value);
}

export function quotaWindows(
  limits: ServerProviderUsageLimits | undefined,
): readonly ServerProviderUsageWindow[] {
  if (!limits || limits.unavailable) return [];
  return limits.windows
    .filter((window) => Number.isFinite(window.usedPercent))
    .toSorted(
      (a, b) =>
        windowRank(a) - windowRank(b) ||
        b.usedPercent - a.usedPercent ||
        (parseTime(a.resetsAt) || Infinity) - (parseTime(b.resetsAt) || Infinity),
    );
}

/**
 * One group per driver with a connected account: native instances that are enabled, installed and
 * signed in (or report windows without a known auth state), plus accounts only an auxiliary usage
 * source reports. Known providers keep a fixed order; others follow in discovery order.
 */
export function collectQuotaRailGroups(
  presentations: QuotaRailPresentations,
): readonly QuotaRailGroup[] {
  const connected = new Map(
    [...presentations].filter(
      ([, presentation]) =>
        presentation.connection.phase === "connected" && presentation.serverConfig !== null,
    ),
  );
  const groups = new Map<
    string,
    { driver: ProviderDriverKind | null; color: string; accounts: QuotaRailAccount[] }
  >(KNOWN_PROVIDERS.map(([driver, color]) => [driver, { driver: null, color, accounts: [] }]));
  const add = (driver: ProviderDriverKind, account: QuotaRailAccount) => {
    const group = groups.get(driver);
    if (group) {
      group.driver = driver;
      group.accounts.push(account);
    } else {
      groups.set(driver, { driver, color: "var(--ring)", accounts: [account] });
    }
  };
  for (const [environmentId, { entry, serverConfig }] of connected) {
    for (const provider of serverConfig?.providers ?? []) {
      if (!provider.enabled || !provider.installed) continue;
      const status = provider.auth.status;
      const windows = quotaWindows(provider.usageLimits);
      if (status !== "authenticated" && !(status === "unknown" && windows.length > 0)) continue;
      add(provider.driver, {
        key: `${environmentId}:${provider.instanceId}`,
        displayName: provider.displayName?.trim() || null,
        environment: connected.size > 1 ? entry.target.label : null,
        plan: provider.auth.label,
        limits: provider.usageLimits,
        windows,
      });
    }
  }
  // The shared selector already deduplicates snapshots from auxiliary sources.
  for (const account of collectLimitAccounts(connected)) {
    if (account.environments.length > 0) continue;
    add(account.driver, {
      key: account.key,
      displayName: account.displayName,
      environment: account.sourceLabel,
      plan: account.plan,
      limits: account.limits,
      windows: quotaWindows(account.limits),
    });
  }
  return [...groups.values()].flatMap(({ driver, color, accounts }) =>
    driver === null || accounts.length === 0
      ? []
      : [{ driver, name: PROVIDER_DISPLAY_NAMES[driver] ?? driver, color, accounts }],
  );
}

/**
 * The account the dial shows: the lowest remaining share among accounts whose first window has the
 * best rank, so a weekly fallback never hides another account's five-hour window.
 */
export function primaryQuota(
  accounts: readonly QuotaRailAccount[],
): { readonly account: QuotaRailAccount; readonly remaining: number } | null {
  let best: { account: QuotaRailAccount; rank: number; remaining: number } | null = null;
  for (const account of accounts) {
    const window = account.windows[0];
    if (!window) continue;
    const rank = windowRank(window);
    const remaining = remainingPercent(window);
    if (!best || rank < best.rank || (rank === best.rank && remaining < best.remaining)) {
      best = { account, rank, remaining };
    }
  }
  return best && { account: best.account, remaining: best.remaining };
}

/**
 * Extrapolates the average burn rate from the window's start to the last sample. Refuses windows
 * without a known length or a future reset, samples from the future or past the reset, and samples
 * taken too early to say anything (under 5% of the window or 10 minutes, whichever is shorter).
 */
export function estimateQuota(
  window: ServerProviderUsageWindow,
  checkedAt: string | undefined,
  now: number,
):
  | { readonly remaining: number; readonly expiresAt: null }
  | {
      readonly remaining: null;
      readonly expiresAt: number;
    }
  | null {
  const reset = parseTime(window.resetsAt);
  const sample = parseTime(checkedAt);
  const durationMins =
    window.windowDurationMins ??
    (isFiveHourWindow(window) ? FIVE_HOUR_MINS : isWeeklyWindow(window) ? WEEK_MINS : 0);
  const duration = durationMins * MINUTE;
  const start = reset - duration;
  const elapsed = sample - start;
  if (
    !Number.isFinite(reset) ||
    !Number.isFinite(sample) ||
    sample >= reset ||
    reset <= now ||
    sample > now + MINUTE ||
    duration <= 0 ||
    elapsed < Math.min(duration * 0.05, 10 * MINUTE)
  ) {
    return null;
  }
  const usedAtReset = (window.usedPercent * duration) / elapsed;
  if (usedAtReset <= 100) return { remaining: Math.max(0, 100 - usedAtReset), expiresAt: null };
  return { remaining: null, expiresAt: start + (elapsed * 100) / window.usedPercent };
}

export type QuotaForecast =
  | { readonly kind: "limitReached" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "emptyIn"; readonly ms: number }
  | { readonly kind: "beforeReset" }
  | { readonly kind: "atReset"; readonly remaining: number };

export function quotaForecast(
  window: ServerProviderUsageWindow,
  checkedAt: string | undefined,
  now: number,
): QuotaForecast {
  if (
    window.usedPercent >= 100 &&
    (window.resetsAt === undefined || Date.parse(window.resetsAt) > now)
  ) {
    return { kind: "limitReached" };
  }
  const estimate = estimateQuota(window, checkedAt, now);
  if (!estimate) return { kind: "unavailable" };
  if (estimate.expiresAt !== null) {
    return estimate.expiresAt > now
      ? { kind: "emptyIn", ms: estimate.expiresAt - now }
      : { kind: "beforeReset" };
  }
  return { kind: "atReset", remaining: estimate.remaining };
}

export function isForecastAlert(forecast: QuotaForecast): boolean {
  return (
    forecast.kind === "limitReached" ||
    forecast.kind === "emptyIn" ||
    forecast.kind === "beforeReset"
  );
}

export interface NotchSize {
  readonly width: number;
  readonly height: number;
  readonly curve: number;
  readonly radius: number;
}

/**
 * One continuous outline: window edge, concave fillet, convex corner, side, corner, fillet, window
 * edge. The path box is `curve` taller than the dock at each end.
 */
export function quotaNotchPath({ width: w, height: h, curve: c, radius: r }: NotchSize): string {
  const top = c;
  const bottom = c + h;
  return [
    `M ${w} 0`,
    `A ${c} ${c} 0 0 1 ${w - c} ${top}`,
    `L ${r} ${top}`,
    `A ${r} ${r} 0 0 0 0 ${top + r}`,
    `L 0 ${bottom - r}`,
    `A ${r} ${r} 0 0 0 ${r} ${bottom}`,
    `L ${w - c} ${bottom}`,
    `A ${c} ${c} 0 0 1 ${w} ${bottom + c}`,
  ].join(" ");
}
