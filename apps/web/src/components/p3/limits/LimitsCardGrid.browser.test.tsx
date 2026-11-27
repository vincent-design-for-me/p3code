import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../../test/render";
import { UsageLimitsPooled } from "../../usage/UsageLimitsPooled";

const checkedAt = "2026-10-25T16:00:00.000Z";

function window(
  id: string,
  label: string,
  kind: ServerProviderUsageWindow["kind"],
  usedPercent: number,
): ServerProviderUsageWindow {
  return {
    id,
    label,
    kind,
    usedPercent,
    windowDurationMins: kind === "session" ? 300 : 10_080,
    resetsAt: kind === "session" ? "2026-10-25T18:00:00.000Z" : "2026-10-28T16:00:00.000Z",
  };
}

function codex(
  instanceId: string,
  usageLimits: ServerProvider["usageLimits"],
  driver = "codex",
): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make(driver),
    displayName: instanceId,
    enabled: true,
    installed: true,
    version: "0.164.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits,
  };
}

describe("LimitsCardGrid", () => {
  it("opens the shared limit popover from a card's windows", async () => {
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              codex("Work", {
                checkedAt,
                windows: [
                  window("weekly", "Weekly", "weekly", 45),
                  window("5h", "5h", "session", 30),
                ],
                resetCredits: { availableCount: 2 },
              }),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
    );

    await userEvent.hover(screen.getByRole("button", { name: /^Work · 5h: 70% left/ }));
    await expect.element(page.getByText("Even pace")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByText("Even pace")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByRole("button", { name: /^Work · Weekly: 55% left/ }));
    await expect.element(page.getByRole("button", { name: "Use reset" })).toBeVisible();
  });

  it("shows every five-hour window as a chip and the binding weekly as the bar", async () => {
    const full = { ...window("3p-5h", "Claude & GPT (shared) · 5-hour", "session", 0) };
    delete (full as { resetsAt?: string }).resetsAt;
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              codex(
                "Studio",
                {
                  checkedAt,
                  windows: [
                    window("gemini-5h", "Gemini · 5-hour", "session", 25),
                    full,
                    window("gemini-weekly", "Gemini · Weekly", "weekly", 35),
                    window("3p-weekly", "Claude & GPT (shared) · Weekly", "weekly", 8),
                  ],
                },
                "antigravity",
              ),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
    );

    await expect
      .element(screen.getByRole("button", { name: /^Studio · Gemini · 5-hour: 75% left/ }))
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("button", {
          name: /^Studio · Claude & GPT \(shared\) · 5-hour: 100% left$/,
        }),
      )
      .toBeVisible();
    await expect.element(screen.getByText(/^Weekly reset: /)).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /^Studio · Gemini · Weekly: 65% left/ }))
      .toBeVisible();

    await userEvent.hover(
      screen.getByRole("button", { name: /^Studio · Claude & GPT \(shared\) · Weekly: 92% left/ }),
    );
    await expect.element(page.getByText("Even pace")).toBeVisible();
  });
});
