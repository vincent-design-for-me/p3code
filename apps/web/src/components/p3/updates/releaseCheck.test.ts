import { describe, expect, it, vi } from "vite-plus/test";

import { checkForP3Release, fetchP3ReleaseCheck, readP3Release } from "./releaseCheck";

const RELEASE = {
  tag_name: "p3-v0.1.14",
  html_url: "https://github.com/vincent-design-for-me/p3code/releases/tag/p3-v0.1.14",
  assets: [
    { name: "P3-Code-arm64.dmg", browser_download_url: "https://example.test/latest.dmg" },
    { name: "P3-Code-0.1.14-arm64.dmg", browser_download_url: "https://example.test/0.1.14.dmg" },
  ],
};

function respond(status: number, body: unknown = RELEASE) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("readP3Release", () => {
  it("prefers the versioned DMG and falls back to the versionless one", () => {
    expect(readP3Release(RELEASE)).toEqual({
      version: "0.1.14",
      downloadUrl: "https://example.test/0.1.14.dmg",
      notesUrl: RELEASE.html_url,
    });
    expect(readP3Release({ ...RELEASE, assets: [RELEASE.assets[0]] })?.downloadUrl).toBe(
      "https://example.test/latest.dmg",
    );
  });

  it("ignores releases that are not P3 builds or carry no DMG", () => {
    expect(readP3Release({ ...RELEASE, tag_name: "v0.1.14" })).toBeNull();
    expect(readP3Release({ ...RELEASE, assets: [] })).toBeNull();
    expect(readP3Release(null)).toBeNull();
  });
});

describe("fetchP3ReleaseCheck", () => {
  it("offers a newer release and nothing for the same or an older one", async () => {
    await expect(fetchP3ReleaseCheck("0.1.13", respond(200))).resolves.toMatchObject({
      status: "available",
      release: { version: "0.1.14" },
    });
    await expect(fetchP3ReleaseCheck("0.1.14", respond(200))).resolves.toEqual({
      status: "up-to-date",
    });
    await expect(fetchP3ReleaseCheck("0.2.0", respond(200))).resolves.toEqual({
      status: "up-to-date",
    });
  });

  it("asks GitHub's latest release without identifying headers", async () => {
    const fetchImpl = respond(200);
    await fetchP3ReleaseCheck("0.1.13", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/vincent-design-for-me/p3code/releases/latest");
    expect(init?.headers).toEqual({ Accept: "application/vnd.github+json" });
  });

  it("separates rate limits and outages from having nothing new", async () => {
    await expect(fetchP3ReleaseCheck("0.1.13", respond(403))).resolves.toEqual({
      status: "failed",
      reason: "rate-limited",
    });
    await expect(fetchP3ReleaseCheck("0.1.13", respond(500))).resolves.toEqual({
      status: "failed",
      reason: "unavailable",
    });
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchP3ReleaseCheck("0.1.13", offline)).resolves.toEqual({
      status: "failed",
      reason: "unavailable",
    });
    // No release published yet leaves this build the newest.
    await expect(fetchP3ReleaseCheck("0.1.13", respond(404, {}))).resolves.toEqual({
      status: "up-to-date",
    });
  });
});

describe("checkForP3Release", () => {
  it("shares one request between callers that ask at once", async () => {
    const fetchImpl = respond(200);
    const [first, second] = await Promise.all([
      checkForP3Release("0.1.13", fetchImpl),
      checkForP3Release("0.1.13", fetchImpl),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});
