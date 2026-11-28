import { compareSemverVersions } from "@t3tools/shared/semver";
import { useSyncExternalStore } from "react";

/**
 * P3 Code checks GitHub Releases itself rather than through electron-updater: an ad-hoc signed
 * build cannot install over another (Squirrel.Mac matches the signature's cdhash), so an update is
 * a DMG download the user installs by hand.
 */
const P3_RELEASE_REPOSITORY = "vincent-design-for-me/p3code";
const LATEST_RELEASE_API = `https://api.github.com/repos/${P3_RELEASE_REPOSITORY}/releases/latest`;
const TAG_PREFIX = "p3-v";
/** Uploaded with every release so the README's link always reaches the newest DMG. */
const VERSIONLESS_DMG = "P3-Code-arm64.dmg";

export interface P3Release {
  readonly version: string;
  readonly downloadUrl: string;
  readonly notesUrl: string;
}

export type P3ReleaseCheck =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "up-to-date" }
  | { readonly status: "available"; readonly release: P3Release }
  | { readonly status: "failed"; readonly reason: "rate-limited" | "unavailable" };

/** Reads GitHub's latest-release body, or null when it is not a P3 release with a DMG. */
export function readP3Release(body: unknown): P3Release | null {
  if (typeof body !== "object" || body === null) return null;
  const { tag_name: tag, html_url: notesUrl, assets } = body as Record<string, unknown>;
  if (typeof tag !== "string" || !tag.startsWith(TAG_PREFIX) || typeof notesUrl !== "string") {
    return null;
  }
  const version = tag.slice(TAG_PREFIX.length);
  const urls = new Map<string, string>();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const { name, browser_download_url: url } = (asset ?? {}) as Record<string, unknown>;
    if (typeof name === "string" && typeof url === "string") urls.set(name, url);
  }
  const downloadUrl = urls.get(`P3-Code-${version}-arm64.dmg`) ?? urls.get(VERSIONLESS_DMG);
  return downloadUrl ? { version, downloadUrl, notesUrl } : null;
}

/** Asks GitHub for the latest release. The request carries no identifying data. */
export async function fetchP3ReleaseCheck(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<P3ReleaseCheck> {
  let response: Response;
  try {
    response = await fetchImpl(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
  } catch {
    return { status: "failed", reason: "unavailable" };
  }
  if (response.status === 403 || response.status === 429) {
    return { status: "failed", reason: "rate-limited" };
  }
  // 404 means no release is published yet, which leaves this build the newest.
  if (response.status === 404) return { status: "up-to-date" };
  if (!response.ok) return { status: "failed", reason: "unavailable" };
  const release = readP3Release(await response.json().catch(() => null));
  if (!release) return { status: "failed", reason: "unavailable" };
  return compareSemverVersions(release.version, currentVersion) > 0
    ? { status: "available", release }
    : { status: "up-to-date" };
}

let current: P3ReleaseCheck = { status: "idle" };
let pending: Promise<P3ReleaseCheck> | null = null;
const listeners = new Set<() => void>();

function publish(next: P3ReleaseCheck) {
  current = next;
  for (const listener of listeners) listener();
}

/** Runs one check at a time; settings and the launch check share its result. */
export function checkForP3Release(
  currentVersion: string,
  fetchImpl?: typeof fetch,
): Promise<P3ReleaseCheck> {
  if (pending) return pending;
  publish({ status: "checking" });
  pending = fetchP3ReleaseCheck(currentVersion, fetchImpl).then((result) => {
    pending = null;
    publish(result);
    return result;
  });
  return pending;
}

export function useP3ReleaseCheck(): P3ReleaseCheck {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

const LAUNCH_CHECK_KEY = "p3:check-updates-on-launch";

/** Off by default: P3 Code makes no network request the user did not ask for. */
export function readLaunchCheckPreference(): boolean {
  try {
    return window.localStorage.getItem(LAUNCH_CHECK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLaunchCheckPreference(enabled: boolean) {
  try {
    if (enabled) window.localStorage.setItem(LAUNCH_CHECK_KEY, "1");
    else window.localStorage.removeItem(LAUNCH_CHECK_KEY);
  } catch {}
}
