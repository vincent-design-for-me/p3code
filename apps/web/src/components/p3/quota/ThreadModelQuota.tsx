import { formatResetsIn } from "@t3tools/shared/usageLimitsCopy";
import { Link } from "@tanstack/react-router";
import { useGT, useLocale, useMessages } from "gt-react";

import { useNowMinute } from "../../../hooks/useNowMinute";
import { cn } from "../../../lib/utils";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { ThreadDetailsSection } from "../../chat/ThreadDetailsSection";
import type { ThreadDetailsUsageInput } from "../../chat/ThreadDetailsUsage";
import { type QuotaEntry, resolveModelQuota } from "./modelQuota";
import { quotaWindowLabel } from "./modelQuotaWindows";

const SEGMENTS = Array.from({ length: 20 }, (_, index) => index);

/** The thread details Usage section: the selected model's quota windows, then the account's others. */
export function ThreadModelQuota({
  providerInstanceId,
  model,
  providers = [],
  sources = [],
}: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const provider = providers.find((candidate) => candidate.instanceId === providerInstanceId);
  if (!provider) return null;
  const { current, other, notice } = resolveModelQuota(provider, model, providers, sources, now, m);
  const title = gt("Usage limits");
  const modelName =
    (model && provider.models.find((candidate) => candidate.slug === model)?.name) || model;
  const accountName = provider.displayName?.trim() || provider.instanceId;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const reset = (entry: QuotaEntry) =>
    entry.resetWindow ? formatResetsIn(entry.resetWindow, now, m) : null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title={title}
      showHeading={false}
    >
      <div role="group" aria-label={title} className="grid min-w-0 gap-2 px-1 text-xs tabular-nums">
        <Link
          to="/usage"
          search={{ view: "limits" }}
          className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:hover:bg-white/[0.08]"
        >
          <ProviderInstanceIcon
            driverKind={provider.driver}
            displayName={accountName}
            accentColor={provider.accentColor}
            badgeContent="none"
            className="size-5"
            iconClassName="size-4"
          />
          <span className="grid min-w-0 gap-0.5 leading-tight">
            <strong className="truncate font-medium text-foreground">{modelName || title}</strong>
            <span className="truncate text-2xs text-muted-foreground">
              {[accountName, provider.auth.label].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
        {current.length > 0 ? (
          current.map((entry) => (
            <QuotaWindowCard
              key={entry.key}
              entry={entry}
              name={[quotaWindowLabel(entry, locale, m), entry.account].filter(Boolean).join(" · ")}
              amount={percent.format(entry.remaining / 100)}
              reset={reset(entry)}
            />
          ))
        ) : (
          <p className="grid gap-0.5 px-1.5 text-2xs text-muted-foreground">
            <span>{gt("Usage limits are unavailable for this provider")}</span>
            {notice ? <span className="text-muted-foreground/80">{notice}</span> : null}
          </p>
        )}
        {other.length > 0 ? (
          <div className="grid gap-1 border-t border-border px-1.5 pt-2">
            <div className="text-2xs text-muted-foreground">{gt("Other Models")}</div>
            {other.map((entry) => {
              const name = quotaWindowLabel(entry, locale, m);
              const resetLabel = reset(entry);
              return (
                <Tooltip key={entry.key}>
                  <TooltipTrigger
                    render={
                      <div
                        tabIndex={0}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(2rem,26%)_2.4rem] items-center gap-1.5 rounded-sm text-2xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      />
                    }
                  >
                    <span className="truncate">{name}</span>
                    <span aria-hidden className="h-0.5 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-muted-foreground"
                        style={{ width: `${entry.remaining}%` }}
                      />
                    </span>
                    <strong className="text-end font-semibold">
                      {percent.format(entry.remaining / 100)}
                    </strong>
                  </TooltipTrigger>
                  <TooltipPopup side="left" sideOffset={16}>
                    {[name, resetLabel].filter(Boolean).join(" · ")}
                  </TooltipPopup>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}

function QuotaWindowCard({
  entry,
  name,
  amount,
  reset,
}: {
  readonly entry: QuotaEntry;
  readonly name: string;
  readonly amount: string;
  readonly reset: string | null;
}) {
  const gt = useGT();
  const { remaining, pace } = entry;
  const accent =
    remaining <= 10 ? "bg-error" : entry.kind === "weekly" ? "bg-warning" : "bg-success";
  const details = [
    gt("{label}: {left}% left", { label: name, left: remaining }),
    pace === null
      ? null
      : `${gt("Even pace")} · ${gt("{timeLeft}% of the window left", { timeLeft: pace })}`,
    reset,
  ].filter((line) => line !== null);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            className="grid min-w-0 gap-1.5 rounded-lg border border-border/75 bg-muted/50 px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 leading-tight">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full border-2",
              remaining <= 10
                ? "border-error"
                : entry.kind === "weekly"
                  ? "border-warning"
                  : "border-success",
            )}
          />
          <span className="truncate">{name}</span>
          <strong className="text-sm font-semibold">{amount}</strong>
        </div>
        <div
          role="progressbar"
          aria-label={name}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={remaining}
          aria-valuetext={gt("{left}% left", { left: remaining })}
          className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5"
        >
          {SEGMENTS.map((index) => (
            <span key={index} className="h-1.5 overflow-hidden rounded-xs bg-foreground/13">
              <span
                className={cn("block h-full", accent)}
                style={{ width: `${Math.max(0, Math.min(100, remaining * 20 - index * 100))}%` }}
              />
            </span>
          ))}
        </div>
        {pace === null ? null : (
          <div
            role="img"
            aria-label={gt("{timeLeft}% of the window left", { timeLeft: pace })}
            className="relative my-0.5 h-px bg-border"
          >
            <span
              className="absolute -top-0.5 h-[5px] w-px -translate-x-1/2 bg-muted-foreground"
              style={{ left: `${pace}%` }}
            />
          </div>
        )}
        {reset ? <div className="text-2xs text-muted-foreground">{reset}</div> : null}
      </TooltipTrigger>
      <TooltipPopup side="left" sideOffset={16}>
        <div className="flex flex-col gap-0.5">
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
