// T3 Connect sign-in needs Clerk, which this build does not include. The route stays registered so
// an old deep link lands somewhere, but it renders nothing and no screen links here.
export function SettingsAuthRouteScreen() {
  return null;
}
