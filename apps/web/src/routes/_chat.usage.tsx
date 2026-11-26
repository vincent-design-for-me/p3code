import { createFileRoute } from "@tanstack/react-router";

import { UsagePage } from "../components/usage/UsagePage";
import { usageSearchFromUrl } from "../components/p3/usage/usageView";

export const Route = createFileRoute("/_chat/usage")({
  validateSearch: usageSearchFromUrl,
  component: UsagePage,
});
