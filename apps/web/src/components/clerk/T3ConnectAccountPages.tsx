import type { ReactNode } from "react";

export type T3ConnectAccountPageUrl = "mobile-clients" | "t3-connect" | "t3-chat";

/** T3 Connect accounts were removed with Clerk, so the account pages never open. */
export function t3ConnectAccountPage(): {
  readonly open: ((page?: T3ConnectAccountPageUrl) => void) | null;
  readonly portals: ReactNode;
} {
  return { open: null, portals: null };
}
