import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { promptLinkFor } from "./copyPromptLink";

describe("promptLinkFor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("copies the app's deep link, never the upstream hosted app, without a hosted app", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "");

    const link = promptLinkFor("Fix the flaky test");
    expect(link).not.toBeNull();
    expect(link).not.toContain("app.t3.codes");
    expect(link).toMatch(/^p3code:\/\/new\?prompt=/);
  });

  it("copies a link to this build's hosted app when it has one", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://hosted.example");

    expect(promptLinkFor("Fix the flaky test")).toMatch(/^https:\/\/hosted\.example\/new\?prompt=/);
  });
});
