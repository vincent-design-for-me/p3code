import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import {
  displayLimitWindows,
  type LimitAccount,
  type LimitPool,
  type LimitPoolWindow,
  type LimitPresentations,
  providersWithLimits,
} from "@t3tools/shared/usageLimits";
import { cursorUsageWindowDetails, limitsNotice } from "@t3tools/shared/usageLimitsCopy";

import { m, type MessageResolver } from "../../../i18n/messages";
import { PROVIDER_PRESENTATION } from "../../usage/usageProviders";

type PoolReset = LimitPoolWindow["resets"][number];

export interface LimitCardEntry {
  readonly key: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly window: ServerProviderUsageWindow;
  readonly reset: PoolReset | undefined;
}

export interface LimitCard {
  readonly account: LimitAccount;
  /** Set when the provider has several accounts, so unnamed ones read "Account 2". */
  readonly number: number | null;
  readonly primary: LimitCardEntry | null;
  readonly rest: readonly LimitCardEntry[];
}

export interface LimitCardSection {
  readonly driver: ServerProvider["driver"];
  readonly cards: readonly LimitCard[];
  readonly nextRefill: PoolReset | null;
}

const KNOWN_DRIVERS = new Set<string>(
  Object.values(PROVIDER_PRESENTATION).map((presentation) => presentation.driverKind),
);

const METER_COLORS: Readonly<Record<string, readonly [string, string]>> = {
  codex: ["#5263ef", "#2caeaf"],
  claudeAgent: ["#db704d", "#b759a9"],
  antigravity: ["#6150ec", "#bd61d4"],
};

export function meterColors(
  driver: ServerProvider["driver"],
  accentColor: string | undefined,
): readonly [string, string] {
  if (accentColor) return [accentColor, `color-mix(in oklab, ${accentColor} 55%, #9075ed)`];
  return METER_COLORS[driver] ?? ["#536deb", "#37a69d"];
}

/** Session first, then weekly, then whatever the provider reports first. */
export function primaryEntry<T extends { readonly window: ServerProviderUsageWindow }>(
  entries: readonly T[],
): T | null {
  return (
    entries.find((entry) => entry.window.kind === "session") ??
    entries.find((entry) => entry.window.kind === "weekly") ??
    entries[0] ??
    null
  );
}

const emailIdentity = (driver: ServerProvider["driver"], email: string | undefined) => {
  const normalized = email?.trim().toLowerCase();
  return normalized ? `${driver}:${normalized}` : null;
};

/**
 * Enabled providers that `collectLimitAccounts` leaves out because they report no windows, so
 * each still gets a card with its notice. An account another report already shows is skipped,
 * and so is one with an external usage link, which has its own section.
 */
export function windowlessLimitAccounts(
  presentations: LimitPresentations,
  accounts: readonly LimitAccount[],
): readonly LimitAccount[] {
  const shown = new Set(accounts.map((account) => emailIdentity(account.driver, account.email)));
  const added: LimitAccount[] = [];
  for (const [environmentId, presentation] of presentations) {
    for (const provider of presentation.serverConfig?.providers ?? []) {
      if (!provider.enabled || !provider.installed) continue;
      const listed = providersWithLimits([provider]).length > 0;
      if (listed && provider.usageLimits && limitsNotice(provider.usageLimits) === null) continue;
      if (!listed && !KNOWN_DRIVERS.has(provider.driver)) continue;
      if (provider.usageLimits?.externalUsage) continue;
      const identity = emailIdentity(provider.driver, provider.auth.email);
      if (identity !== null) {
        if (shown.has(identity)) continue;
        shown.add(identity);
      }
      added.push({
        key: `${environmentId}:${provider.instanceId}`,
        driver: provider.driver,
        displayName: provider.displayName?.trim() || null,
        email: provider.auth.email,
        plan: provider.auth.label,
        accentColor: provider.accentColor,
        environments: [{ environmentId, label: presentation.entry.target.label }],
        sourceLabel: null,
        redeem: null,
        limits: { checkedAt: provider.checkedAt, ...provider.usageLimits, windows: [] },
      });
    }
  }
  return added;
}

function cardEntries(pool: LimitPool, resolve: MessageResolver) {
  const entries = new Map<string, LimitCardEntry[]>(
    pool.accounts.map((account) => [account.key, []]),
  );
  for (const poolWindow of displayLimitWindows(pool)) {
    const details =
      pool.driver === "cursor" ? cursorUsageWindowDetails(poolWindow.id, pool, resolve) : undefined;
    const resets = new Map(poolWindow.resets.map((reset) => [reset.member.account.key, reset]));
    for (const { account, window } of poolWindow.members) {
      if (!Number.isFinite(window.usedPercent)) continue;
      entries.get(account.key)?.push({
        key: `${window.kind}:${window.id}`,
        label: details?.label ?? window.label,
        description: details?.description,
        window,
        reset: resets.get(account.key),
      });
    }
  }
  return entries;
}

function nextPoolRefill(pool: LimitPool, now: number): PoolReset | null {
  const primary = primaryEntry(displayLimitWindows(pool).map((window) => ({ window })))?.window;
  if (!primary || primary.columns.length < 2) return null;
  return primary.resets.find((reset) => reset.at > now && reset.restoresPercent > 0) ?? null;
}

const byKey = (left: LimitAccount, right: LimitAccount) =>
  left.key.localeCompare(right.key, undefined, { numeric: true });

/** One section per provider and one card per account, ordered by account key. */
export function limitCardSections(
  pools: readonly LimitPool[],
  windowless: readonly LimitAccount[],
  now: number,
  resolve: MessageResolver = m,
): readonly LimitCardSection[] {
  const extra = new Map<ServerProvider["driver"], LimitAccount[]>();
  for (const account of windowless) {
    extra.set(account.driver, [...(extra.get(account.driver) ?? []), account]);
  }
  const section = (
    driver: ServerProvider["driver"],
    accounts: readonly LimitAccount[],
    entries: ReadonlyMap<string, readonly LimitCardEntry[]>,
    nextRefill: PoolReset | null,
  ): LimitCardSection => {
    const sorted = [...accounts].sort(byKey);
    return {
      driver,
      nextRefill,
      cards: sorted.map((account, index) => {
        const accountEntries = entries.get(account.key) ?? [];
        const primary = primaryEntry(accountEntries);
        return {
          account,
          number: sorted.length > 1 ? index + 1 : null,
          primary,
          rest: accountEntries.filter((entry) => entry !== primary),
        };
      }),
    };
  };
  const sections = pools.map((pool) =>
    section(
      pool.driver,
      [...pool.accounts, ...(extra.get(pool.driver) ?? [])],
      cardEntries(pool, resolve),
      nextPoolRefill(pool, now),
    ),
  );
  for (const [driver, accounts] of extra) {
    if (pools.some((pool) => pool.driver === driver)) continue;
    sections.push(section(driver, accounts, new Map(), null));
  }
  return sections;
}
