// Clerk was removed, so there is no auth script that can fail to load.
export function clerkLoadFailed() {
  return false;
}

export function retryClerkLoad() {
  window.location.reload();
}
