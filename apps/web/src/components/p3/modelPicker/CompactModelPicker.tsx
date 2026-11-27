import type { ReactNode } from "react";

/**
 * Lays the docked model picker out as one column: the search box, provider tabs, the model list,
 * then one card holding the effort and the footer.
 */
export function CompactPickerStack(props: {
  children: ReactNode;
  effort: ReactNode;
  footer?: ReactNode;
  /** Left from the effort section returns to the search box, as from the docked column. */
  onLeaveEffort: () => void;
}) {
  return (
    <div
      data-compact-model-picker
      // A fixed width, never --available-width: Base UI measures the popup with that variable set to
      // max-content, which voids min() and lets the provider tabs stretch the positioner off the trigger.
      className="flex max-h-(--available-height) w-[min(320px,calc(100vw-16px))] min-w-0 flex-col overflow-hidden"
    >
      {props.children}
      {/* The effort and the footer share one card under the list. */}
      <div
        data-effort-card
        className="mx-2 mt-1 mb-2 flex min-h-0 shrink flex-col overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/3"
      >
        <div
          data-model-picker-effort
          className="flex min-h-0 shrink flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-3 pt-2.5 pb-1.5"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" || event.altKey || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            event.stopPropagation();
            props.onLeaveEffort();
          }}
        >
          {props.effort}
        </div>
        {props.footer}
      </div>
    </div>
  );
}

/**
 * Restyles ModelPickerContent's root for the compact column; the stack above sets its height.
 * The list column's box gives way (`contents`) so the search box can sit above the provider tabs.
 */
export const COMPACT_PICKER_CONTENT_CLASS = [
  "w-full max-w-none shrink-0 flex-col",
  "[&>div:not([data-model-picker-sidebar])]:contents",
  "[&>div:not([data-model-picker-sidebar])>label]:order-first",
  // The search field: a filled box, with the focus line below it.
  "[&>div:not([data-model-picker-sidebar])>label]:relative [&>div:not([data-model-picker-sidebar])>label]:px-2.5 [&>div:not([data-model-picker-sidebar])>label]:pt-2.5 [&>div:not([data-model-picker-sidebar])>label]:pb-2",
  "[&>div:not([data-model-picker-sidebar])>label]:after:absolute [&>div:not([data-model-picker-sidebar])>label]:after:inset-x-3 [&>div:not([data-model-picker-sidebar])>label]:after:bottom-0 [&>div:not([data-model-picker-sidebar])>label]:after:h-0.5 [&>div:not([data-model-picker-sidebar])>label]:after:rounded-full [&>div:not([data-model-picker-sidebar])>label]:after:bg-transparent [&>div:not([data-model-picker-sidebar])>label]:focus-within:after:bg-primary",
  "[&>div:not([data-model-picker-sidebar])>label>div]:translate-y-0 [&>div:not([data-model-picker-sidebar])>label>div]:rounded-xl [&>div:not([data-model-picker-sidebar])>label>div]:border [&>div:not([data-model-picker-sidebar])>label>div]:border-foreground/8 [&>div:not([data-model-picker-sidebar])>label>div]:bg-foreground/5 [&>div:not([data-model-picker-sidebar])>label>div]:px-3 [&>div:not([data-model-picker-sidebar])>label>div]:py-1.5",
  "[&>div:not([data-model-picker-sidebar])>label>div>svg]:top-1/2 [&>div:not([data-model-picker-sidebar])>label>div>svg]:left-3 [&>div:not([data-model-picker-sidebar])>label>div>svg]:-translate-y-1/2",
  "[&_input]:min-h-7 [&_input]:ps-6! [&_input]:text-sm",
  // Rows a little taller and rounder, as the list is the picker's main surface.
  "[&_[role=option]]:min-h-10 [&_[role=option]]:gap-x-2 [&_[role=option]]:rounded-xl [&_[role=option]]:text-sm",
].join(" ");

/** Turns ModelPickerSidebar's vertical rail into one scrolling row of named provider tabs. */
export const COMPACT_PICKER_TABS_CLASS = [
  "w-full min-w-0 shrink-0 border-b border-foreground/8",
  "[&>div]:h-auto [&>div]:overflow-x-auto [&>div]:overflow-y-hidden [&>div]:overscroll-x-contain",
  "[&>div>div]:min-h-0 [&>div>div]:min-w-max [&>div>div]:flex-row [&>div>div]:items-center [&>div>div]:gap-0.5 [&>div>div]:px-2 [&>div>div]:pt-0.5 [&>div>div]:pb-1.5",
  "[&>div>div>[aria-hidden=true]]:hidden",
  "[&_[data-model-picker-provider]]:w-auto [&_[data-model-picker-provider]]:flex-none",
  "[&_[data-model-picker-provider]_button]:aspect-auto [&_[data-model-picker-provider]_button]:h-7 [&_[data-model-picker-provider]_button]:rounded-lg [&_[data-model-picker-provider]_button]:px-2.5 [&_[data-model-picker-provider]_button]:text-sm [&_[data-model-picker-provider]_button]:font-medium [&_[data-model-picker-provider]_button]:text-muted-foreground",
  "[&_[data-model-picker-provider]_button>:not([data-model-picker-tab-label])]:hidden",
  "[&_[data-model-picker-provider]_button[aria-pressed=true]]:bg-foreground/8 [&_[data-model-picker-provider]_button[aria-pressed=true]]:text-foreground",
  "[&_[data-model-picker-tab-label]]:max-w-36 [&_[data-model-picker-tab-label]]:truncate",
  "[&_[data-model-picker-selected-indicator]]:hidden",
].join(" ");
