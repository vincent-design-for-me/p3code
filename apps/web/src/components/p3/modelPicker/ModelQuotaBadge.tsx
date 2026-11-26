import type { ServerProvider } from "@t3tools/contracts";
import { useGT, useLocale, useMessages } from "gt-react";

import { cn } from "~/lib/utils";
import { pickerQuota, quotaWindowLabel, quotaWindowPeriod } from "../quota/modelQuotaWindows";

/**
 * What is left of the model's scarcest session window, else its weekly one, which carries a
 * narrow "1w" marker. A provider that reports no limits gets a quiet rule instead of a figure.
 */
export function ModelQuotaBadge(props: { provider: ServerProvider | undefined; slug: string }) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const quota = props.provider
    ? pickerQuota(props.provider.driver, props.provider.usageLimits, props.slug)
    : null;
  if (!quota) {
    return (
      <span
        aria-hidden="true"
        data-model-quota="none"
        className="mx-1 h-px w-2.5 shrink-0 bg-muted-foreground/40"
      />
    );
  }
  const left = new Intl.NumberFormat(locale).format(quota.remaining);
  return (
    <span
      data-model-quota={quota.remaining}
      className={cn(
        "inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-3xs font-medium tabular-nums",
        quota.remaining <= 10 ? "text-error-foreground" : "text-muted-foreground",
      )}
    >
      {gt("{left}% left", { left })}
      {quota.weekly ? (
        <span aria-hidden="true" className="font-normal">
          {quotaWindowPeriod(quota.window, locale, m)}
        </span>
      ) : null}
      <span className="sr-only">, {quotaWindowLabel(quota.window, locale, m)}</span>
    </span>
  );
}
