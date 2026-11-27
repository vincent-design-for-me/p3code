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
import { CompactPickerStack } from "./CompactModelPicker";
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

it("commits a level label at once without naming a recommended level", async () => {
  const onCommit = vi.fn();
  await using screen = await render(<Slider onCommit={onCommit} />, { router: false }); // no routes involved
  await expect.element(screen.getByRole("button", { name: "High" })).toBeVisible();
  expect(screen.container.textContent).not.toContain("Recommended");
  await screen.getByRole("button", { name: "High" }).click();
  expect(onCommit).toHaveBeenCalledExactlyOnceWith("high");
  await expect
    .element(screen.getByRole("slider", { name: "Thinking" }))
    .toHaveAttribute("aria-valuetext", "High");
});

it("keeps the top level's glow inside the effort card", async () => {
  const levels = ["Low", "Medium", "High", "Extra High", "Max", "Ultra"].map((label) => ({
    id: label,
    label,
  }));
  await using screen = await render(
    <CompactPickerStack
      effort={
        <EffortSlider label="Reasoning" options={levels} selection="Ultra" onCommit={() => {}} />
      }
      onLeaveEffort={() => {}}
    >
      <div />
    </CompactPickerStack>,
    { router: false }, // no routes involved
  );
  await expect.element(screen.getByRole("slider", { name: "Reasoning" })).toBeVisible();
  const section = document.querySelector<HTMLElement>("[data-model-picker-effort]")!;
  const card = section.parentElement!.getBoundingClientRect();
  // The landing flash and rings are brief and clipped on purpose; what stays on screen must fit.
  for (const part of section.querySelectorAll("[data-effort-glow], [data-effort-thumb]")) {
    expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(card.right);
  }
  expect(getComputedStyle(section).overflowX).toBe("hidden");
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

  // The tabs are named and sit under the search box; Up or Down returns to it.
  await expect.element(page.getByRole("button", { name: /^Codex/ })).toHaveTextContent("Codex");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(page.getByRole("button", { name: /^Codex/ })).toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(search).toHaveFocus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
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

it("keeps the picker on its trigger when the provider tabs are wider than the column", async () => {
  const providers = deriveProviderInstanceEntries(
    ["codex", "claudeAgent", "cursor", "opencode", "grokBuild", "antigravity"].map(
      (driver, index) => ({
        instanceId: ProviderInstanceId.make(`provider-${index}`),
        driver: ProviderDriverKind.make(driver),
        displayName: `A provider with a long name ${index}`,
        enabled: true,
        installed: true,
        version: null,
        status: "ready" as const,
        auth: { status: "authenticated" as const },
        checkedAt: "2026-01-01T00:00:00.000Z",
        models: [
          { slug: `model-${index}`, name: `Model ${index}`, isCustom: false, capabilities: {} },
        ],
        slashCommands: [],
        skills: [],
      }),
    ),
  );
  await using screen = await render(
    <div className="fixed right-6 bottom-6">
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={providers[0]!.instanceId}
        model="model-0"
        lockedProvider={null}
        instanceEntries={providers}
        modelOptionsByInstance={new Map(providers.map((entry) => [entry.instanceId, entry.models]))}
        triggerAriaLabel="Choose model"
        onInstanceModelChange={() => {}}
        popupAlign="end"
        compactLayout
        effortColumn={
          <EffortSlider label="Effort" options={LEVELS} selection="medium" onCommit={() => {}} />
        }
      />
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "Choose model" });
  await trigger.click();
  await expect.element(page.getByPlaceholder("Search models...")).toBeVisible();
  // Base UI measures the popup with --available-width set to max-content; the column must not
  // grow to the tabs' full width then, or the positioner stays that wide and leaves the trigger.
  await vi.waitFor(() => {
    const positioner = document
      .querySelector("[data-slot=popover-positioner]")!
      .getBoundingClientRect();
    const column = document.querySelector("[data-compact-model-picker]")!.getBoundingClientRect();
    expect(Math.abs(positioner.width - column.width)).toBeLessThanOrEqual(4);
    expect(
      Math.abs(positioner.right - trigger.element().getBoundingClientRect().right),
    ).toBeLessThanOrEqual(2);
  });
});

const speedModels: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "opus",
    name: "Opus",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "effort",
          label: "Reasoning",
          type: "select",
          role: "reasoning",
          currentValue: "high",
          options: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ],
        },
        { id: "fastMode", label: "Fast mode", type: "boolean", currentValue: false },
      ],
    }),
  },
];

