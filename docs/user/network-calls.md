# Network calls

P3 Code sends no product analytics, usage statistics, crash reports, or traces anywhere, and it
does not contact anything in the background. How you use the app stays on your machine.

These are the only things that leave it, and each one happens because you started it:

- **Your providers.** Prompts, replies, and file context go to the agents and model providers you
  set up (Anthropic, OpenAI, a local server, and so on), under their own privacy policies. Agent
  CLIs start with `DO_NOT_TRACK=1` and their own telemetry opt-outs. A value you set yourself wins.
- **Usage prices.** **Refresh** on the Usage page downloads the model price table from GitHub.
  Otherwise the page prices with the last table you downloaded.
- **Agent update checks.** Off by default. Turn on **Provider update checks** in
  **Settings > Maintenance** to have P3 Code ask each agent's release server (such as
  `releases.openai.com` and `downloads.claude.ai`) or your npm registry for newer agent CLIs.
- **Installing the P3 Code runtime.** `t3 service install`, `t3 update`, and starting P3 Code on an
  SSH host download the runtime from this fork's GitHub releases. Set `T3CODE_RELEASE_BASE_URL` to
  use another source.

The model list ships with the app. T3 Connect is not available, and links you copy (threads,
prompts, pairing) point at your own server or open the installed app, never a hosted website.
Desktop builds check for app updates only when the build includes an update feed; set
`T3CODE_DISABLE_AUTO_UPDATE=1` to turn that off. The mobile app never checks for over-the-air
updates.

Logs, trace files (`server.trace.ndjson`, `desktop.trace.ndjson`), crash details shown in
**Settings > Diagnostics**, and resource history stay on your devices until you copy them yourself.
