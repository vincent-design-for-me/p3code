#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot CI check; synchronous Node APIs keep it small.
// Fails when product analytics, crash reporting, or telemetry export comes back, e.g. through an
// upstream merge. Run after every merge from pingdotgg/t3code: `vp run check:no-telemetry`.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";

const files = NodeChildProcess.execFileSync("git", ["ls-files", "-z", "--", ".", ":!.repos"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter((file) => file !== "" && NodeFS.existsSync(file));

const removedPaths = [
  "apps/server/src/telemetry/",
  "apps/server/src/feedback/",
  "apps/server/src/mcp/toolkits/feedback/",
  "apps/server/src/cloud/relayTracing.ts",
  "apps/server/src/observability/OtlpEndpointCheck.ts",
  "apps/mobile/src/features/observability/",
  "infra/relay/src/mobileTelemetry/",
  "packages/shared/src/otelEnvironment.ts",
  "packages/shared/src/relayTracing.ts",
  "packages/shared/src/telemetryId.ts",
  "packages/shared/src/mobileSourceMaps.ts",
];

const forbiddenDependencies =
  /"(posthog[\w-]*|@sentry\/[\w-]+|@opentelemetry\/[\w-]+|expo-observe|@axiomhq\/[\w-]+|@alchemy\.run\/axiom)"\s*:/;
// Clients sign in to nothing; only the relay (T3's own server code under infra/) still uses Clerk.
const forbiddenClientDependency = /"(@clerk\/[\w-]+)"\s*:/;

const forbiddenSource: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  { pattern: /ingest\.t3\.codes|phc_[A-Za-z0-9]{20,}/, why: "PostHog endpoint or key" },
  { pattern: /api\.axiom\.co|axiom\.co\/v1/, why: "Axiom endpoint" },
  { pattern: /"feedback\/upload"/, why: "Codex feedback upload" },
  {
    pattern: /raw\.githubusercontent\.com\/pingdotgg\/t3code/,
    why: "background model manifest fetch",
  },
  { pattern: /registry\.npmjs\.org\/t3\b/, why: "official npm `t3` lookup" },
  { pattern: /u\.expo\.dev/, why: "Expo over-the-air updates" },
  {
    pattern: /from "effect\/observability\/Otlp(Exporter|Metrics|Logger)"|\bOtlp(Metrics|Logger)\./,
    why: "OTLP exporter",
  },
];

// Browser spans go to this machine's own server, which writes them to its local trace file.
const allowedOtlpExporters = new Set(["apps/web/src/observability/clientTracing.ts"]);
// Model-facing text the user runs on demand; changing it needs the evals in evals/README.md.
const allowedModelFacingFiles = new Set(["apps/server/src/triage/triagePrompt.ts"]);

const problems: Array<string> = [];
for (const file of files) {
  for (const removed of removedPaths) {
    if (file === removed || file.startsWith(removed))
      problems.push(`${file}: removed module is back`);
  }
  if (file.endsWith("package.json")) {
    const match = forbiddenDependencies.exec(NodeFS.readFileSync(file, "utf8"));
    if (match) problems.push(`${file}: telemetry dependency ${match[1]}`);
    const clerk = file.startsWith("infra/")
      ? null
      : forbiddenClientDependency.exec(NodeFS.readFileSync(file, "utf8"));
    if (clerk) problems.push(`${file}: sign-in dependency ${clerk[1]}`);
    continue;
  }
  if (!/\.(ts|tsx|mts|mjs|js)$/.test(file) || /\.test\.|\/_generated\//.test(file)) continue;
  const text = NodeFS.readFileSync(file, "utf8");
  for (const { pattern, why } of forbiddenSource) {
    if (why === "OTLP exporter" && allowedOtlpExporters.has(file)) continue;
    if (allowedModelFacingFiles.has(file)) continue;
    if (pattern.test(text)) problems.push(`${file}: ${why}`);
  }
}

if (problems.length > 0) {
  console.error(`Telemetry came back (${problems.length}):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`No telemetry found in ${files.length} tracked files.`);
