import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { normalizeProviderAccentColor } from "@t3tools/client-runtime/state/provider-instance-display";
import {
  type LimitAccount,
  type LimitPool,
  type LimitPoolWindow,
  type LimitPresentations,
  paceRemainingPercent,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { formatDuration, formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { T, Var, useGT, useLocale, useMessages } from "gt-react";
import { TicketIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "../../../lib/utils";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { providerClients } from "../../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../../settings/RedactedSensitiveText";
import { PopoverTrigger, type PopoverCreateHandle } from "../../ui/popover";
import { ResetCreditDialog, useResetCredit } from "../../usage/UsageLimits";
import { quotaWindowLabel } from "../quota/modelQuotaWindows";
import {
  type LimitCard,
  type LimitCardEntry,
  type LimitCardSection,
  limitCardSections,
  meterColors,
  windowlessLimitAccounts,
} from "./limitsCards";
import "./limitsMeter.css";

/** Mirrors the pooled view's segment payload so both share its one popover. */
interface LimitCardPayload {
  readonly account: LimitAccount;
  readonly window: ServerProviderUsageWindow;
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly redeem: ReturnType<typeof useResetCredit> | null;
}

type LimitPopover = ReturnType<typeof PopoverCreateHandle<LimitCardPayload>>;
type Redeem = ReturnType<typeof useResetCredit> | null;

const windowSurface =
  "cursor-pointer text-start text-foreground outline-none transition-colors motion-reduce:transition-none hover:bg-(--p3-limits-start)/9 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-(--p3-limits-start)/9";

interface WindowProps {
  readonly account: LimitAccount;
  readonly accountLabel: string;
  readonly entry: LimitCardEntry;
  readonly now: number;
  readonly redeem: Redeem;
  readonly popover: LimitPopover;
}

/** Each window opens the pooled view's popover, which holds the details and the reset redeem. */
function LimitWindowTrigger({
  account,
  accountLabel,
  entry,
  now,
  redeem,
  popover,
  className,
  children,
}: WindowProps & { readonly className: string; readonly children: ReactNode }) {
  const gt = useGT();
  const m = useMessages();
  const ariaLabel = [
    accountLabel,
    gt("{label}: {remaining}% left", {
      label: entry.label,
      remaining: remainingPercent(entry.window),
    }),
    formatResetsIn(entry.window, now, m),
    entry.description,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <PopoverTrigger
      handle={popover}
      payload={{ account, window: entry.window, reset: entry.reset, redeem }}
      openOnHover
      render={
        <button type="button" aria-label={ariaLabel} className={cn(windowSurface, className)} />
      }
    >
      {children}
    </PopoverTrigger>
  );
}

/** The thick, glossy meter; its sheen crosses once when the card is hovered (limitsMeter.css). */
function LimitMeter({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const remaining = remainingPercent(window);
  const pace = paceRemainingPercent(window, now);
  return (
    <span aria-hidden className="relative block h-2.5 w-full rounded-full bg-foreground/8">
      <span
        data-p3-limits-meter
        className="block h-full min-w-2.5 rounded-full"
        style={{ width: `${remaining}%` }}
      />
      {pace === null ? null : (
        <span
          className="absolute -top-1 h-[calc(100%+8px)] w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-1 ring-background"
          style={{ left: `${pace}%` }}
        />
      )}
    </span>
  );
}

function FiveHourChip(props: WindowProps) {
  const locale = useLocale();
  const m = useMessages();
  const { window } = props.entry;
  const remaining = remainingPercent(window);
  const resetMs = window.resetsAt ? Date.parse(window.resetsAt) - props.now : 0;
  return (
    <LimitWindowTrigger
      {...props}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background py-1 ps-1 pe-2.5 text-xs"
    >
      <span
        aria-hidden
        data-p3-limits-ring
        className="size-4.5 shrink-0"
        style={{ "--p3-limits-sweep": `${remaining * 3.6}deg` } as CSSProperties}
      />
      <span className="min-w-0 truncate text-muted-foreground">
        {quotaWindowLabel(window, locale, m)}
      </span>
      <strong className="font-semibold tabular-nums">{remaining}%</strong>
      {resetMs > 0 ? (
        <span className="text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          ↻ {formatDuration(resetMs, m)}
        </span>
      ) : null}
    </LimitWindowTrigger>
  );
}

function MainMeter(props: WindowProps) {
  const locale = useLocale();
  const m = useMessages();
  const { window } = props.entry;
  const reset = formatResetsIn(window, props.now, m);
  return (
    <LimitWindowTrigger
      {...props}
      className="-mx-2 grid w-[calc(100%+1rem)] gap-2.5 rounded-xl px-2 pt-2.5 pb-2"
    >
      <LimitMeter window={window} now={props.now} />
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 wrap-anywhere">
          <span className="font-medium">{quotaWindowLabel(window, locale, m)}</span>
          {reset ? <span className="text-muted-foreground tabular-nums"> · ↻ {reset}</span> : null}
        </span>
        <strong className="text-sm font-semibold tabular-nums">{remainingPercent(window)}%</strong>
      </span>
    </LimitWindowTrigger>
  );
}

function SecondaryRow(props: WindowProps) {
  const locale = useLocale();
  const m = useMessages();
  const { window } = props.entry;
  const reset = formatResetsIn(window, props.now, m);
  return (
    <LimitWindowTrigger
      {...props}
      className="-mx-2 grid w-[calc(100%+1rem)] gap-1.5 rounded-lg px-2 py-1.5"
    >
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 wrap-anywhere">{quotaWindowLabel(window, locale, m)}</span>
        <strong className="font-semibold whitespace-nowrap tabular-nums">
          {remainingPercent(window)}%
        </strong>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span aria-hidden className="block h-1.5 min-w-4 flex-auto rounded-full bg-foreground/8">
          <span
            className="block h-full rounded-full bg-linear-to-r from-(--p3-limits-start) to-(--p3-limits-end)"
            style={{ width: `${remainingPercent(window)}%` }}
          />
        </span>
        {reset ? (
          <span className="max-w-[55%] shrink-0 text-3xs text-muted-foreground tabular-nums">
            ↻ {reset}
          </span>
        ) : null}
      </span>
    </LimitWindowTrigger>
  );
}

function AccountHeading({
  account,
  generic,
  named,
}: {
  readonly account: LimitAccount;
  readonly generic: string;
  readonly named: boolean;
}) {
  const gt = useGT();
  if (named) return account.displayName;
  if (account.email) {
    return (
      <RedactedSensitiveText
        value={account.email}
        ariaLabel={gt("Toggle account email visibility")}
        revealTooltip={gt("Click to reveal email")}
        hideTooltip={gt("Click to hide email")}
        className="text-xs"
      />
    );
  }
  return generic;
}

function LimitAccountCard({
  card,
  now,
  showEnvironment,
  popover,
  redeem,
}: {
  readonly card: LimitCard;
  readonly now: number;
  readonly showEnvironment: boolean;
  readonly popover: LimitPopover;
  readonly redeem: Redeem;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const { account, chips, main, rest } = card;
  const [start, end] = meterColors(
    account.driver,
    normalizeProviderAccentColor(account.accentColor),
  );
  const scope = showEnvironment
    ? account.environments.map((environment) => environment.label).join(", ")
    : null;
  const meta = [account.plan, scope || account.sourceLabel].filter(Boolean).join(" · ");
  const providerName = providerClients.get(account.driver)?.label ?? String(account.driver);
  const generic =
    card.number === null ? gt("Account") : gt("Account {number}", { number: card.number });
  const named = Boolean(account.displayName) && account.displayName !== providerName;
  const accountLabel = named && account.displayName ? account.displayName : generic;
  const resetsAt = main?.window.resetsAt;
  const resetDate = resetsAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(Date.parse(resetsAt))
    : null;
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  const creditsLabel = gt(
    "{count, plural, one {{count} reset credit banked} other {{count} reset credits banked}}",
    { count: credits },
  );
  const windowProps = { account, accountLabel, now, redeem, popover };
  return (
    <article
      className="group/limit-card h-full min-w-0 rounded-3xl border border-border/70 bg-background p-5 shadow-xs/5"
      style={{ "--p3-limits-start": start, "--p3-limits-end": end } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 className="min-w-0 text-base leading-tight font-semibold wrap-anywhere text-foreground">
            <AccountHeading account={account} generic={generic} named={named} />
          </h3>
          {resetDate || meta ? (
            <p className="text-xs wrap-anywhere text-muted-foreground tabular-nums">
              {resetDate
                ? main?.window.kind === "weekly"
                  ? gt("Weekly reset: {date}", { date: resetDate })
                  : gt("Resets {date}", { date: resetDate })
                : null}
              {resetDate && meta ? " · " : null}
              {meta}
            </p>
          ) : null}
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--p3-limits-start)/10">
          <ProviderInstanceIcon
            driverKind={account.driver}
            displayName={providerName}
            indicatorBackground="var(--background)"
            className="size-6"
            iconClassName="size-5 text-foreground/85"
          />
        </span>
      </header>
      {chips.length > 0 || credits > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {chips.map((entry) => (
            <FiveHourChip key={entry.key} entry={entry} {...windowProps} />
          ))}
          {credits > 0 ? (
            <span className="ms-auto inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <TicketIcon className="size-3.5" aria-hidden />
              {creditsLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {main ? (
        <div className="mt-3">
          <MainMeter entry={main} {...windowProps} />
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          {limitsNotice(account.limits, m) ?? gt("No limits reported.")}
        </p>
      )}
      {rest.length > 0 ? (
        <div className="mt-1.5 flex flex-col border-t border-border/60 pt-1.5">
          {rest.map((entry) => (
            <SecondaryRow key={entry.key} entry={entry} {...windowProps} />
          ))}
        </div>
      ) : null}
      {account.limits.zeroSpendCap ? (
        <p className="mt-2 text-2xs text-muted-foreground">{gt("$0 cap")}</p>
      ) : null}
      {redeem?.busy || redeem?.status ? (
        <p role="status" className="mt-2 text-2xs wrap-anywhere text-muted-foreground">
          {redeem.busy ? gt("Using reset credit…") : redeem.status}
        </p>
      ) : null}
    </article>
  );
}

/** The confirm is a sibling of the card, outside the shared popover, which stacks above dialogs. */
function RedeemableAccountCard({
  redeemAt,
  ...props
}: Omit<Parameters<typeof LimitAccountCard>[0], "redeem"> & {
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
}) {
  const redeem = useResetCredit(redeemAt.environmentId);
  return (
    <>
      <LimitAccountCard {...props} redeem={redeem} />
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={redeem.setConfirming}
        choice={redeem.choice}
        onConfirm={() => void redeem.redeem()}
        disabled={!redeem.canManageProviders}
      />
    </>
  );
}

function LimitProviderSection({
  section,
  now,
  showEnvironment,
  popover,
}: {
  readonly section: LimitCardSection;
  readonly now: number;
  readonly showEnvironment: boolean;
  readonly popover: LimitPopover;
}) {
  const m = useMessages();
  const label = providerClients.get(section.driver)?.label ?? String(section.driver);
  const wide = section.cards.length > 1;
  const { nextRefill } = section;
  return (
    <section className={cn("min-w-0", wide && "col-span-full")}>
      <h2 className="ms-0.5 mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
        {label}
        {nextRefill ? (
          <span className="ms-auto text-xs font-normal text-muted-foreground tabular-nums">
            <T context="usage limit refill">
              <span className="font-medium text-foreground">
                ↻ +<Var>{nextRefill.restoresPercent}</Var>%
              </span>{" "}
              in <Var>{formatDuration(nextRefill.at - now, m)}</Var>
            </T>
          </span>
        ) : null}
      </h2>
      <div className={cn("grid grid-cols-1 gap-4", wide && "@min-[43rem]/limits:grid-cols-2")}>
        {section.cards.map((card) =>
          card.account.redeem ? (
            <RedeemableAccountCard
              key={card.account.key}
              redeemAt={card.account.redeem}
              card={card}
              now={now}
              showEnvironment={showEnvironment}
              popover={popover}
            />
          ) : (
            <LimitAccountCard
              key={card.account.key}
              card={card}
              now={now}
              showEnvironment={showEnvironment}
              popover={popover}
              redeem={null}
            />
          ),
        )}
      </div>
    </section>
  );
}

/** P3 Limits dashboard: one card per account, grouped by provider, two columns when wide. */
export function LimitsCardGrid({
  pools,
  presentations,
  now,
  popover,
}: {
  readonly pools: readonly LimitPool[];
  readonly presentations: LimitPresentations;
  readonly now: number;
  readonly popover: LimitPopover;
}) {
  const m = useMessages();
  const windowless = windowlessLimitAccounts(
    presentations,
    pools.flatMap((pool) => pool.accounts),
  );
  const sections = limitCardSections(pools, windowless, now, m);
  if (sections.length === 0) return null;
  return (
    <div className="@container/limits">
      <div className="grid grid-cols-1 items-start gap-x-4.5 gap-y-6 @min-[43rem]/limits:grid-cols-2">
        {sections.map((section) => (
          <LimitProviderSection
            key={section.driver}
            section={section}
            now={now}
            showEnvironment={presentations.size > 1}
            popover={popover}
          />
        ))}
      </div>
    </div>
  );
}
