<p align="center">
  <img src="./assets/prod/t3-black-web-icon-192x192.png" width="80" height="80" alt="P3 Code logo" />
</p>

<h1 align="center">P3 Code</h1>

<p align="center">A private, telemetry-free control plane for coding agents.</p>

> **P3 Code is an unofficial fork of the [T3 Code](https://github.com/pingdotgg/t3code) source code.**
> It is not affiliated with, endorsed by, or maintained by T3 Tools, Inc. "T3 Code" and its logos are
> trademarks of T3 Tools, Inc.; see [TRADEMARK.md](./TRADEMARK.md).

P3 Code runs the coding agents on your machine and gives them one fast interface: Claude Code,
Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, fx, and any
[ACP](./docs/user/providers-acp.md) agent.

## Private by default

- **No telemetry.** No product analytics, usage statistics, crash reports, or traces are sent
  anywhere. `vp run check:no-telemetry` fails the build if any of it comes back.
- **No phone-home.** The model list ships with the app, prices for the Usage page and agent
  version checks are fetched only when you ask, and nothing points at T3's hosted services.
- **Agents are told to stay quiet too.** Agent CLIs start with `DO_NOT_TRACK=1` and their own
  telemetry opt-outs.
- **Separate from T3 Code.** P3 Code keeps its data in `~/.p3` with its own app identity, so it
  can sit next to an installed T3 Code without sharing a database.

[Network calls](./docs/user/network-calls.md) lists everything that can still leave your machine.

## Install on macOS

Download the latest `P3-Code-*-arm64.dmg` (Apple Silicon) from
[Releases](https://github.com/vincent-design-for-me/p3code/releases), open it, and drag
**P3 Code** to Applications.

The app is not signed with an Apple Developer ID, so macOS may say it "is damaged and can't be
opened" the first time. Clear the download quarantine once, then open it as usual:

```sh
xattr -dr com.apple.quarantine "/Applications/P3 Code.app"
```

P3 Code does not update itself. Download a newer release, or build from source, to update.

## Build from source

```sh
curl -fsSL https://vite.plus | bash
vp i
vp run dev
```

See the [development runbook](./docs/operations/00_development.md#first-checkout) and the
[architecture overview](./docs/internals/01_architecture.md).

## Staying in sync with upstream

P3 Code tracks T3 Code closely so upstream fixes keep flowing in. Changes here stay small and
local: telemetry is removed outright, and the brand lives in a few central places.

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git   # once
git fetch upstream && git merge upstream/main
vp run check:no-telemetry
```

## Documentation

- [Install and first run](./docs/user/install.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Permission modes](./docs/user/permission-modes.md)
- [FAQ](./docs/user/faq.md)

[All docs](./docs/README.md) has the full list. Upstream docs still say "T3 Code" in many places.

## License

The source code is licensed under the [MIT License](./LICENSE), which keeps the original
copyright notice of T3 Tools, Inc.
