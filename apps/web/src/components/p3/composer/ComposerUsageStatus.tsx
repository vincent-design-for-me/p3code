import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import type { ServerProvider, UsageLimitSourceSnapshots } from "@t3tools/contracts";
import { formatResetsIn } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { useGT, useLocale, useMessages } from "gt-react";
import type { ReactElement, ReactNode } from "react";

import { useNowMinute } from "../../../hooks/useNowMinute";
import { cn } from "../../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { type ModelQuota, type QuotaEntry, resolveModelQuota } from "../quota/modelQuota";
import { quotaWindowLabel, quotaWindowPeriod } from "../quota/modelQuotaWindows";
import { type ActivityTurn, lastTurnActivity, type TurnActivity } from "./turnActivity";

/** What the footer needs from the thread view; the composer adds its selected instance and model. */
export interface ComposerUsageStatusInput {
  readonly sources: UsageLimitSourceSnapshots;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly providerThreadId: string | null;
  readonly turns: readonly ActivityTurn[] | undefined;
}

interface Formats {
  readonly number: Intl.NumberFormat;
  readonly compact: Intl.NumberFormat;
  readonly percent: Intl.NumberFormat;
}

/** One row under the composer input: context use, the last turn's tokens and cache, and quota. */
export function ComposerUsageStatus({
  instanceId,
  model,
  providers,
  sources,
  contextWindow,
  providerThreadId,
  turns,
}: ComposerUsageStatusInput & {
  readonly instanceId: string;
  readonly model: string;
  readonly providers: readonly ServerProvider[];
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const provider = providers.find((candidate) => candidate.instanceId === instanceId);
  if (!provider) return null;
  const formats: Formats = {
    number: new Intl.NumberFormat(locale),
    compact: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
    percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }),
  };
  const quota = resolveModelQuota(provider, model, providers, sources, now, m);
  return (
    <div
      data-composer-usage-status="true"
      role="group"
      aria-label={gt("Usage")}
      className="mx-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border/70 pt-1.5 pb-2 text-2xs leading-tight text-muted-foreground tabular-nums"
    >
      <ContextMeter context={contextWindow} formats={formats} />
      <LastTurn activity={lastTurnActivity(turns ?? [], providerThreadId)} formats={formats} />
      <QuotaSummary quota={quota} now={now} formats={formats} />
    </div>
  );
}

