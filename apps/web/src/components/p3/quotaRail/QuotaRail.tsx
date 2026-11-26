import "./quotaRail.css";

import { useAtomValue } from "@effect/atom-react";
import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { paceRemainingPercent, remainingPercent } from "@t3tools/shared/usageLimits";
import { formatDuration, formatResetsIn } from "@t3tools/shared/usageLimitsCopy";
import { useLocation } from "@tanstack/react-router";
import { T, useGT, useLocale, useMessages } from "gt-react";
import { XIcon } from "lucide-react";
import { type CSSProperties, type UIEvent, useLayoutEffect, useRef, useState } from "react";

import { useNowMinute } from "../../../hooks/useNowMinute";
import { observeResize } from "../../../lib/observeResize";
import { environmentPresentations } from "../../../state/presentation";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { isSidebarUtilityPage } from "../../sidebar/mainAppLocation";
import { quotaWindowLabel } from "../quota/modelQuotaWindows";
import { Button } from "../../ui/button";
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "../../ui/popover";
import { useSidebar } from "../../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import {
  collectQuotaRailGroups,
  isForecastAlert,
  isWeeklyWindow,
  primaryQuota,
  QUOTA_NOTCH_GRADIENT,
  type QuotaRailAccount,
  type QuotaRailGroup,
  quotaForecast,
  quotaNotchPath,
} from "./quotaRailModel";
import { useThreadDetailsOnScreen } from "./threadDetailsVisibility";

const NOTCH_CURVE = 22;
const NOTCH_RADIUS = 18;
const SCROLLBAR_LINGER_MS = 550;
const MISSING_MARK = "–";

/** Provider usage limits docked to the right window edge of the main app. */
export function QuotaRail() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const pathname = useLocation({ select: (location) => location.pathname });
  const { isMobile } = useSidebar();
  if (isMobile || isSidebarUtilityPage(pathname)) return null;
  const groups = collectQuotaRailGroups(presentations);
  if (groups.length === 0) return null;
  return <QuotaRailDock groups={groups} pathname={pathname} />;
}

function useQuotaFormat() {
  const m = useMessages();
  const locale = useLocale();
  const nowMinute = useNowMinute();
  const number = new Intl.NumberFormat(locale);
  const percentFormat = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  return {
    m,
    number,
    now: Date.parse(`${nowMinute}:00Z`),
    percent: (value: number) => percentFormat.format(value / 100),
    windowName: (window: ServerProviderUsageWindow) => quotaWindowLabel(window, locale, m),
  };
}

type QuotaFormat = ReturnType<typeof useQuotaFormat>;

