/**
 * The effort slider's pixels: a trail and a landing burst at the top level, and lanes streaming
 * through the fill and comets around the border while a fast speed is on. The loop runs only
 * while something moves, at 30 frames a second when idle and 60 while streaming.
 */

import { observeResize } from "~/lib/observeResize";

const DOT_PITCH = 3.5;
const DOT_SIZE = 1.5;
const TRAIL_LENGTH = 0.75;
const GROW_SECONDS = 0.6;
const FADE_OUT_SECONDS = 0.2;
/** The thumb's centre sits this far in from the track's right end, and its radius. */
const THUMB_INSET = 14;
const THUMB_RADIUS = 16;
const AMBIENT_FRAME_MS = 33;
const STREAM_FRAME_MS = 16;
const STREAM_FADE_SECONDS = 0.2;
/** Seconds for a comet to lap the track's border, and its tail as a share of the lap. */
const LAP_SECONDS = 1.1;
const COMET_TAIL = 0.38;
const SHOCK_MS = 420;
/** The thumb's move to the top level takes about this long before it lands. */
export const LANDING_DELAY_MS = 220;

type RGB = readonly [number, number, number];

interface Dot {
  x: number;
  y: number;
  density: number;
  jitter: number;
  phase: number;
  speed: number;
  /** Its row's stream: pixels per second, the gap between packets, and an offset. */
  laneSpeed: number;
  lanePeriod: number;
  lanePhase: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  glint: number;
}

