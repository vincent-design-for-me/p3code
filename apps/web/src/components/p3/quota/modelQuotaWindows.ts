import type {
  ServerProvider,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { antigravityWindowLimitsModel, remainingPercent } from "@t3tools/shared/usageLimits";
import { limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";

type Driver = ServerProvider["driver"];

/** The fields the model rules read, so pooled hub windows can be split too. */
export type QuotaWindowLike = Pick<
  ServerProviderUsageWindow,
  "id" | "kind" | "modelIds" | "providerIds"
>;

export interface ModelQuotaWindows<W extends QuotaWindowLike> {
  /** Windows that meter the model, ordered session, weekly, monthly, other. */
  readonly current: readonly W[];
  /** Every other reported window of the account, in the same order. */
  readonly other: readonly W[];
}

const KIND_ORDER: Record<ServerProviderUsageWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

const CURSOR_OWN_MODEL = /^(auto|default|grok|composer)/i;
const CLAUDE_SCOPED_PREFIX = "seven_day_";

// Mirrors the server's claudeUsageLimits windowLimitsModel, which names scoped windows this way.
const claudeScopeToken = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_");

function antigravityGeminiVariant(id: string): "argon" | "carbon" | "gemini" | null {
  if (!id.startsWith("gemini")) return null;
  return id.includes("argon") ? "argon" : id.includes("carbon") ? "carbon" : "gemini";
}

function antigravityMeters<W extends QuotaWindowLike>(
  window: W,
  windows: readonly W[],
  model: string,
): boolean {
  const base = model.slice(model.lastIndexOf("/") + 1).toLowerCase();
  const variant = antigravityGeminiVariant(base);
  // Older accounts report a Gemini quota with no Argon or Carbon buckets; those models spend it.
  if (
    (variant === "argon" || variant === "carbon") &&
    antigravityGeminiVariant(window.id) === "gemini" &&
    !windows.some((candidate) => antigravityGeminiVariant(candidate.id) === variant)
  ) {
    return true;
  }
  if (!antigravityWindowLimitsModel(window, model)) return false;
  // Per-model quotas from older accounts meter Claude and GPT apart; "3p-" buckets are shared.
  const family = /^(claude|gpt)-/.exec(window.id)?.[1];
  const modelFamily = /^(claude|gpt)/.exec(base)?.[1];
  return family === undefined || modelFamily === undefined || family === modelFamily;
}

function meters<W extends QuotaWindowLike>(
  driver: Driver,
  window: W,
  windows: readonly W[],
  model: string | null,
): boolean {
  if (model === null) {
    // Without a model, only windows that name what they meter can be ruled out.
    return (
      window.modelIds === undefined &&
      window.providerIds === undefined &&
      !(driver === "claudeAgent" && window.id.startsWith(CLAUDE_SCOPED_PREFIX))
    );
  }
  if (window.providerIds !== undefined && !window.providerIds.includes(model.split("/")[0] ?? "")) {
    return false;
  }
  if (window.modelIds !== undefined) return window.modelIds.includes(model);
  switch (driver) {
    case "claudeAgent":
      return (
        !window.id.startsWith(CLAUDE_SCOPED_PREFIX) ||
        claudeScopeToken(model).includes(window.id.slice(CLAUDE_SCOPED_PREFIX.length))
      );
    case "cursor":
      if (window.id === "autoPercentUsed") return CURSOR_OWN_MODEL.test(model);
      if (window.id === "apiPercentUsed") return !CURSOR_OWN_MODEL.test(model);
      return true;
    case "opencode":
      return !window.id.startsWith("go_") || model.startsWith("opencode-go/");
    case "antigravity":
      return antigravityMeters(window, windows, model);
    default:
      return true;
  }
}

/**
 * Splits an account's windows into those that meter `model` and the rest. A null model (a fresh
 * draft with no explicit pick) keeps every window that does not name the models it meters.
 */
export function modelQuotaWindows<W extends QuotaWindowLike>(
  driver: Driver,
  windows: readonly W[],
  model: string | null,
): ModelQuotaWindows<W> {
  const ordered = [...windows].sort(
    (left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind],
  );
  // Seat-based Codex plans spend credits only past their plan windows, so the credit cap is noise.
  const hasCodexPlanWindows =
    driver === "codex" &&
    ordered.some((window) => window.id === "primary" || window.id === "secondary");
  const shown = hasCodexPlanWindows
    ? ordered.filter((window) => window.id !== "individual")
    : ordered;
  const current: W[] = [];
  const other: W[] = [];
  for (const window of shown) {
    (meters(driver, window, shown, model) ? current : other).push(window);
  }
  return { current, other };
}

export interface PickerQuota {
  /** The window the picker shows: the scarcest session window, else the scarcest weekly one. */
  readonly window: ServerProviderUsageWindow;
  /** Whole percent left, 0 to 100. */
  readonly remaining: number;
  /** True when no session window meters the model, so the figure is a weekly allowance. */
  readonly weekly: boolean;
}

/** The single quota figure the model picker shows beside a model, or null when none applies. */
export function pickerQuota(
  driver: Driver,
  limits: ServerProviderUsageLimits | null | undefined,
  slug: string,
): PickerQuota | null {
  if (!limits || limitsNotice(limits) !== null) return null;
  const { current } = modelQuotaWindows(driver, limits.windows, slug);
  const session = current.filter(
    (window) => window.kind === "session" || window.windowDurationMins === 300,
  );
  const weekly = current.filter(
    (window) => window.kind === "weekly" || window.windowDurationMins === 10_080,
  );
  const candidates = session.length > 0 ? session : weekly;
  let lowest: ServerProviderUsageWindow | null = null;
  for (const candidate of candidates) {
    if (lowest === null || remainingPercent(candidate) < remainingPercent(lowest)) {
      lowest = candidate;
    }
  }
  return lowest === null
    ? null
    : { window: lowest, remaining: remainingPercent(lowest), weekly: session.length === 0 };
}

const WEEKLY = msg("Weekly", { $context: "usage limit window" });
const MONTHLY = msg("Monthly", { $context: "usage limit window" });
const SESSION = msg("Session", { $context: "usage limit window" });

// Provider-reported label parts; anything else (model families, plan names) stays as reported.
const LABEL_PARTS: Readonly<Record<string, string>> = {
  Weekly: WEEKLY,
  Monthly: MONTHLY,
  Session: SESSION,
  Quota: msg("Quota", { $context: "usage limit window" }),
  "Reported quota": msg("Reported quota"),
};

type LabelledWindow = Pick<ServerProviderUsageWindow, "label" | "windowDurationMins">;

function formatUnit(locale: string, unit: "hour" | "day" | "week", value: number, narrow: boolean) {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: narrow ? "narrow" : "short",
  }).format(value);
}

