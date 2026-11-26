import { useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import {
  EFFORT_SLIDER_KEYS,
  type EffortSliderOption,
  effortSliderFill,
  effortSliderIndex,
} from "./compactPicker.logic";

const ACTIVE_MS = 2000;

/**
 * One effort control as a stepped slider. Keys and clicks commit at once; a drag previews and
 * commits once when it ends, so each step does not restart the model's session options.
 */
export function EffortSlider<Id>(props: {
  label: string;
  options: ReadonlyArray<EffortSliderOption<Id>>;
  selection: Id | null;
  onCommit: (id: Id) => void;
  locked?: boolean;
  note?: string | null;
}) {
  const { options, selection, onCommit } = props;
  const [draft, setDraft] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const dragging = useRef(false);
  const preview = useRef<number | null>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the pending highlight timeout on unmount
  useEffect(() => () => clearTimeout(sleepTimer.current), []);

  const index = draft ?? effortSliderIndex(options, selection);
  const value = options[index];
  const steps = options.length - 1;
  const disabled = props.locked === true || steps === 0;
  const fill = effortSliderFill(index, options.length);

  const wake = () => {
    clearTimeout(sleepTimer.current);
    setActive(true);
    if (!dragging.current) sleepTimer.current = setTimeout(() => setActive(false), ACTIVE_MS);
  };
  const commit = (next: number) => {
    const option = options[next];
    if (option && !props.locked && option.id !== selection) onCommit(option.id);
  };
  const finish = (apply: boolean) => {
    if (!dragging.current) return;
    dragging.current = false;
    const next = preview.current;
    preview.current = null;
    setDraft(null);
    if (apply && next !== null) commit(next);
    wake();
  };

  if (!value) return null;
  return (
    <div className="grid gap-0.5" data-effort-slider>
      <div className="flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate">{props.label}</span>
        <strong className="shrink-0 font-semibold text-foreground">{value.label}</strong>
      </div>
      <div
        className={cn("group relative isolate h-6 min-w-0", disabled && "opacity-60")}
        data-active={active || undefined}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1.25 top-2.25 h-1.5 overflow-hidden rounded-full bg-foreground/11"
        >
          <span
            className="block h-full rounded-full bg-linear-to-r from-primary/60 to-primary opacity-80 group-data-active:opacity-100 motion-safe:transition-opacity"
            style={{ width: `${fill}%` }}
          />
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, steps)}
          step={1}
          value={index}
          aria-label={props.label}
          aria-valuetext={value.label}
          data-effort-level
          disabled={disabled}
          className="peer absolute inset-0 m-0 size-full cursor-ew-resize touch-pan-y opacity-0 disabled:cursor-default"
          onPointerDown={() => {
            dragging.current = true;
            wake();
          }}
          onPointerUp={() => finish(true)}
          onPointerCancel={() => finish(false)}
          onLostPointerCapture={() => finish(true)}
          onBlur={() => finish(true)}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (dragging.current) {
              preview.current = next;
              setDraft(next);
            } else {
              commit(next);
            }
            wake();
          }}
          onKeyDown={(event) => {
            if (EFFORT_SLIDER_KEYS.has(event.key)) event.stopPropagation();
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 size-3 -translate-x-1/2 rounded-full border-2 border-popover bg-primary ring-1 ring-foreground/20 group-data-active:ring-2 group-data-active:ring-primary/30 peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
          style={{ left: `calc(5px + (100% - 10px) * ${fill / 100})` }}
        />
      </div>
      {props.note ? <p className="text-2xs text-muted-foreground">{props.note}</p> : null}
    </div>
  );
}
