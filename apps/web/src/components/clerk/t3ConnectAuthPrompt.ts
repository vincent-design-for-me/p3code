// T3 Connect sign-in was removed with Clerk; nothing opens.
export function t3ConnectAuthPrompt() {
  return { openAuthPrompt: () => {} };
}
