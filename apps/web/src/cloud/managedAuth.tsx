/** T3 Connect sign-in was removed with Clerk, so cloud auth is permanently signed out. */
export function cloudAuth(_options?: { readonly treatPendingAsSignedOut?: boolean }) {
  return {
    isLoaded: true as const,
    isSignedIn: false as const,
    userId: null as string | null,
    getToken: async (_options?: unknown): Promise<string | null> => null,
  };
}

export function cloudClient() {
  return {
    status: "ready" as const,
    session: null,
    openSignIn: (_props?: unknown) => {},
    signOut: async (_options?: unknown) => {},
    openUserProfile: (_props?: unknown) => {},
  };
}
