import type { ReactNode } from "react";

/**
 * Lays the docked model picker out as one narrow column: provider tabs across the top, the model
 * list, the effort section, then the footer.
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
      className="flex max-h-(--available-height) w-[min(280px,var(--available-width,280px))] max-w-[calc(100vw-16px)] min-w-0 flex-col overflow-hidden"
    >
      {props.children}
      <div
        data-model-picker-effort
        className="flex min-h-0 shrink flex-col overflow-y-auto overscroll-contain border-t border-foreground/10 bg-muted/40 px-2.5 pt-1.5 pb-1"
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
  );
}

/** Restyles ModelPickerContent's root for the compact column; the stack above sets its height. */
export const COMPACT_PICKER_CONTENT_CLASS = [
  "w-full max-w-none shrink-0 flex-col",
  "[&_[role=option]]:gap-x-1.5 [&_[role=option]]:text-xs [&_[role=option]_.text-sm]:text-xs",
  "[&_input]:min-h-8 [&_input]:text-[0.8125rem]",
].join(" ");

/** Turns ModelPickerSidebar's vertical rail into one scrolling row of provider tabs. */
export const COMPACT_PICKER_TABS_CLASS = [
  "w-full min-w-0 shrink-0 border-b border-foreground/8 bg-foreground/2",
  "[&>div]:h-auto [&>div]:overflow-x-auto [&>div]:overflow-y-hidden [&>div]:overscroll-x-contain",
  "[&>div>div]:min-h-0 [&>div>div]:min-w-max [&>div>div]:flex-row [&>div>div]:items-center [&>div>div]:px-2 [&>div>div]:py-1",
  "[&>div>div>[aria-hidden=true]]:h-4 [&>div>div>[aria-hidden=true]]:w-px [&>div>div>[aria-hidden=true]]:border-0 [&>div>div>[aria-hidden=true]]:bg-border",
  "[&_[data-model-picker-provider]]:w-7 [&_[data-model-picker-provider]]:flex-none",
  "[&_[data-model-picker-provider]_button]:aspect-auto [&_[data-model-picker-provider]_button]:h-6.5 [&_[data-model-picker-provider]_button]:rounded-[0.4375rem]",
  "[&_[data-model-picker-provider]_button[aria-pressed=true]]:bg-primary/13 [&_[data-model-picker-provider]_button[aria-pressed=true]]:ring-1 [&_[data-model-picker-provider]_button[aria-pressed=true]]:ring-primary/22 [&_[data-model-picker-provider]_button[aria-pressed=true]]:ring-inset",
  "[&_[data-model-picker-selected-indicator]]:hidden",
].join(" ");
