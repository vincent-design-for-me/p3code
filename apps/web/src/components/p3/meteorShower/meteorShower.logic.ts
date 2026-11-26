import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

/** Start column (percent of the banner width) and phase (share of one fall) per meteor. */
const METEORS: ReadonlyArray<{ readonly x: number; readonly phase: number }> = [
  { x: 78, phase: 0 },
  { x: 38, phase: 0.52 },
  { x: 96, phase: 0.27 },
  { x: 58, phase: 0.78 },
  { x: 20, phase: 0.13 },
  { x: 86, phase: 0.64 },
  { x: 47, phase: 0.38 },
  { x: 108, phase: 0.9 },
  { x: 30, phase: 0.06 },
  { x: 68, phase: 0.45 },
  { x: 100, phase: 0.71 },
  { x: 52, phase: 0.2 },
];

const MAX_LEVEL = 6;
const FALL_SECONDS = [3.2, 2.5, 2, 1.6, 1.3, 1.05] as const;
const METEOR_COUNTS = [4, 6, 7, 9, 10, 12] as const;

export interface MeteorShower {
  /** 1–6: more working threads, faster and denser shower. */
  readonly level: number;
  readonly fallSeconds: number;
  readonly meteors: ReadonlyArray<{ readonly x: number; readonly delaySeconds: number }>;
}

export function countWorkingThreads(threads: ReadonlyArray<EnvironmentThreadShell>): number {
  let count = 0;
  for (const thread of threads) {
    if (thread.archivedAt == null && isThreadWorking(thread)) count += 1;
  }
  return count;
}

/** Null when nothing is working, so the banner stays still. */
export function meteorShowerFor(workingCount: number): MeteorShower | null {
  if (workingCount <= 0) return null;
  const level = Math.min(workingCount, MAX_LEVEL);
  const fallSeconds = FALL_SECONDS[level - 1] ?? FALL_SECONDS[0];
  const count = METEOR_COUNTS[level - 1] ?? METEOR_COUNTS[0];
  return {
    level,
    fallSeconds,
    // Negative delays start every meteor mid-fall, so the shower is full from the first frame.
    meteors: METEORS.slice(0, count).map(({ x, phase }) => ({
      x,
      delaySeconds: -phase * fallSeconds,
    })),
  };
}
