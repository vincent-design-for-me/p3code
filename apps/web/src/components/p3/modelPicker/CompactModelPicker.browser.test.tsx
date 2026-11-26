import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type ServerProviderModel,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../../test/render";
import { ProviderModelPicker } from "../../chat/ProviderModelPicker";
import { deriveProviderInstanceEntries } from "../../../providerInstances";
import { CompactPickerEffort } from "./CompactPickerEffort";
import { EffortSlider } from "./EffortSlider";

const LEVELS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium", isDefault: true },
  { id: "high", label: "High" },
];

function Slider(props: { onCommit: (id: string) => void; onOuterKeyDown?: () => void }) {
  const [selection, setSelection] = useState("medium");
  return (
    <div onKeyDown={props.onOuterKeyDown}>
      <EffortSlider
        label="Thinking"
        options={LEVELS}
        selection={selection}
        onCommit={(id) => {
          props.onCommit(id);
          setSelection(id);
        }}
      />
    </div>
  );
}

function setRangeValue(input: HTMLInputElement, value: number) {
  // React tracks the value it last rendered, so a plain assignment would not fire onChange.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
    input,
    String(value),
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("commits keyboard steps at once and keeps their keys from the picker", async () => {
  const onCommit = vi.fn();
  const onOuterKeyDown = vi.fn();
  await using screen = await render(
    <Slider onCommit={onCommit} onOuterKeyDown={onOuterKeyDown} />,
    { router: false }, // no routes involved
  );
  const slider = screen.getByRole("slider", { name: "Thinking" });
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Medium");
  (slider.element() as HTMLInputElement).focus();

  await userEvent.keyboard("{ArrowRight}");
  expect(onCommit).toHaveBeenCalledExactlyOnceWith("high");
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  await userEvent.keyboard("{Home}");
  expect(onCommit).toHaveBeenLastCalledWith("low");
  await expect.element(slider).toHaveFocus();
  expect(onOuterKeyDown).not.toHaveBeenCalled();
});

it("previews a drag and commits once when it ends", async () => {
  const onCommit = vi.fn();
  await using screen = await render(<Slider onCommit={onCommit} />, { router: false }); // no routes involved
  const slider = screen.getByRole("slider", { name: "Thinking" });
  const input = slider.element() as HTMLInputElement;

  input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  setRangeValue(input, 0);
  setRangeValue(input, 2);
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  expect(onCommit).not.toHaveBeenCalled();
  input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await vi.waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith("high"));

  // A cancelled drag snaps back without committing.
  input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  setRangeValue(input, 0);
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Low");
  input.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  expect(onCommit).toHaveBeenCalledTimes(1);
});

it("commits a real drag once when it is released past the track", async () => {
  const onCommit = vi.fn();
  await using screen = await render(
    <div className="flex w-120 items-center gap-40">
      <div className="w-40">
        <Slider onCommit={onCommit} />
      </div>
      <div data-testid="past-the-track" className="size-6" />
    </div>,
    { router: false }, // no routes involved
  );
  const slider = screen.getByRole("slider", { name: "Thinking" });
  await userEvent.dragAndDrop(slider, screen.getByTestId("past-the-track"));
  await vi.waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith("high"));
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
});

it("locks the slider while ultrathink sits in the prompt", async () => {
  const onCommit = vi.fn();
  await using screen = await render(
    <EffortSlider
      label="Effort"
      options={LEVELS}
      selection="high"
      onCommit={onCommit}
      locked
      note="Ultrathink is in the prompt"
    />,
    { router: false }, // no routes involved
  );
  await expect.element(screen.getByRole("slider", { name: "Effort" })).toBeDisabled();
  await expect.element(screen.getByText("Ultrathink is in the prompt")).toBeVisible();
  expect(onCommit).not.toHaveBeenCalled();
});

const agentModels: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "fusion",
    name: "Fusion",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "mode",
          label: "Session Mode",
          type: "select",
          currentValue: "code",
          options: [
            { id: "code", label: "Code" },
            { id: "plan", label: "Plan" },
          ],
        },
        {
          id: "thought_level",
          label: "Thinking",
          type: "select",
          role: "reasoning",
          currentValue: "medium",
          options: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ],
        },
      ],
    }),
  },
];

