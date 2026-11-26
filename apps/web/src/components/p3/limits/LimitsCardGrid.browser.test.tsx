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

function codex(instanceId: string, usageLimits: ServerProvider["usageLimits"]): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
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
});
