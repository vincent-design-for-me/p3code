import { expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { render, stubGlobal } from "../../../../test/render";
import { P3UpdateButton, P3UpdateDescription } from "./P3Updates";

const RELEASE = {
  tag_name: "p3-v99.0.0",
  html_url: "https://github.com/vincent-design-for-me/p3code/releases/tag/p3-v99.0.0",
  assets: [
    { name: "P3-Code-99.0.0-arm64.dmg", browser_download_url: "https://example.test/p3.dmg" },
  ],
};

it("checks GitHub on request and downloads the newer DMG it finds", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(RELEASE)));
  using _fetch = stubGlobal("fetch", fetchImpl);
  const openExternal = vi.fn(async () => true);
  using _bridge = stubGlobal("desktopBridge", { openExternal });
  const onCheck = vi.fn();
  await using screen = await render(
    <div>
      <P3UpdateDescription />
      <P3UpdateButton onCheck={onCheck} />
    </div>,
    { router: false }, // no routes involved
  );
  expect(fetchImpl).not.toHaveBeenCalled();

  await screen.getByRole("button", { name: "Check for Updates" }).click();
  await expect.element(screen.getByRole("button", { name: "Download 99.0.0" })).toBeVisible();
  expect(onCheck).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByText("P3 Code 99.0.0 is available.", { exact: false }))
    .toBeVisible();

  await screen.getByRole("button", { name: "Download 99.0.0" }).click();
  expect(openExternal).toHaveBeenCalledWith("https://example.test/p3.dmg");
  await screen.getByRole("button", { name: "What's new" }).click();
  expect(openExternal).toHaveBeenLastCalledWith(RELEASE.html_url);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
