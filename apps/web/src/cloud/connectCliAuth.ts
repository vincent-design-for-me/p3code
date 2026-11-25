import type { ConnectAuthorizeRequest } from "@t3tools/shared/connectAuth";

// T3 Connect sign-in was removed with Clerk, so the hosted CLI sign-in route never opens.
export function connectCliAuthRoutesEnabled(): boolean {
  return false;
}

export function buildConnectCliClerkAuthorizeUrl(_request: ConnectAuthorizeRequest): string | null {
  return null;
}

export function connectCliSignInRedirectUrl(
  _request: ConnectAuthorizeRequest,
  currentHref: string,
): string {
  return currentHref;
}