interface Surface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (value: number) => value - Math.floor(value);
const mix = (from: RGB, to: RGB, amount: number): RGB => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
];
const easeOutCubic = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const rgba = ([r, g, b]: RGB, alpha: number) => `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
function hash(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function surfaceOf(canvas: HTMLCanvasElement): Surface | null {
  const context = canvas.getContext("2d");
  return context ? { canvas, context, width: 0, height: 0 } : null;
}

function fit(surface: Surface, width: number, height: number) {
  const ratio = window.devicePixelRatio || 1;
  surface.width = width;
  surface.height = height;
  surface.canvas.width = Math.max(1, Math.round(width * ratio));
  surface.canvas.height = Math.max(1, Math.round(height * ratio));
  surface.context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

/** Resolves any CSS colour, oklch included, to sRGB by painting one pixel. */
function resolveRgb(color: string): RGB {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return [168, 85, 247];
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function lattice(width: number, height: number): Dot[] {
  const columns = Math.floor((width - 4) / DOT_PITCH);
  const rows = Math.floor((height - 4) / DOT_PITCH);
  const left = (width - (columns - 1) * DOT_PITCH) / 2;
  const top = (height - (rows - 1) * DOT_PITCH) / 2;
  const dots: Dot[] = [];
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const seed = column * 31 + row * 7 + 1;
      dots.push({
        x: left + column * DOT_PITCH,
        y: top + row * DOT_PITCH,
        density: hash(seed),
        jitter: hash(seed + 1.13),
        phase: hash(seed + 0.37) * Math.PI * 2,
        speed: 2 + hash(seed + 0.71) * 5,
        laneSpeed: 380 + hash(row * 13 + 5) * 320,
        lanePeriod: 46 + hash(row * 3 + 11) * 34,
        lanePhase: hash(row * 7 + 3),
      });
    }
  }
  return dots;
}

/** Most sparks shoot left along the trail; the rest spray all around the thumb. */
function burstSparks(x: number, y: number): Spark[] {
  return Array.from({ length: 110 }, (_, index) => {
    const alongTrail = index < 78;
    const angle = alongTrail ? Math.PI + (Math.random() - 0.5) * 1.3 : Math.random() * Math.PI * 2;
    const speed = alongTrail ? 160 + Math.random() * 520 : 70 + Math.random() * 230;
    return {
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * (alongTrail ? 0.75 : 1),
      age: 0,
      life: 0.45 + Math.random() * 0.75,
      size: Math.random() < 0.25 ? 2.5 : 1.5,
      glint: Math.random(),
    };
  });
}

export interface EffortTrail {
  /** Shows or hides the trail; `landing` plays the burst once the thumb arrives. */
  setTop(top: boolean, landing: boolean, color: string): void;
  /** Streams the fill while a fast speed is on; `fill` is the thumb's place from 0 to 1. */
  setFast(fast: boolean, fill: number, color: string): void;
  dispose(): void;
}

export function createEffortTrail(
  trackCanvas: HTMLCanvasElement,
  effectsCanvas: HTMLCanvasElement,
): EffortTrail | null {
  const track = surfaceOf(trackCanvas);
  const effects = surfaceOf(effectsCanvas);
  if (!track || !effects) return null;

  let dots: Dot[] = [];
  let accent: RGB = [168, 85, 247];
  let top = false;
  let growth = 0;
  let growing = false;
  /** When the trail may start growing, and when the burst fires, in performance.now() ms. */
  let growFrom = 0;
  let burstAt = -1;
  let burstFired = false;
  let sparks: Spark[] = [];
  let effectsDirty = false;
  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let fast = false;
  let streamLevel = 0;
  let streamEnd = 0;
  let streamTarget = 0;

  const stopObserving = observeResize([trackCanvas, effectsCanvas], () => {
    fit(track, trackCanvas.clientWidth, trackCanvas.clientHeight);
    fit(effects, effectsCanvas.clientWidth, effectsCanvas.clientHeight);
    dots = lattice(track.width, track.height);
    kick();
  });

  function kick() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  function step(now: number) {
    frame = 0;
    const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const reduced = reducedMotion();

    const live = top && now >= growFrom;
    const goal = live ? 1 : 0;
    if (reduced) growth = goal;
    else if (growth < goal) growth = Math.min(goal, growth + delta / GROW_SECONDS);
    else if (growth > goal) growth = Math.max(goal, growth - delta / FADE_OUT_SECONDS);
    growing = goal === 1;

    if (burstAt > 0 && !burstFired && now >= burstAt) {
      burstFired = true;
      sparks.push(...burstSparks(effects!.width - THUMB_INSET, effects!.height / 2));
    }
    const sinceBurst = burstFired ? now - burstAt : Infinity;
    const bursting = sparks.length > 0 || sinceBurst < 1500 || (burstAt > 0 && !burstFired);
    const ambient = !reduced && growth > 0;
    const settled = growth === goal;

    const streamGoal = fast && !reduced ? 1 : 0;
    if (streamLevel < streamGoal)
      streamLevel = Math.min(1, streamLevel + delta / STREAM_FADE_SECONDS);
    else if (streamLevel > streamGoal)
      streamLevel = Math.max(0, streamLevel - delta / STREAM_FADE_SECONDS);
    // Eases after the thumb, which slides to its level rather than jumping.
    streamEnd += (streamTarget - streamEnd) * (1 - Math.exp(-delta * 14));
    const streaming = streamLevel > 0;
    const streamSettled = streamLevel === streamGoal;
    const frameMs = streaming ? STREAM_FRAME_MS : AMBIENT_FRAME_MS;

    const running = bursting || !settled || ambient || streaming || !streamSettled;
    // The last frame always draws: skipped by the frame cap on a fast display, the loop would stop
    // on a half-retracted trail and leave it on screen.
    if (!running || bursting || !settled || !streamSettled || now - lastDraw >= frameMs) {
      lastDraw = now;
      drawTrail(now, reduced, sinceBurst);
      drawEffects(now, delta, sinceBurst);
    }
    if (running) frame = requestAnimationFrame(step);
  }

  function drawTrail(now: number, reduced: boolean, sinceBurst: number) {
    const { context, width, height } = track!;
    if (!width) return;
    context.clearRect(0, 0, width, height);
    drawStream(now / 1000);
    drawBorder(now / 1000);
    if (growth <= 0) return;
    // Leaving the top level fades the whole trail; retracting would strand its tip past the thumb.
    const reach = growing ? easeOutCubic(growth) : 1;
    const fade = growing ? 1 : growth;
    const t = now / 1000;
    const start = width - THUMB_INSET - THUMB_RADIUS;
    const length = width * TRAIL_LENGTH;

    const bloom = context.createLinearGradient(start, 0, start - length, 0);
    bloom.addColorStop(0, rgba(accent, 0.3 * smoothstep(0, 0.35, reach) * fade));
    bloom.addColorStop(1, rgba(accent, 0));
    context.fillStyle = bloom;
    context.fillRect(Math.max(0, start - length), 0, Math.min(length, start), height);

    const pulses = reduced ? [] : [(t * 0.48) % 1.3, (t * 0.48 + 0.62) % 1.3];
    const pulseStrength = reduced ? 0 : smoothstep(0.55, 1, reach);
    const flashWindow = growing && !reduced ? 1 - smoothstep(0.9, 1, reach) : 0;
    const burstGlow = !reduced && sinceBurst < 1500 ? Math.exp(-sinceBurst / 280) : 0;

    for (const dot of dots) {
      const along = (start - dot.x) / length;
      if (along < 0 || along > 1) continue;
      const threshold = along * 0.82 + dot.jitter * 0.18;
      const appear = clamp((reach - threshold) / 0.07, 0, 1);
      if (appear <= 0) continue;

      let pulse = 0;
      for (const p of pulses) {
        const distance = along - p;
        pulse += Math.exp(-(distance * distance) / (2 * 0.045 * 0.045));
      }
      pulse = Math.min(1, pulse) * pulseStrength * (1 - along * 0.35);
      const density = 0.9 - 0.8 * along ** 0.85 + pulse * 0.25 + burstGlow * 0.75;
      if (dot.density > density) continue;

      let alpha = 0.95 - 0.68 * along;
      let white = 0;
      if (flashWindow > 0) {
        const flash = Math.exp(-(reach - threshold) / 0.05) * flashWindow;
        alpha += flash * 0.5;
        white += flash * 0.7;
      }
      if (!reduced) alpha *= 0.66 + 0.34 * Math.sin(t * dot.speed + dot.phase);
      alpha += pulse * 0.6 + burstGlow * 0.7;
      white += pulse * 0.55 + burstGlow * 0.55;
      alpha = clamp(alpha * appear * fade * (1 - smoothstep(0.82, 1, along) * 0.6), 0, 1);
      if (alpha < 0.02) continue;
      white = clamp(white, 0, 1);
      const r = accent[0] + (255 - accent[0]) * white;
      const g = accent[1] + (255 - accent[1]) * white;
      const b = accent[2] + (255 - accent[2]) * white;
      context.globalAlpha = alpha;
      context.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      context.fillRect(dot.x - DOT_SIZE / 2, dot.y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }
    context.globalAlpha = 1;
  }

  /**
   * The fill charges: every pixel holds a low glow, a surge sweeps toward the thumb, and long
   * packets race along each row. The bright fill washes out pale pixels, so tails run deep and
   * only the enlarged heads turn white.
   */
  function drawStream(t: number) {
    if (streamLevel <= 0) return;
    const { context, width } = track!;
    const end = THUMB_INSET + (width - THUMB_INSET * 2) * streamEnd;
    const surgeAt = fract(t * 1.6) * (end + 60) - 30;
    const deep: RGB = [accent[0] * 0.42, accent[1] * 0.42, accent[2] * 0.42];
    for (const dot of dots) {
      if (dot.x > end) continue;
      const u = fract((t * dot.laneSpeed - dot.x) / dot.lanePeriod + dot.lanePhase);
      const head = (1 - u) ** 1.6;
      const surge = Math.max(0, 1 - Math.abs(dot.x - surgeAt) / 26);
      const nearThumb = 0.55 + 0.45 * (dot.x / end);
      const twinkle = 0.85 + 0.15 * Math.sin(t * dot.speed * 4 + dot.phase);
      const lit = dot.density < 0.35 + head * 0.65;
      const heat = lit ? clamp(head + surge * 0.3, 0, 1) : 0;
      const alpha =
        (lit ? 0.5 + heat * 0.5 : 0.14 + surge * 0.3) * nearThumb * twinkle * streamLevel;
      if (alpha < 0.03) continue;
      const color =
        heat < 0.6
          ? mix(deep, accent, heat / 0.6)
          : mix(accent, [255, 255, 255], (heat - 0.6) / 0.4);
      const size = DOT_SIZE + heat ** 4 * 1.5;
      context.globalAlpha = clamp(alpha, 0, 1);
      context.fillStyle = `rgb(${color[0] | 0},${color[1] | 0},${color[2] | 0})`;
      context.fillRect(dot.x - size / 2, dot.y - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }

  /** Two comets of pixels chase around the track's pill outline over a faint charged ring. */
  function drawBorder(t: number) {
    if (streamLevel <= 0) return;
    const { context, width, height } = track!;
    const radius = height / 2;
    const ring = radius - 1;
    const straight = Math.max(0, width - height);
    const arc = Math.PI * ring;
    const lap = straight * 2 + arc * 2;

    context.globalAlpha = 0.3 * streamLevel;
    context.strokeStyle = rgba(accent, 1);
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(1, 1, width - 2, height - 2, ring);
    context.stroke();

    const pointAt = (distance: number): readonly [number, number] => {
      let d = ((distance % lap) + lap) % lap;
      if (d < straight) return [radius + d, radius - ring];
      d -= straight;
      if (d < arc) {
        const angle = -Math.PI / 2 + d / ring;
        return [width - radius + Math.cos(angle) * ring, radius + Math.sin(angle) * ring];
      }
      d -= arc;
      if (d < straight) return [width - radius - d, radius + ring];
      const angle = Math.PI / 2 + (d - straight) / ring;
      return [radius + Math.cos(angle) * ring, radius + Math.sin(angle) * ring];
    };

    const tail = lap * COMET_TAIL;
    for (const offset of [0, 0.5]) {
      const head = (fract(t / LAP_SECONDS + offset) * lap) | 0;
      for (let back = 0; back < tail; back += 1.5) {
        const fade = (1 - back / tail) ** 1.8;
        const white = fade ** 3 * 0.9;
        const size = DOT_SIZE + fade ** 4 * 1.25;
        const [x, y] = pointAt(head - back);
        context.globalAlpha = clamp(fade * streamLevel, 0, 1);
        context.fillStyle = `rgb(${(accent[0] + (255 - accent[0]) * white) | 0},${(accent[1] + (255 - accent[1]) * white) | 0},${(accent[2] + (255 - accent[2]) * white) | 0})`;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    context.globalAlpha = 1;
  }

  function drawEffects(_now: number, delta: number, sinceBurst: number) {
    const { context, width, height } = effects!;
    const shock = sinceBurst < SHOCK_MS;
    if (sparks.length === 0 && !shock) {
      if (effectsDirty) context.clearRect(0, 0, width, height);
      effectsDirty = false;
      return;
    }
    effectsDirty = true;
    context.clearRect(0, 0, width, height);
    const x = width - THUMB_INSET;
    const y = height / 2;

    if (shock) {
      const k = sinceBurst / SHOCK_MS;
      const reach = easeOutCubic(k * 1.6) * width * 0.9;
      const alpha = 0.6 * (1 - k);
      const beam = context.createLinearGradient(x, 0, x - reach, 0);
      beam.addColorStop(0, `rgba(255,255,255,${alpha})`);
      beam.addColorStop(0.25, rgba(accent, alpha * 0.8));
      beam.addColorStop(1, rgba(accent, 0));
      context.fillStyle = beam;
      const thickness = 3 + 8 * (1 - k);
      context.fillRect(x - reach, y - thickness / 2, reach, thickness);
    }

    const drag = Math.exp(-delta * 3.4);
    sparks = sparks.filter((spark) => {
      spark.age += delta;
      if (spark.age >= spark.life) return false;
      spark.vx *= drag;
      spark.vy *= drag;
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      const life = 1 - spark.age / spark.life;
      const hot = Math.max(0, 1 - spark.age / 0.12);
      const mix = Math.min(1, spark.glint * 0.6 + hot);
      const r = accent[0] + (255 - accent[0]) * mix;
      const g = accent[1] + (255 - accent[1]) * mix;
      const b = accent[2] + (255 - accent[2]) * mix;
      context.globalAlpha = life ** 1.3;
      context.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      context.fillRect(
        Math.round(spark.x * 2) / 2,
        Math.round(spark.y * 2) / 2,
        spark.size,
        spark.size,
      );
      return true;
    });
    context.globalAlpha = 1;
  }

  return {
    setTop(next, landing, color) {
      accent = resolveRgb(color);
      const now = performance.now();
      if (next && !top) {
        const burst = landing && !reducedMotion();
        // Opened at the top level, the trail is simply there; reached by a move, it grows on landing.
        growFrom = landing ? now + LANDING_DELAY_MS : now;
        if (!landing) growth = 1;
        burstAt = burst ? now + LANDING_DELAY_MS : -1;
        burstFired = false;
      }
      top = next;
      kick();
    },
    setFast(next, fill, color) {
      accent = resolveRgb(color);
      streamTarget = clamp(fill, 0, 1);
      // Opened with fast already on, the stream starts at the thumb instead of sweeping out to it.
      if (next && streamLevel === 0) streamEnd = streamTarget;
      fast = next;
      kick();
    },
    dispose() {
      stopObserving();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
