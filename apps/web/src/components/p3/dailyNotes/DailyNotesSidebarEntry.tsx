import type { ScopedThreadRef } from "@t3tools/contracts";
import { Link, useLocation } from "@tanstack/react-router";
import { T } from "gt-react";
import { CalendarDaysIcon } from "lucide-react";

import { useQuietThreadShell } from "../../../state/entities";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "../../ui/sidebar";
import { dailyNotesEntryProjectKey, type DailyNotesProjectGroup } from "./dailyNotes.logic";

export function DailyNotesSidebarEntry(props: {
  scopedProjectGroups: ReadonlyArray<DailyNotesProjectGroup>;
  projectGroups: ReadonlyArray<DailyNotesProjectGroup>;
  routeThreadRef: ScopedThreadRef | null;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = useLocation({ select: (location) => location.pathname === "/daily-notes" });
  const thread = useQuietThreadShell(props.routeThreadRef);
  const project = dailyNotesEntryProjectKey({
    scopedProjectKey: props.scopedProjectGroups[0]?.projectKey,
    groups: props.projectGroups,
    thread,
  });
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          render={
            <Link
              to="/daily-notes"
              search={{ project }}
              onClick={(event) => {
                if (isMobile) setOpenMobile(false);
                // Keeps the project already picked on the page.
                if (active) event.preventDefault();
              }}
            />
          }
        >
          <CalendarDaysIcon />
          <span>
            <T>Daily notes</T>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
