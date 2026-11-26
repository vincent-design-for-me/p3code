import { describe, expect, it } from "vite-plus/test";

import { meteorShowerFor } from "./meteorShower.logic";

describe("meteorShowerFor", () => {
  it("stays still while nothing is working", () => {
    expect(meteorShowerFor(0)).toBeNull();
    expect(meteorShowerFor(-1)).toBeNull();
  });

  it("falls faster and denser as more threads work", () => {
    const levels = [1, 2, 3, 4, 5, 6].map((count) => meteorShowerFor(count));
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1];
      const current = levels[index];
      expect(current?.fallSeconds).toBeLessThan(previous?.fallSeconds ?? 0);
      expect(current?.meteors.length).toBeGreaterThan(previous?.meteors.length ?? 0);
    }
  });

  it("caps at the sixth working thread", () => {
    expect(meteorShowerFor(6)).toEqual(meteorShowerFor(20));
    expect(meteorShowerFor(20)?.level).toBe(6);
  });

  it("starts every meteor mid-fall within one fall length", () => {
    const shower = meteorShowerFor(3);
    for (const meteor of shower?.meteors ?? []) {
      expect(meteor.delaySeconds).toBeLessThanOrEqual(0);
      expect(meteor.delaySeconds).toBeGreaterThan(-(shower?.fallSeconds ?? 0));
    }
  });
});
