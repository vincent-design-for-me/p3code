import { GTProvider, Var, msg } from "gt-react";
import type { ComponentProps } from "react";
import { expect, it } from "vite-plus/test";

import zh from "../../../i18n/translations/zh.json";
import { render } from "../../../../test/render";
import { brandCatalog } from "./brandCopy";
import { T, useGT, useMessages } from "./gtReactBranded";

const FULL_DISK_ACCESS =
  "Give T3 Code Full Disk Access in System Settings → Privacy & Security, then retry.";
const FULL_DISK_ACCESS_MSG = msg(FULL_DISK_ACCESS);
const brandedZh = { zh: brandCatalog(zh) } as unknown as ComponentProps<
  typeof GTProvider
>["translations"];

function Probe() {
  const gt = useGT();
  const messages = useMessages();
  return (
    <div>
      <p data-testid="t">
        <T>
          Open <code>t3</code> in T3 Code. <Var>{"T3 Code thread title"}</Var>
        </T>
      </p>
      <p data-testid="template">{gt(FULL_DISK_ACCESS)}</p>
      <p data-testid="interpolated">{gt("Welcome to T3 Code, {name}", { name: "T3 Code fan" })}</p>
      <p data-testid="msg">{messages(FULL_DISK_ACCESS_MSG)}</p>
    </div>
  );
}

function textOf(screen: { getByTestId: (id: string) => { element: () => Element } }, id: string) {
  return screen.getByTestId(id).element().textContent ?? "";
}

it("shows P3 Code in English source copy but keeps variables and the t3 command", async () => {
  await using screen = await render(
    <GTProvider locale="en" translations={{ en: {} }}>
      <Probe />
    </GTProvider>,
    { router: false }, // no routes involved
  );
  expect(textOf(screen, "t")).toBe("Open t3 in P3 Code. T3 Code thread title");
  expect(textOf(screen, "template")).toBe(
    "Give P3 Code Full Disk Access in System Settings → Privacy & Security, then retry.",
  );
  expect(textOf(screen, "interpolated")).toBe("Welcome to P3 Code, T3 Code fan");
  expect(textOf(screen, "msg")).toBe(
    "Give P3 Code Full Disk Access in System Settings → Privacy & Security, then retry.",
  );
});

it("finds translations by the upstream English and shows P3 Code in them", async () => {
  await using screen = await render(
    <GTProvider locale="zh" translations={brandedZh}>
      <Probe />
    </GTProvider>,
    { router: false }, // no routes involved
  );
  for (const id of ["template", "msg"]) {
    expect(textOf(screen, id)).toBe(
      "请在“系统设置”→“隐私与安全性”中授予 P3 Code 完全磁盘访问权限，然后重试。",
    );
  }
});
