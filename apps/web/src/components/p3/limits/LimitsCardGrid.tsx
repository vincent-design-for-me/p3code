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
import { T, Var, useGT, useMessages } from "gt-react";
import { TicketIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "../../../lib/utils";
import { ProviderInstanceIcon } from "../../chat/ProviderInstanceIcon";
import { providerClients } from "../../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../../settings/RedactedSensitiveText";
import { PopoverTrigger, type PopoverCreateHandle } from "../../ui/popover";
import { ResetCreditDialog, useResetCredit } from "../../usage/UsageLimits";
import {
  type LimitCard,
  type LimitCardEntry,
  type LimitCardSection,
  limitCardSections,
  meterColors,
  windowlessLimitAccounts,
} from "./limitsCards";
import "./limitsDial.css";

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

function LimitWindowButton({
  account,
  accountLabel,
  entry,
  now,
  primary,
  redeem,
  popover,
}: {
  readonly account: LimitAccount;
  readonly accountLabel: string;
  readonly entry: LimitCardEntry;
  readonly now: number;
  readonly primary: boolean;
  readonly redeem: Redeem;
  readonly popover: LimitPopover;
}) {
  const gt = useGT();
  const m = useMessages();
  const { window } = entry;
  const remaining = remainingPercent(window);
  const reset = formatResetsIn(window, now, m);
  const pace = paceRemainingPercent(window, now);
  const credits = primary ? (account.limits.resetCredits?.availableCount ?? 0) : 0;
  const resetLabel = reset ? (
    <span
      className={cn(
        "inline-flex flex-wrap items-baseline gap-1 leading-tight text-muted-foreground tabular-nums",
        primary
          ? "rounded-full border border-border bg-background px-1.5 py-1 text-2xs"
          : "max-w-[52%] shrink-0 text-3xs",
      )}
    >
      <span aria-hidden>↻</span>
      {reset}
    </span>
  ) : null;
  const title = <span className="wrap-anywhere">{entry.label}</span>;
  const ariaLabel = [
    accountLabel,
    gt("{label}: {remaining}% left", { label: entry.label, remaining }),
    reset,
    entry.description,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <PopoverTrigger
      handle={popover}
      payload={{ account, window, reset: entry.reset, redeem }}
      openOnHover
      render={
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "grid w-full min-w-0",
            windowSurface,
            primary
              ? "grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-foreground/6 bg-(--p3-limits-start)/4 px-2 py-2.5 @min-[43rem]/limits:gap-4.5 @min-[43rem]/limits:px-4"
              : "gap-1.5 rounded-lg border border-transparent px-1.5 py-2",
          )}
        />
      }
    >
      {primary ? (
        <>
          <span
            data-p3-limits-dial
            className="flex aspect-square w-22 @min-[43rem]/limits:w-28 flex-col items-center justify-center pb-0.5 whitespace-nowrap tabular-nums"
            style={{ "--p3-limits-sweep": `${remaining * 2.7}deg` } as CSSProperties}
          >
            <strong className="text-xl leading-tight font-semibold tracking-tighter @min-[43rem]/limits:text-2xl">
              {remaining}%
            </strong>
            <span className="mt-0.5 text-3xs text-muted-foreground">
              <T context="remaining usage percentage">left</T>
            </span>
          </span>
          <span className="grid min-w-0 content-center justify-items-start gap-1.5">
            <span className="text-sm leading-tight font-semibold">{title}</span>
            {resetLabel}
            {credits ? (
              <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                <TicketIcon className="size-3.5" aria-hidden />
                {gt(
                  "{count, plural, one {{count} reset credit banked} other {{count} reset credits banked}}",
                  { count: credits },
                )}
              </span>
            ) : null}
          </span>
        </>
      ) : (
        <>
          <span className="flex items-baseline justify-between gap-2 text-xs">
            {title}
            <strong className="font-semibold whitespace-nowrap tabular-nums">{remaining}%</strong>
          </span>
          <span className="flex items-center justify-between gap-2 text-xs">
            <span
              aria-hidden
              className="relative block h-1.25 min-w-4 flex-auto rounded-full bg-foreground/10"
            >
              <span
                className="block h-full rounded-full bg-linear-to-r from-(--p3-limits-start) to-(--p3-limits-end)"
                style={{ width: `${remaining}%` }}
              />
              {pace === null ? null : (
                <span
                  className="absolute -top-0.5 h-[calc(100%+4px)] w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-1 ring-background"
                  style={{ left: `${pace}%` }}
                />
              )}
            </span>
            {resetLabel}
          </span>
        </>
      )}
    </PopoverTrigger>
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
  const { account, primary, rest } = card;
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
  return (
    <article
      className="h-full min-w-0 rounded-3xl border border-border/80 bg-background bg-linear-to-bl from-(--p3-limits-start)/8 to-transparent to-60% p-3.75 shadow-xs/5"
      style={{ "--p3-limits-start": start, "--p3-limits-end": end } as CSSProperties}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1">
        <h3 className="min-w-0 text-sm font-semibold wrap-anywhere text-foreground">
          <AccountHeading account={account} generic={generic} named={named} />
        </h3>
        {meta ? <span className="text-2xs wrap-anywhere text-muted-foreground">{meta}</span> : null}
      </header>
      {primary ? (
        <LimitWindowButton
          account={account}
          accountLabel={accountLabel}
          entry={primary}
          now={now}
          primary
          redeem={redeem}
          popover={popover}
        />
      ) : (
        <p className="min-h-20 rounded-2xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          {limitsNotice(account.limits, m) ?? gt("No limits reported.")}
        </p>
      )}
      {rest.length > 0 ? (
        <div className="mt-2 flex flex-col gap-0.5">
          {rest.map((entry) => (
            <LimitWindowButton
              key={entry.key}
              account={account}
              accountLabel={accountLabel}
              entry={entry}
              now={now}
              primary={false}
              redeem={redeem}
              popover={popover}
            />
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
        <ProviderInstanceIcon
          driverKind={section.driver}
          displayName={label}
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
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