function StatusHint({
  trigger,
  details,
  children,
}: {
  readonly trigger: ReactElement;
  readonly details: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex max-w-[min(25rem,calc(100vw-2rem))] flex-col gap-0.5 wrap-anywhere">
          {details.map((line, index) => (
            <span key={line} className={index === 0 ? "text-foreground" : "text-muted-foreground"}>
              {line}
            </span>
          ))}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

function ContextMeter({
  context,
  formats,
}: {
  readonly context: ContextWindowSnapshot | null;
  readonly formats: Formats;
}) {
  const gt = useGT();
  const used = context?.usedTokens ?? null;
  const max = context?.maxTokens != null && context.maxTokens > 0 ? context.maxTokens : null;
  const usedPercent =
    context?.usedPercentage ?? (used !== null && max !== null ? (used / max) * 100 : null);
  const bounded = usedPercent === null ? null : Math.min(100, Math.max(0, usedPercent));
  const label = gt("Context", { $context: "context window row label" });
  const tokens =
    used === null
      ? null
      : max === null
        ? formats.compact.format(used)
        : `${formats.compact.format(used)}/${formats.compact.format(max)}`;
  const percent = bounded === null ? null : formats.percent.format(bounded / 100);
  const detail =
    used === null
      ? null
      : max === null
        ? gt("{usedTokens} tokens used", { usedTokens: formats.number.format(used) })
        : gt("{used} of {max} tokens", {
            used: formats.number.format(used),
            max: formats.number.format(max),
          });
  const details = [label, detail, percent].filter((line) => line !== null);
  return (
    <StatusHint
      details={details}
      trigger={
        <span
          tabIndex={0}
          aria-label={details.join(" · ")}
          className="inline-flex items-center gap-1.5 rounded-md whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />
      }
    >
      <span>{label}</span>
      {bounded === null ? null : (
        <span aria-hidden className="h-1 w-7.5 overflow-hidden rounded-full bg-foreground/13">
          <span
            className={cn(
              "block h-full rounded-full",
              bounded >= 80 ? "bg-warning" : "bg-muted-foreground",
            )}
            style={{ width: `${bounded}%` }}
          />
        </span>
      )}
      {(tokens ?? percent) ? (
        <strong className="font-semibold text-foreground">{tokens ?? percent}</strong>
      ) : null}
      {tokens !== null && percent !== null ? <span>{percent}</span> : null}
    </StatusHint>
  );
}

function LastTurn({
  activity,
  formats,
}: {
  readonly activity: TurnActivity;
  readonly formats: Formats;
}) {
  const gt = useGT();
  const { count, tokens, cacheHit, cacheRead, cacheWrite } = activity;
  const latest = gt("Latest turn");
  const cacheReadLabel = gt("Cache read");
  const cacheWriteLabel = gt("Cache write");
  const metric = (label: string, value: number | null, format: Intl.NumberFormat) =>
    value === null ? null : gt("{label}: {value}", { label, value: format.format(value) });
  const tokenText =
    tokens === null ? null : gt("{used} tokens", { used: formats.compact.format(tokens) });
  const cacheText =
    cacheHit !== null
      ? gt("Cache {percent}", { percent: formats.percent.format(cacheHit) })
      : (metric(cacheReadLabel, cacheRead, formats.compact) ??
        metric(cacheWriteLabel, cacheWrite, formats.compact));
  const turnsText =
    count > 0 ? gt("{count, plural, one {{count} turn} other {{count} turns}}", { count }) : null;
  const details = [
    latest,
    tokens === null ? null : gt("{used} tokens", { used: formats.number.format(tokens) }),
    metric(cacheReadLabel, cacheRead, formats.number),
    metric(cacheWriteLabel, cacheWrite, formats.number),
    cacheHit === null
      ? null
      : gt("{label}: {value}", { label: gt("Cache hit"), value: formats.percent.format(cacheHit) }),
  ].filter((line) => line !== null);
  const values = [tokenText, cacheText].filter(Boolean).join(" · ");
  return (
    <StatusHint
      details={details}
      trigger={
        <span
          tabIndex={0}
          aria-label={[turnsText, ...details].filter(Boolean).join(" · ")}
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />
      }
    >
      {count > 0 ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />
      ) : null}
      <span>{turnsText ?? latest}</span>
      {values ? (
        <span className="min-w-0 truncate border-s border-border ps-1.5">{values}</span>
      ) : null}
    </StatusHint>
  );
}

function primaryWindows(current: readonly QuotaEntry[]): readonly QuotaEntry[] {
  const primary = [
    current.find((entry) => entry.kind === "session"),
    current.find((entry) => entry.kind === "weekly"),
  ].filter((entry) => entry !== undefined);
  for (const entry of current) {
    if (primary.length >= 2) break;
    if (!primary.includes(entry)) primary.push(entry);
  }
  return primary;
}

function QuotaSummary({
  quota,
  now,
  formats,
}: {
  readonly quota: ModelQuota;
  readonly now: number;
  readonly formats: Formats;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const { current, other } = quota;
  const title = gt("Usage limits");
  const primary = primaryWindows(current);
  const extra = current.length + other.length - primary.length;
  const detail = (entry: QuotaEntry) =>
    [
      quotaWindowLabel(entry, locale, m),
      entry.account,
      gt("{left}% left", { left: formats.number.format(entry.remaining) }),
      entry.resetWindow ? formatResetsIn(entry.resetWindow, now, m) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const details = [
    ...(current.length > 0 ? [] : [quota.notice ?? gt("Unavailable")]),
    ...current.map(detail),
    ...(other.length > 0 ? [gt("Other Models"), ...other.map(detail)] : []),
  ];
  return (
    <StatusHint
      details={details}
      trigger={
        <Link
          to="/usage"
          search={{ view: "limits" }}
          aria-label={[title, ...details].join(" · ")}
          className="ms-auto inline-flex items-center gap-2 rounded-md px-1 py-0.5 whitespace-nowrap text-inherit outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />
      }
    >
      {current.length === 0 ? (
        <span>{gt("{label}: {value}", { label: title, value: gt("Unavailable") })}</span>
      ) : (
        <>
          {primary.map((entry) => {
            const low = entry.remaining <= 10;
            return (
              <span key={entry.key} className="inline-flex items-center gap-1">
                <QuotaRing
                  remaining={entry.remaining}
                  className={
                    low ? "text-error" : entry.kind === "weekly" ? "text-warning" : "text-success"
                  }
                />
                {quotaWindowPeriod(entry, locale, m)}
                <strong
                  className={cn("font-semibold", low ? "text-error-foreground" : "text-foreground")}
                >
                  {formats.percent.format(entry.remaining / 100)}
                </strong>
              </span>
            );
          })}
          {extra > 0 ? <span>+{formats.number.format(extra)}</span> : null}
        </>
      )}
    </StatusHint>
  );
}

function QuotaRing({
  remaining,
  className,
}: {
  readonly remaining: number;
  readonly className: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("size-2.5 shrink-0 -rotate-90", className)}>
      <circle
        cx="6"
        cy="6"
        r="5"
        pathLength={100}
        fill="none"
        strokeWidth="2"
        className="stroke-foreground/15"
      />
      {remaining > 0 ? (
        <circle
          cx="6"
          cy="6"
          r="5"
          pathLength={100}
          fill="none"
          strokeWidth="2"
          stroke="currentColor"
          strokeDasharray={`${remaining} 100`}
        />
      ) : null}
    </svg>
  );
}
