# Network calls

T3 Code sends no product analytics, usage statistics, crash reports, or traces anywhere. How you
use the app stays on your machine.

These are the only things that leave it:

- **Your providers.** Prompts, replies, and file context go to the agents and model providers you
  set up (Anthropic, OpenAI, a local server, and so on), under their own privacy policies. T3 Code
  starts each agent CLI with `DO_NOT_TRACK=1` and the agent's own telemetry opt-outs, so the CLIs
  do not report on you either. A value you set yourself wins.
- **T3 Connect, if you sign in.** Signing in goes through Clerk, and remote access goes through the
  T3 Connect relay. **Publish agent activity** is off unless you turn it on; it sends project and
  thread titles, model names, and activity status to the relay for
  [mobile notifications](./mobile-notifications.md).
- **Model list and prices.** The server refreshes its model list and the price table behind the
  Usage page from GitHub. These requests carry nothing about you or your work.
- **Update checks.** **Provider update checks** in **Settings > Maintenance** ask each agent's
  release server (such as `releases.openai.com` and `downloads.claude.ai`) or your npm registry for
  newer agent CLIs; turn them off there. The desktop app checks for its own updates only when
  the build includes an update feed. Set `T3CODE_DISABLE_AUTO_UPDATE=1` to turn that off too.
- **Mobile app updates** come from Expo.

Logs, trace files (`server.trace.ndjson`, `desktop.trace.ndjson`), crash details shown in
**Settings > Diagnostics**, and resource history stay on your devices until you copy them yourself.
