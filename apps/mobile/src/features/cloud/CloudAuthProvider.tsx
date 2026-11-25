import type { ReactNode } from "react";

import { deactivateCloudRelayAccount } from "./cloudAccountService";

// This build has no Clerk, so no cloud account can ever activate. Drop anything a
// previous build with cloud enabled left registered.
deactivateCloudRelayAccount();

/** Cloud sign-in is unavailable in this build: always loaded and signed out. */
export function cloudAuth(_options?: { readonly treatPendingAsSignedOut?: boolean }) {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    userId: null as string | null,
    getToken: async (_options?: unknown): Promise<string | null> => null,
  };
}

export function cloudUser() {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    user: null as {
      readonly primaryEmailAddress?: { readonly emailAddress?: string } | null;
      readonly fullName?: string | null;
      readonly username?: string | null;
      readonly imageUrl?: string | null;
    } | null,
  };
}

export function CloudAuthProvider(props: { readonly children: ReactNode }) {
  return props.children;
}
