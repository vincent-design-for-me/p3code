import { createFileRoute } from "@tanstack/react-router";

import { DailyNotesPage } from "../components/p3/dailyNotes/DailyNotesPage";
import { dailyNotesSearchFromUrl } from "../components/p3/dailyNotes/dailyNotes.logic";

export const Route = createFileRoute("/_chat/daily-notes")({
  validateSearch: dailyNotesSearchFromUrl,
  component: DailyNotesPage,
});
