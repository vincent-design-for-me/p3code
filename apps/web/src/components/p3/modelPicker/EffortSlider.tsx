import { BrainIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import {
  EFFORT_SLIDER_KEYS,
  type EffortSliderOption,
  effortSliderFill,
  effortSliderIndex,
} from "./compactPicker.logic";
import "./effortSlider.css";
import { createEffortTrail, type EffortTrail, LANDING_DELAY_MS } from "./effortTrail";

/** Centers a step on the track, whose ends leave room for half the thumb. */
function trackPosition(fill: number) {
  return `calc(14px + (100% - 28px) * ${fill / 100})`;
}

/** Pins the end labels to the track's edges so they never spill out of the card. */
function edgeAligned(index: number, steps: number, fill: number): CSSProperties {
  if (index === 0) return { left: 0 };
  if (index === steps) return { right: 0 };
  return { left: trackPosition(fill), transform: "translateX(-50%)" };
}

/** Three rings ripple out of the thumb when it lands on the top level, the later ones slower. */
const RING_TIMINGS = [
  { duration: 900, delay: 80 },
  { duration: 1050, delay: 180 },
  { duration: 750, delay: 0 },
];
const POP_EASING = "cubic-bezier(.2,1.5,.4,1)";

/**
 * The landing on the top level: the thumb pops, a flash and rings burst, the name and the card
 * light up. Returns a cleanup that removes the rings if the slider leaves the top or unmounts first.
 */
function playLanding(root: HTMLElement) {
  const color = getComputedStyle(root).getPropertyValue("--effort-color").trim();
  const glow = (percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`;
  const play = (
    element: Element | null | undefined,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) =>
    element && typeof element.animate === "function"
      ? element.animate(keyframes, { ...options, delay: LANDING_DELAY_MS + (options.delay ?? 0) })
      : undefined;

  // The flash and rings outgrow the card. A fixed layer on the body lets them spill past it without
  // its scroll area growing a scrollbar. It sits where the thumb lands: half a thumb in from the end.
  const track = root.querySelector("[data-effort-anchor]")?.parentElement?.getBoundingClientRect();
  const layer = track ? document.createElement("div") : null;
  if (layer && track) {
    layer.dataset.effortLanding = "";
    layer.style.setProperty("--effort-color", color);
    layer.style.left = `${track.right - 14}px`;
    layer.style.top = `${track.top + track.height / 2}px`;
    layer.innerHTML =
      "<span data-effort-flash></span>" +
      "<span data-effort-ring></span>".repeat(RING_TIMINGS.length);
    document.body.append(layer);
  }
  const flash = play(
    layer?.querySelector("[data-effort-flash]"),
    [
      { opacity: 1, transform: "scale(.3)" },
      { opacity: 0, transform: "scale(1.9)" },
    ],
    { duration: 550, easing: "cubic-bezier(.1,.8,.3,1)" },
  );
  const rings = [...(layer?.querySelectorAll("[data-effort-ring]") ?? [])].map((ring, index) =>
    play(
      ring,
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(3.6)" },
      ],
      { ...RING_TIMINGS[index], easing: "cubic-bezier(.1,.75,.3,1)" },
    ),
  );
  void Promise.allSettled([flash, ...rings].map((animation) => animation?.finished)).then(() =>
    layer?.remove(),
  );
  play(
    root.querySelector("[data-effort-thumb]"),
    [
      { transform: "scale(.82)", easing: POP_EASING },
      { transform: "scale(1.24)", easing: POP_EASING, offset: 0.4 },
      { transform: "scale(1)" },
    ],
    { duration: 550 },
  );
  play(
    root.querySelector("[data-effort-value] > strong"),
    [
      { transform: "scale(.75)", opacity: 0, filter: "blur(3px)" },
      { transform: "scale(1.16)", opacity: 1, filter: "blur(0) brightness(1.7)", offset: 0.45 },
      { transform: "scale(1)", opacity: 1, filter: "blur(0) brightness(1)" },
    ],
    { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  play(
    root.closest("[data-effort-card]"),
    [
      { boxShadow: `0 0 0 1px ${glow(60)}, inset 0 0 28px ${glow(30)}` },
      { boxShadow: "0 0 0 0 transparent, inset 0 0 0 transparent" },
    ],
    { duration: 1000, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  return () => layer?.remove();
}

/**
 * One effort control as a stepped slider. Keys, clicks and level labels commit at once; a drag
 * previews and commits once when it ends, so each step does not restart the model's session options.
 */
export function EffortSlider<Id>(props: {
  label: string;
  options: ReadonlyArray<EffortSliderOption<Id>>;
  selection: Id | null;
  onCommit: (id: Id) => void;
  locked?: boolean;
  note?: string | null;
  /** Sits at the header's end, such as the speed toggle. */
  accessory?: ReactNode;
  /** A fast speed is on: light streams through the fill. */
  fast?: boolean;
}) {
  const { options, selection, onCommit } = props;
  const [draft, setDraft] = useState<number | null>(null);
  // The thumb shakes on a change, not when the picker opens.
  const [moved, setMoved] = useState(false);
  const dragging = useRef(false);
  const preview = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trailCanvas = useRef<HTMLCanvasElement>(null);
  const effectsCanvas = useRef<HTMLCanvasElement>(null);
  const trail = useRef<EffortTrail | null>(null);
  /** Set when a move heads for the top level, so its landing bursts; opening there does not. */
  const landing = useRef(false);

  const index = draft ?? effortSliderIndex(options, selection);
  const value = options[index];
  const steps = options.length - 1;
  const disabled = props.locked === true || steps === 0;
  const fill = effortSliderFill(index, options.length);
  const atTop = steps > 1 && index === steps;
  // The level name rolls up toward higher effort and down toward lower, like a picker wheel.
  const [roll, setRoll] = useState({ index, up: true });
  if (roll.index !== index) setRoll({ index, up: index > roll.index });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the canvas animation loop for the popup's lifetime
  useEffect(() => {
    if (!trailCanvas.current || !effectsCanvas.current) return;
    trail.current = createEffortTrail(trailCanvas.current, effectsCanvas.current);
    return () => {
      trail.current?.dispose();
      trail.current = null;
    };
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives the canvas trail and Web Animations burst after the thumb re-renders
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const land = landing.current && atTop;
    landing.current = false;
    trail.current?.setTop(
      atTop,
      land,
      getComputedStyle(root).getPropertyValue("--effort-color").trim(),
    );
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return land && !reduced ? playLanding(root) : undefined;
  }, [atTop]);

  const fast = props.fast === true && !disabled;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- streams the canvas pixels through the fill while a fast speed is on
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    trail.current?.setFast(
      fast,
      fill / 100,
      getComputedStyle(root).getPropertyValue("--effort-color").trim(),
    );
  }, [fast, fill]);

  const heading = (next: number) => {
    setMoved(true);
    if (next === steps && index !== steps) landing.current = true;
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
  };

  if (!value) return null;
  return (
    <div
      ref={rootRef}
      className="grid gap-1.5"
      data-effort-slider
      data-top={atTop || undefined}
      data-fast={fast || undefined}
      data-locked={disabled || undefined}
      style={{ "--effort-hue": 250 + (80 * fill) / 100 } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            data-effort-dot
            className="size-2 shrink-0 rounded-full bg-(--effort-color)"
          />
          <span className="min-w-0 truncate text-muted-foreground">{props.label}</span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span data-effort-value className="inline-grid shrink-0">
            <strong
              key={index}
              data-roll={moved ? (roll.up ? "up" : "down") : undefined}
              className="font-semibold text-(--effort-color)"
            >
              {value.label}
            </strong>
          </span>
        </span>
        {props.accessory}
      </div>
      <div className={cn("relative isolate h-8 min-w-0", disabled && "opacity-60")}>
        <span
          aria-hidden="true"
          data-effort-track
          className="pointer-events-none absolute inset-x-0 top-0.5 h-7 overflow-hidden rounded-full bg-foreground/7"
        >
          <span
            data-effort-fill
            className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
            style={{ width: trackPosition(fill) }}
          />
          <canvas ref={trailCanvas} data-effort-trail className="absolute inset-0 size-full" />
          {options.map((option, step) => (
            <span
              key={String(option.id)}
              className={cn(
                "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                step <= index ? "bg-foreground/60" : "bg-foreground/25",
              )}
              style={{ left: trackPosition(effortSliderFill(step, options.length)) }}
            />
          ))}
        </span>
        <canvas ref={effectsCanvas} aria-hidden="true" data-effort-effects />
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
          }}
          onPointerUp={() => finish(true)}
          onPointerCancel={() => finish(false)}
          onLostPointerCapture={() => finish(true)}
          onBlur={() => finish(true)}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            heading(next);
            if (dragging.current) {
              preview.current = next;
              setDraft(next);
            } else {
              commit(next);
            }
          }}
          onKeyDown={(event) => {
            if (EFFORT_SLIDER_KEYS.has(event.key)) event.stopPropagation();
          }}
        />
        <span
          aria-hidden="true"
          data-effort-anchor
          className="pointer-events-none absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 peer-focus-visible:[&>[data-effort-thumb]]:ring-ring"
          style={{ left: trackPosition(fill) }}
        >
          <span data-effort-glow className="absolute -inset-2 rounded-full" />
          <span
            key={moved ? `thumb-${index}` : "thumb"}
            data-effort-thumb
            data-moved={moved || undefined}
            className="relative flex size-8 items-center justify-center rounded-full bg-(--effort-color) text-white ring-2 ring-popover"
          >
            <BrainIcon className="size-4.5" strokeWidth={2.25} />
            {moved ? <span data-effort-burst className="absolute -inset-0.5 rounded-full" /> : null}
          </span>
        </span>
      </div>
      <div className="relative h-5">
        {options.map((option, step) => (
          <button
            key={String(option.id)}
            type="button"
            tabIndex={-1}
            disabled={disabled}
            data-effort-level-label
            className={cn(
              "absolute top-0 h-5 truncate rounded-md leading-5 outline-none",
              options.length > 4 ? "text-3xs" : "text-2xs",
              step === index
                ? "bg-foreground/10 px-1.5 font-medium text-foreground"
                : "cursor-pointer px-0 text-muted-foreground hover:text-foreground disabled:cursor-default",
            )}
            style={{
              ...edgeAligned(step, steps, effortSliderFill(step, options.length)),
              // Each label stops halfway to its neighbours, so long names truncate, not overlap.
              maxWidth:
                step === 0 || step === steps
                  ? `calc(14px + (100% - 28px) / ${2 * Math.max(1, steps)} - 2px)`
                  : `calc((100% - 28px) / ${Math.max(1, steps)} - 2px)`,
            }}
            // Keeps focus where it was, so the next arrow key still steps the slider.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              heading(step);
              commit(step);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {props.note ? <p className="text-2xs text-muted-foreground">{props.note}</p> : null}
    </div>
  );
}