it("puts speed in a bolt beside the effort", async () => {
  const onChange = vi.fn();
  function SpeedEffort() {
    const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
    return (
      <CompactPickerEffort
        traits={{
          provider: ProviderDriverKind.make("acpRegistry"),
          instanceId: ProviderInstanceId.make("agent"),
          models: speedModels,
          model: "opus",
          modelOptions: options,
          onModelOptionsChange: (next) => {
            onChange(next ?? []);
            setOptions(next ?? []);
          },
        }}
      />
    );
  }
  await using screen = await render(<SpeedEffort />, { router: false }); // no routes involved
  const bolt = screen.getByRole("button", { name: "Fast mode: Standard" });
  await expect.element(bolt).toHaveAttribute("aria-pressed", "false");
  const slider = () => screen.container.querySelector("[data-effort-slider]");
  expect(slider()?.hasAttribute("data-fast")).toBe(false);
  await bolt.click();
  expect(onChange).toHaveBeenLastCalledWith(
    expect.arrayContaining([{ id: "fastMode", value: true }]),
  );
  await expect
    .element(screen.getByRole("button", { name: "Fast mode: Fast" }))
    .toHaveAttribute("aria-pressed", "true");
  // Light streams through the fill while Fast is on.
  expect(slider()?.hasAttribute("data-fast")).toBe(true);
});

const ultraModels: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "opus",
    name: "Opus",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "effort",
          label: "Reasoning",
          type: "select",
          role: "reasoning",
          currentValue: "high",
          promptInjectedValues: ["ultrathink"],
          options: [
            { id: "low", label: "Low" },
            { id: "high", label: "High" },
            { id: "xhigh", label: "Extra High" },
            { id: "ultrathink", label: "Ultrathink" },
          ],
        },
        { id: "ultracode", label: "Ultracode", type: "boolean" },
      ],
    }),
  },
];

function UltraEffort(props: {
  onChange: (next: ReadonlyArray<ProviderOptionSelection>) => void;
  initial?: ReadonlyArray<ProviderOptionSelection>;
  prompt?: string;
}) {
  const [options, setOptions] = useState(props.initial ?? []);
  const [prompt, setPrompt] = useState(props.prompt ?? "");
  return (
    <>
      <output data-testid="prompt">{prompt}</output>
      <CompactPickerEffort
        traits={{
          provider: ProviderDriverKind.make("claudeAgent"),
          instanceId: ProviderInstanceId.make("claude"),
          models: ultraModels,
          model: "opus",
          modelOptions: options,
          promptUltrathink: /^ultrathink:/i.test(prompt) ? "prefix" : "none",
          onPromptEdit: (edit) => setPrompt(edit),
          onModelOptionsChange: (next) => {
            props.onChange(next ?? []);
            setOptions(next ?? []);
          },
        }}
      />
    </>
  );
}

it("offers Ultracode as the Ultra level and leaves it for any other level", async () => {
  const onChange = vi.fn();
  await using screen = await render(<UltraEffort onChange={onChange} />, { router: false }); // no routes involved
  const slider = screen.getByRole("slider", { name: "Reasoning" });
  // A model never picked before starts on its recommended level.
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  await screen.getByRole("button", { name: "Ultra" }).click();
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      { id: "effort", value: "xhigh" },
      { id: "ultracode", value: true },
    ]),
  );
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Ultra");
  await screen.getByRole("button", { name: "Low" }).click();
  expect(onChange).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      { id: "effort", value: "low" },
      { id: "ultracode", value: false },
    ]),
  );
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Low");
});

it("shows the level Ultracode runs at when it is not Extra High, so Ultra can fix it", async () => {
  const onChange = vi.fn();
  await using screen = await render(
    <UltraEffort
      onChange={onChange}
      initial={[
        { id: "effort", value: "high" },
        { id: "ultracode", value: true },
      ]}
    />,
    { router: false }, // no routes involved
  );
  const slider = screen.getByRole("slider", { name: "Reasoning" });
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  await screen.getByRole("button", { name: "Ultra" }).click();
  expect(onChange).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      { id: "effort", value: "xhigh" },
      { id: "ultracode", value: true },
    ]),
  );
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Ultra");
});

it("drops an Ultrathink prefix when Ultra is picked, as any level pick does", async () => {
  await using screen = await render(
    <UltraEffort onChange={() => {}} prompt="Ultrathink: refactor the parser" />,
    { router: false }, // no routes involved
  );
  await screen.getByRole("button", { name: "Ultra" }).click();
  const prompt = screen.getByTestId("prompt");
  await expect.element(prompt).not.toHaveTextContent("Ultrathink");
  await expect.element(prompt).toHaveTextContent("refactor the parser");
  await expect
    .element(screen.getByRole("slider", { name: "Reasoning" }))
    .toHaveAttribute("aria-valuetext", "Ultra");
});
