import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { hasCloudPublicConfig, resolveCloudPublicConfig } from "./publicConfig.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hasCloudPublicConfig", () => {
  it("stays off even when a build sets the old Clerk and relay variables", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", `pk_live_${btoa("clerk.example.com$")}`);
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
    vi.stubEnv("VITE_T3CODE_RELAY_URL", "https://relay.example.test");
    vi.stubGlobal("window", { location: new URL("https://example.com") });

    expect(hasCloudPublicConfig()).toBe(false);
  });
});

describe("resolveCloudPublicConfig", () => {
  it("rejects an insecure relay URL", () => {
    vi.stubEnv("VITE_T3CODE_RELAY_URL", "http://relay.example.test");

    expect(resolveCloudPublicConfig().relayUrl).toBeNull();
  });
});
