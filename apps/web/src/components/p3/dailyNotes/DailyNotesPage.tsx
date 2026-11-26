import type { TimestampFormat } from "@t3tools/contracts/settings";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { msg, T, useGT, useLocale, useMessages } from "gt-react";
import {
  AlarmClockIcon,
  CalendarDaysIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotDashedIcon,
  CircleIcon,
  ClockIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useNowMinute } from "../../../hooks/useNowMinute";
import { usePrimarySettings } from "../../../hooks/useSettings";
import { useSidebarProjectGroups } from "../../../hooks/useSidebarProjectGroups";
import { useDelegatedUnderParent, useQuietThreadShells } from "../../../state/entities";
import { formatShortTimestamp } from "../../../timestampFormat";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { SidebarInset } from "../../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { WorkspacePageHeader } from "../../WorkspacePageHeader";
import {
  buildDailyNotesProjects,
  groupDailyNotes,
  localDayDate,
  localDayKey,
  selectDailyNotesProject,
  type DailyNoteRow,
  type DailyNoteStatus,
} from "./dailyNotes.logic";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

const STATUS_PRESENTATION: Record<
  DailyNoteStatus,
  { readonly label: string; readonly icon: LucideIcon; readonly className: string }
> = {
  open: {
    label: msg("Open", { $context: "thread status" }),
    icon: CircleIcon,
    className: "text-muted-foreground",
  },
  working: {
    label: msg("Working", { $context: "thread status" }),
    icon: CircleDotDashedIcon,
    className: "text-foreground",
  },
  waiting: {
    label: msg("Waiting", { $context: "thread status" }),
    icon: ClockIcon,
    className: "text-warning-foreground",
  },
  done: {
    label: msg("Done", { $context: "thread status" }),
    icon: CircleCheckIcon,
    className: "text-muted-foreground",
  },
  failed: {
    label: msg("Failed", { $context: "thread status" }),
    icon: CircleAlertIcon,
    className: "text-error-foreground",
  },
  snoozed: {
    label: msg("Snoozed", { $context: "thread status" }),
    icon: AlarmClockIcon,
    className: "text-muted-foreground",
  },
};

export function DailyNotesPage() {
  const gt = useGT();
  const locale = useLocale();
  const navigate = useNavigate();
  const { project: projectKey } = useSearch({ from: "/_chat/daily-notes" });
  const projectGroups = useSidebarProjectGroups();
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const now = Date.parse(`${useNowMinute()}:00.000Z`);
  const [openOnly, setOpenOnly] = useState(false);

  const projects = buildDailyNotesProjects(projectGroups, threads, delegatedUnderParent);
  const selected = selectDailyNotesProject(projects, projectKey);
  const days = groupDailyNotes(selected?.threads ?? [], now, openOnly);
  const today = localDayKey(now);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const projectLabel = (displayName: string | null) => displayName ?? gt("No project");

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
          <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">
            <T>Daily notes</T>
          </span>
        </h1>
        {selected === undefined ? null : (
          <div className="min-w-0 max-w-[min(40vw,18rem)]">
            <Select
              value={selected.key}
              onValueChange={(value) => {
                if (value === null) return;
                void navigate({ to: "/daily-notes", search: { project: value }, replace: true });
              }}
            >
              <SelectTrigger size="sm" aria-label={gt("Project")}>
                <SelectValue>{projectLabel(selected.displayName)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {projects.map((project) => (
                  <SelectItem key={project.key} value={project.key}>
                    {projectLabel(project.displayName)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        )}
        <Label className="shrink-0 cursor-pointer whitespace-nowrap [-webkit-app-region:no-drag]">
          <Checkbox checked={openOnly} onCheckedChange={(checked) => setOpenOnly(checked)} />
          <T>Open only</T>
        </Label>
      </WorkspacePageHeader>
      <div className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-8">
          {days.map(({ day, rows }) => (
            <section key={day} aria-labelledby={`daily-notes-${day}`}>
              <h2
                id={`daily-notes-${day}`}
                className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold"
              >
                {day === today ? (
                  <>
                    {gt("Today")}
                    <span className="text-xs font-normal text-muted-foreground">
                      {dateFormat.format(localDayDate(day))}
                    </span>
                  </>
                ) : (
                  dateFormat.format(localDayDate(day))
                )}
              </h2>
              {rows.length === 0 ? (
                <p className="py-1.5 text-sm text-muted-foreground">
                  <T>No sessions today</T>
                </p>
              ) : (
                <ul className="flex flex-col">
                  {rows.map((row) => (
                    <DailyNotesRow
                      key={`${row.thread.environmentId}:${row.thread.id}`}
                      row={row}
                      timestampFormat={timestampFormat}
                      locale={locale}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}

function DailyNotesRow({
  row,
  timestampFormat,
  locale,
}: {
  row: DailyNoteRow<EnvironmentThreadShell>;
  timestampFormat: TimestampFormat;
  locale: string;
}) {
  const gt = useGT();
  const m = useMessages();
  const { thread, status } = row;
  const presentation = STATUS_PRESENTATION[status];
  const StatusIcon = presentation.icon;
  const done = status === "done";
  return (
    <li>
      <Link
        to="/$environmentId/$threadId"
        params={{ environmentId: thread.environmentId, threadId: thread.id }}
        className="grid min-h-9 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted/75 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <StatusIcon className={cn("size-4", presentation.className)} aria-hidden />
        <span className={cn("wrap-anywhere", done && "text-muted-foreground line-through")}>
          {thread.title.trim() || gt("New thread")}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={<span className={cn("whitespace-nowrap text-xs", presentation.className)} />}
          >
            {m(presentation.label)}
          </TooltipTrigger>
          <TooltipPopup side="top">
            {formatShortTimestamp(new Date(row.activityAt).toISOString(), timestampFormat, locale)}
          </TooltipPopup>
        </Tooltip>
      </Link>
    </li>
  );
}
