import { normalizeSecureRelayUrl } from "@t3tools/shared/relayUrl";

export interface CloudPublicConfig {
  readonly relayUrl: string | null;
}

export function trimNonEmpty(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function resolveCloudPublicConfig(): CloudPublicConfig {
  return {
    relayUrl: normalizeSecureRelayUrl(
      (import.meta.env.VITE_T3CODE_RELAY_URL as string | undefined) ?? "",
    ),
  };
}

/** T3 Connect sign-in was removed with Clerk, so cloud features never turn on. */
export function hasCloudPublicConfig(): boolean {
  return false;
}