/** A window's provider label in the UI language; a five-hour window reads as "5 hr". */
export function quotaWindowLabel(
  window: LabelledWindow,
  locale: string,
  resolve: MessageResolver = m,
): string {
  return window.label
    .split(" · ")
    .map((part) => {
      if (part === "5-hour" || (part === "Session" && window.windowDurationMins === 300)) {
        return formatUnit(locale, "hour", 5, false);
      }
      const copy = LABEL_PARTS[part];
      if (copy !== undefined) return resolve(copy);
      const shared = /^(.+) \(shared\)$/i.exec(part)?.[1];
      return shared === undefined ? part : resolve(msg("{family} (shared)", { family: shared }));
    })
    .join(" · ");
}

/** A window's length in a narrow unit ("5h", "1w"), else its localized label. */
export function quotaWindowPeriod(
  window: LabelledWindow & Pick<ServerProviderUsageWindow, "kind">,
  locale: string,
  resolve: MessageResolver = m,
): string {
  const minutes = window.windowDurationMins ?? (window.kind === "weekly" ? 10_080 : 0);
  if (minutes > 0 && minutes % 10_080 === 0)
    return formatUnit(locale, "week", minutes / 10_080, true);
  if (minutes > 0 && minutes % 1_440 === 0) return formatUnit(locale, "day", minutes / 1_440, true);
  if (minutes > 0 && minutes % 60 === 0) return formatUnit(locale, "hour", minutes / 60, true);
  if (window.kind === "weekly") return resolve(WEEKLY);
  if (window.kind === "monthly") return resolve(MONTHLY);
  if (window.kind === "session") return resolve(SESSION);
  return quotaWindowLabel(window, locale, resolve);
}
