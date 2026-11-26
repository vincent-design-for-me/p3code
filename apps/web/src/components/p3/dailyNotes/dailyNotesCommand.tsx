import type { useNavigate } from "@tanstack/react-router";
import { msg, type useMessages } from "gt-react";
import { CalendarDaysIcon } from "lucide-react";

import { ITEM_ICON_CLASS, type CommandPaletteActionItem } from "../../CommandPalette.logic";

const TITLE = msg("Open daily notes");

export function dailyNotesCommandItem(
  resolve: ReturnType<typeof useMessages>,
  navigate: ReturnType<typeof useNavigate>,
): CommandPaletteActionItem {
  return {
    kind: "action",
    value: "action:daily-notes",
    searchTerms: ["daily", "notes", "journal", "today", "sessions", "calendar"],
    title: resolve(TITLE),
    icon: <CalendarDaysIcon className={ITEM_ICON_CLASS} />,
    run: async () => {
      await navigate({ to: "/daily-notes", search: { project: undefined } });
    },
  };
}
