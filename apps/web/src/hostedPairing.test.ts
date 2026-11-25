import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildHostedChannelSelectionUrl,
  buildHostedPairingUrl,
  configuredHostedAppUrl,
  hasHostedPairingRequest,
  isHostedStaticApp,
  readHostedPairingRequest,
} from "./hostedPairing";

describe("hostedPairing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads hosted pairing host and query token parameters", () => {
    const url = new URL("https://app.t3.codes/pair?host=100.64.1.2:3773&token=ABCD1234");

    expect(readHostedPairingRequest(url)).toEqual({
      host: "100.64.1.2:3773",
      token: "ABCD1234",
      label: "",
    });
    expect(hasHostedPairingRequest(url)).toBe(true);
  });

  it("prefers hash tokens so generated hosted links do not put credentials in search params", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.t3.codes");

    const built = buildHostedPairingUrl({
      host: "https://backend.example.com:3773",
      token: "pairing-token",
      label: "Workstation",
    });
    expect(built).not.toBeNull();
    const url = new URL(built ?? "");

    expect(url.origin).toBe("https://preview.t3.codes");
    expect(url.pathname).toBe("/pair");
    expect(url.searchParams.get("host")).toBe("https://backend.example.com:3773");
    expect(url.searchParams.get("label")).toBe("Workstation");
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.hash).toBe("#token=pairing-token");
  });

  it("builds no hosted links and is never the hosted app when this build configures none", () => {
    vi.stubEnv("VITE_HOSTED_APP_URL", "");
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "latest");

    expect(configuredHostedAppUrl()).toBeNull();
    expect(
      buildHostedPairingUrl({ host: "https://backend.example.com:3773", token: "pairing-token" }),
    ).toBeNull();
    expect(buildHostedChannelSelectionUrl({ channel: "nightly" })).toBeNull();
    expect(isHostedStaticApp(new URL("https://app.t3.codes/pair"))).toBe(false);
  });
});
