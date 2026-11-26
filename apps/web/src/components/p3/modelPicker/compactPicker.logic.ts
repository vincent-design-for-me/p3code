import type { CSSProperties } from "react";

/**
 * The compact picker's model list fits the tallest provider tab, from 158px to 280px, and gives
 * up height before the effort section and footer below it when the window is short.
 */
export function compactPickerContentStyle(tallestTabUnits: number): CSSProperties {
  const fit = `clamp(158px, calc(76px + var(--spacing) * ${Math.max(0, tallestTabUnits)}), 280px)`;
  return {
    height: `min(${fit}, max(96px, calc(var(--available-height, 440px) - 98px)))`,
    minHeight: 86,
  };
}

export interface EffortSliderOption<Id> {
  readonly id: Id;
  readonly label: string;
  readonly description?: string | undefined;
  readonly isDefault?: boolean | undefined;
}

/** The slider rests on the saved level, else the default, else the first. */
export function effortSliderIndex<Id>(
  options: ReadonlyArray<EffortSliderOption<Id>>,
  selection: Id | null,
): number {
  const saved = options.findIndex((option) => option.id === selection);
  if (saved >= 0) return saved;
  return Math.max(
    0,
    options.findIndex((option) => option.isDefault === true),
  );
}

export function effortSliderFill(index: number, optionCount: number): number {
  const steps = optionCount - 1;
  return steps > 0 ? (index * 100) / steps : 100;
}

/** Keys the range input handles itself; they must not reach the picker's list navigation. */
export const EFFORT_SLIDER_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);