function QuotaRailDock({
  groups,
  pathname,
}: {
  readonly groups: readonly QuotaRailGroup[];
  readonly pathname: string;
}) {
  const gt = useGT();
  const format = useQuotaFormat();
  // Remembering the route a popover opened on closes it on navigation without an effect.
  const [selection, setSelection] = useState<{
    readonly driver: string;
    readonly pathname: string;
  } | null>(null);
  // The thread details card already lists the model's limits, so the rail steps aside.
  const detailsOpen = useThreadDetailsOnScreen((state) => state.count > 0);
  const openDriver = selection?.pathname === pathname && !detailsOpen ? selection.driver : null;
  const [playing, setPlaying] = useState(false);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const scrollTimer = useRef<number | null>(null);

  const play = () => {
    if (!playing) setPlaying(true);
  };
  const showScrollbar = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    target.toggleAttribute("data-scrolling", true);
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      scrollTimer.current = null;
      target.toggleAttribute("data-scrolling", false);
    }, SCROLLBAR_LINGER_MS);
  };

  return (
    <aside
      className="flex min-h-0 flex-col justify-center self-stretch bg-background"
      style={
        {
          "--p3-quota-curve": `${NOTCH_CURVE}px`,
          "--p3-quota-radius": `${NOTCH_RADIUS}px`,
        } as CSSProperties
      }
      aria-label={gt("Usage limits")}
      data-p3-quota-rail=""
      data-details-open={detailsOpen || undefined}
      data-playing={playing || undefined}
      onPointerEnter={play}
      onFocus={play}
      onAnimationEnd={(event) => {
        if (event.animationName === "p3-quota-notch-flow") setPlaying(false);
      }}
    >
      <div data-p3-quota-dock="" ref={setDock}>
        <QuotaNotch dock={dock} playing={playing} />
        <div
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[inherit] px-0.5 py-1"
          data-p3-quota-scroll=""
          onScroll={showScrollbar}
        >
          {groups.map((group, order) => (
            <QuotaProviderButton
              key={group.driver}
              group={group}
              order={order}
              format={format}
              open={openDriver === group.driver}
              onOpenChange={(open) =>
                setSelection((current) =>
                  open
                    ? { driver: group.driver, pathname }
                    : current?.driver === group.driver
                      ? null
                      : current,
                )
              }
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function QuotaNotch({
  dock,
  playing,
}: {
  readonly dock: HTMLDivElement | null;
  readonly playing: boolean;
}) {
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(
    null,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the dock DOM size before paint to draw its outline, and remeasures through a ResizeObserver
  useLayoutEffect(() => {
    if (!dock) return;
    const measure = () => {
      const width = dock.offsetWidth;
      const height = dock.offsetHeight;
      setSize((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
    };
    measure();
    return observeResize(dock, measure);
  }, [dock]);
  if (!size || size.height === 0) return null;

  const path = quotaNotchPath({ ...size, curve: NOTCH_CURVE, radius: NOTCH_RADIUS });
  const height = size.height + 2 * NOTCH_CURVE;
  const comet = (["tail", "body", "head"] as const).map((part) => (
    <path key={part} data-part={part} d={path} pathLength={100} />
  ));
  return (
    <svg
      data-p3-quota-notch=""
      aria-hidden
      width={size.width}
      height={height}
      style={{ top: -NOTCH_CURVE }}
    >
      <defs>
        <linearGradient
          id="p3-quota-notch-tone"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={height}
        >
          <stop offset="0%" stopColor={QUOTA_NOTCH_GRADIENT[0]} />
          <stop offset="50%" stopColor={QUOTA_NOTCH_GRADIENT[1]} />
          <stop offset="100%" stopColor={QUOTA_NOTCH_GRADIENT[2]} />
        </linearGradient>
      </defs>
      <path data-p3-quota-notch-track="" d={path} />
      {playing ? (
        <>
          <g data-p3-quota-comet="halo" stroke="url(#p3-quota-notch-tone)">
            {comet}
          </g>
          <g data-p3-quota-comet="light" stroke="url(#p3-quota-notch-tone)">
            {comet}
          </g>
        </>
      ) : null}
    </svg>
  );
}

function quotaAccountName(
  account: QuotaRailAccount,
  group: QuotaRailGroup,
  index: number,
  format: QuotaFormat,
): string {
  if (account.displayName && account.displayName !== group.name) return account.displayName;
  return group.accounts.length > 1
    ? `${group.name} ${format.number.format(index + 1)}`
    : group.name;
}

function QuotaProviderButton({
  group,
  order,
  format,
  open,
  onOpenChange,
}: {
  readonly group: QuotaRailGroup;
  readonly order: number;
  readonly format: QuotaFormat;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const { m, now, number, percent } = format;
  const primary = primaryQuota(group.accounts);
  const remaining = primary?.remaining ?? null;
  // A changed value remounts the ring, which replays its one-shot animation.
  const [flash, setFlash] = useState({ remaining, count: 0, active: false });
  if (flash.remaining !== remaining) {
    setFlash({ remaining, count: flash.count + 1, active: true });
  }

  const multi = group.accounts.length > 1;
  const summaries = group.accounts.map((account, index) => {
    const window = account.windows[0];
    return {
      account,
      index,
      name: quotaAccountName(account, group, index, format),
      window,
      remaining: window ? remainingPercent(window) : null,
    };
  });
  const reset = (window: ServerProviderUsageWindow) => formatResetsIn(window, now, m, "refill");
  const unavailable = gt("Weekly limit unavailable");
  const weeklyLines = summaries.flatMap((item) => {
    const weekly = item.account.windows.filter(isWeeklyWindow);
    if (weekly.length === 0) return multi ? [`${item.name} · ${unavailable}`] : [];
    return weekly.map((window) =>
      [
        multi ? item.name : null,
        format.windowName(window),
        gt("{left}% left", { left: number.format(remainingPercent(window)) }),
        reset(window),
      ]
        .filter(Boolean)
        .join(" · "),
    );
  });
  const accessibleName = [
    group.name,
    ...summaries.map((item) =>
      [
        multi ? item.name : null,
        item.window ? format.windowName(item.window) : gt("Unavailable"),
        item.remaining === null ? null : percent(item.remaining),
        item.window ? reset(item.window) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  ].join(", ");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={accessibleName}
                  className="grid min-w-0 shrink-0 cursor-pointer content-center place-items-center gap-1.5 border border-transparent text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  data-p3-quota-button=""
                  style={
                    {
                      "--p3-quota-color": group.color,
                      "--p3-quota-value": `${remaining ?? 0}%`,
                      "--p3-quota-order": order,
                    } as CSSProperties
                  }
                  data-provider={group.driver}
                  data-empty={remaining === null || undefined}
                />
              }
            />
          }
        >
          <span
            className="relative grid size-8.5 place-items-center rounded-full"
            data-p3-quota-dial=""
            aria-hidden
          >
            <span
              key={flash.count}
              data-p3-quota-ring=""
              data-flash={flash.active || undefined}
              onAnimationEnd={(event) => {
                if (event.animationName === "p3-quota-halo" && flash.active) {
                  setFlash({ ...flash, active: false });
                }
              }}
            />
            <ProviderInstanceIcon
              driverKind={group.driver}
              displayName={group.name}
              badgeContent="none"
              indicatorBackground="var(--background)"
              className="size-5"
              iconClassName="size-4"
            />
          </span>
          {summaries.map((item) => (
            <span
              key={item.account.key}
              className="flex min-w-0 max-w-full items-baseline gap-1 text-xs leading-none [&+&]:mt-0.5 [&+&]:border-t [&+&]:pt-1"
              data-p3-quota-summary=""
            >
              {multi ? (
                <small className="text-3xs font-medium text-muted-foreground">
                  {number.format(item.index + 1)}
                </small>
              ) : null}
              {item.remaining === null ? MISSING_MARK : percent(item.remaining)}
            </span>
          ))}
        </TooltipTrigger>
        <TooltipPopup side="left" align="center">
          {(weeklyLines.length > 0 ? weeklyLines : [unavailable]).map((line, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- lines are plain text rebuilt each render
            <div key={index}>{line}</div>
          ))}
        </TooltipPopup>
      </Tooltip>
      <PopoverPopup side="left" align="center" sideOffset={10} padding="none" width="md">
        <QuotaBreakdown group={group} format={format} />
      </PopoverPopup>
    </Popover>
  );
}

function QuotaBreakdown({
  group,
  format,
}: {
  readonly group: QuotaRailGroup;
  readonly format: QuotaFormat;
}) {
  const gt = useGT();
  const { number } = format;
  return (
    <div
      className="flex max-h-[min(31rem,calc(100dvh-2rem))] flex-col text-xs"
      data-p3-quota-breakdown=""
      style={{ "--p3-quota-color": group.color } as CSSProperties}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <ProviderInstanceIcon
          driverKind={group.driver}
          displayName={group.name}
          badgeContent="none"
          indicatorBackground="var(--popover)"
          className="size-5"
          iconClassName="size-4"
        />
        <div className="min-w-0 flex-1">
          <PopoverTitle>{group.name}</PopoverTitle>
        </div>
        <PopoverClose
          render={<Button type="button" variant="ghost" size="icon-xs" aria-label={gt("Close")} />}
        >
          <XIcon />
        </PopoverClose>
      </header>
      <div className="min-h-0 overflow-auto overscroll-contain p-3">
        {group.accounts.map((account, index) => {
          const name = quotaAccountName(account, group, index, format);
          const source = [account.plan, account.environment].filter(Boolean).join(" · ");
          const credits = account.limits?.resetCredits?.availableCount;
          return (
            <section
              key={account.key}
              aria-label={name}
              className="grid gap-2 [&+&]:mt-3 [&+&]:border-t [&+&]:pt-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 wrap-anywhere">
                <strong className="font-semibold">{name}</strong>
                {source ? <span className="text-2xs text-muted-foreground">{source}</span> : null}
              </div>
              {account.windows.length > 0 ? (
                account.windows.map((window) => (
                  <QuotaWindowRow
                    key={`${window.kind}:${window.id}`}
                    window={window}
                    checkedAt={account.limits?.checkedAt}
                    format={format}
                  />
                ))
              ) : (
                <p className="text-2xs text-muted-foreground">
                  {account.limits?.unavailable?.message ?? gt("No limits reported.")}
                </p>
              )}
              {credits !== undefined ? (
                <div className="flex items-baseline justify-between gap-2 px-2 text-muted-foreground">
                  <T>Reset credits</T>
                  <strong className="tabular-nums">{number.format(credits)}</strong>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function QuotaWindowRow({
  window,
  checkedAt,
  format,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly checkedAt: string | undefined;
  readonly format: QuotaFormat;
}) {
  const gt = useGT();
  const { m, now, number, percent, windowName } = format;
  const name = windowName(window);
  const remaining = remainingPercent(window);
  const pace = paceRemainingPercent(window, now);
  const reset = formatResetsIn(window, now, m, "refill");
  const forecast = quotaForecast(window, checkedAt, now);
  const forecastText =
    forecast.kind === "limitReached"
      ? gt("Limit reached")
      : forecast.kind === "emptyIn"
        ? gt("Est. empty in {time}", { time: formatDuration(forecast.ms, m) })
        : forecast.kind === "beforeReset"
          ? gt("May run out before reset")
          : forecast.kind === "atReset"
            ? gt("Est. {percent} left at reset", { percent: percent(forecast.remaining) })
            : gt("Forecast unavailable");

  return (
    <div className="grid gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2 py-2 tabular-nums">
      <div className="flex items-baseline justify-between gap-2">
        <span>{name}</span>
        <strong className="shrink-0">{percent(remaining)}</strong>
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remaining}
        aria-valuetext={gt("{left}% left", { left: number.format(remaining) })}
        className="relative h-1 rounded-full"
        data-p3-quota-track=""
      >
        <span
          className="block h-full rounded-[inherit] bg-(--p3-quota-color)"
          style={{ width: `${remaining}%` }}
        />
        {pace === null ? null : (
          <span
            className="absolute -inset-y-0.5 w-px bg-foreground opacity-60"
            style={{ left: `${pace}%` }}
          />
        )}
      </div>
      <div
        className="flex items-baseline justify-between gap-2 leading-tight text-muted-foreground"
        data-p3-quota-window-meta=""
      >
        <span className="shrink-0">{reset ?? MISSING_MARK}</span>
        <span
          className="text-end data-alert:text-warning-foreground"
          data-alert={isForecastAlert(forecast) || undefined}
        >
          {forecastText}
        </span>
      </div>
    </div>
  );
}
