import { describe, expect, it } from "vite-plus/test";

import {
  compactPickerContentStyle,
  effortSliderFill,
  effortSliderIndex,
} from "./compactPicker.logic";

const levels = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium", isDefault: true },
  { id: "high", label: "High" },
];

describe("effortSliderIndex", () => {
  it("rests on the saved level", () => {
    expect(effortSliderIndex(levels, "high")).toBe(2);
  });

  it("falls back to the default level, then the first", () => {
    expect(effortSliderIndex(levels, "ultrathink")).toBe(1);
    expect(effortSliderIndex(levels, null)).toBe(1);
    expect(
      effortSliderIndex(
        [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        "z",
      ),
    ).toBe(0);
  });

  it("matches boolean ids", () => {
    const toggle = [
      { id: false, label: "Off" },
      { id: true, label: "On" },
    ];
    expect(effortSliderIndex(toggle, true)).toBe(1);
    expect(effortSliderIndex(toggle, false)).toBe(0);
  });
});

describe("effortSliderFill", () => {
  it("spreads the steps over the track", () => {
    expect(effortSliderFill(0, 3)).toBe(0);
    expect(effortSliderFill(1, 3)).toBe(50);
    expect(effortSliderFill(2, 3)).toBe(100);
  });

  it("fills a single level", () => {
    expect(effortSliderFill(0, 1)).toBe(100);
  });
});

describe("compactPickerContentStyle", () => {
  it("clamps the tallest tab between 190px and 330px under the available height", () => {
    const style = compactPickerContentStyle(25.5);
    expect(style.height).toBe(
      "min(clamp(190px, calc(100px + var(--spacing) * 25.5 * 1.25), 330px), max(140px, calc(var(--available-height, 560px) - 240px)))",
    );
    expect(style.minHeight).toBe(120);
  });

  it("never asks for a negative list", () => {
    expect(String(compactPickerContentStyle(-4).height)).toContain("var(--spacing) * 0 * 1.25)");
  });
});