function AgentEffort(props: { onChange: (next: ReadonlyArray<ProviderOptionSelection>) => void }) {
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
  return (
    <CompactPickerEffort
      traits={{
        provider: ProviderDriverKind.make("acpRegistry"),
        instanceId: ProviderInstanceId.make("devin"),
        models: agentModels,
        model: "fusion",
        modelOptions: options,
        onModelOptionsChange: (next) => {
          props.onChange(next ?? []);
          setOptions(next ?? []);
        },
      }}
    />
  );
}

it("slides the reasoning control and folds other options under it", async () => {
  const onChange = vi.fn();
  await using screen = await render(<AgentEffort onChange={onChange} />, { router: false }); // no routes involved
  const slider = screen.getByRole("slider", { name: "Thinking" });
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Medium");
  const options = screen.getByText("Options");
  await expect.element(options).toBeVisible();
  expect(options.element().closest("details")?.open).toBe(false);
  await options.click();
  await expect.element(screen.getByRole("button", { name: "Session Mode: Code" })).toBeVisible();

  (slider.element() as HTMLInputElement).focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(onChange).toHaveBeenLastCalledWith(
    expect.arrayContaining([{ id: "thought_level", value: "high" }]),
  );
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
});

function usage(windows: ServerProviderUsageLimits["windows"]): ServerProviderUsageLimits {
  return { checkedAt: "2026-11-26T00:00:00.000Z", windows };
}

it("lays the docked picker out as a column with provider tabs and per-model quota", async () => {
  const entries = deriveProviderInstanceEntries([
    {
      instanceId: ProviderInstanceId.make("codex"),
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [{ slug: "codex", name: "Codex model", isCustom: false, capabilities: {} }],
      slashCommands: [],
      skills: [],
      usageLimits: usage([
        { id: "primary", kind: "session", label: "Session", usedPercent: 58 },
        { id: "secondary", kind: "weekly", label: "Weekly", usedPercent: 10 },
      ]),
    },
    {
      instanceId: ProviderInstanceId.make("claude"),
      driver: ProviderDriverKind.make("claudeAgent"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [{ slug: "claude", name: "Claude model", isCustom: false, capabilities: {} }],
      slashCommands: [],
      skills: [],
      usageLimits: usage([
        {
          id: "seven_day",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 95,
          windowDurationMins: 10_080,
        },
      ]),
    },
  ]);
  const [codex] = entries;

  function Picker() {
    const [effort, setEffort] = useState("medium");
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={codex!.instanceId}
        model="codex"
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={new Map(entries.map((entry) => [entry.instanceId, entry.models]))}
        triggerAriaLabel="Choose model"
        onInstanceModelChange={() => {}}
        compactLayout
        effortColumn={
          <EffortSlider label="Effort" options={LEVELS} selection={effort} onCommit={setEffort} />
        }
      />
    );
  }

  await using screen = await render(<Picker />);
  await screen.getByRole("button", { name: "Choose model" }).click();
  const search = page.getByPlaceholder("Search models...");
  await expect.element(search).toHaveFocus();
  await expect
    .element(page.getByRole("toolbar", { name: "Providers" }))
    .toHaveAttribute("aria-orientation", "horizontal");
  const codexRow = page.getByRole("option", { name: /Codex model/ });
  await vi.waitFor(() => expect(codexRow.element().textContent).toContain("42% left"));

  // The tabs sit above the search box, so Down returns to it.
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(page.getByRole("button", { name: /^Codex/ })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(search).toHaveFocus();

  await page.getByRole("button", { name: /^Claude/ }).click();
  const claudeRow = page.getByRole("option", { name: /Claude model/ });
  await vi.waitFor(() => expect(claudeRow.element().textContent).toContain("5% left1w"));
  expect(claudeRow.element().querySelector('[data-model-quota="5"]')?.className).toContain(
    "text-error-foreground",
  );

  // Right moves into the effort below the list; the slider keeps its own arrow keys.
  await search.click();
  await page.getByRole("button", { name: /^Codex/ }).click();
  await search.click();
  await userEvent.keyboard("{ArrowRight}");
  const slider = page.getByRole("slider", { name: "Effort" });
  await expect.element(slider).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(slider).toHaveFocus();
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Low");
});
