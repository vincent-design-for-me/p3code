import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { pickableProjectGroups } from "@t3tools/client-runtime/state/project-grouping";
import {
  effectiveSnoozed,
  type ThreadSnoozeShell,
} from "@t3tools/client-runtime/state/thread-settled";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";

import type { SidebarProjectSnapshot } from "../../../sidebarProjectGrouping";

export type DailyNoteStatus = "open" | "working" | "waiting" | "done" | "failed" | "snoozed";

export type DailyNoteThread = ThreadSnoozeShell &
  Pick<
    EnvironmentThreadShell,
    | "environmentId"
    | "id"
    | "projectId"
    | "title"
    | "lineage"
    | "archivedAt"
    | "deletedAt"
    | "runtime"
    | "latestRun"
    | "blockedOnThreadWait"
    | "settledOverride"
    | "latestUserAuthoredMessageAt"
    | "latestUserMessageAt"
    | "createdAt"
    | "updatedAt"
  >;

export type DailyNotesProjectGroup = Pick<
  SidebarProjectSnapshot,
  "projectKey" | "displayName" | "memberProjectRefs" | "archived" | "pinned"
>;

export const DAILY_NOTES_NO_PROJECT_KEY = "unassigned";

export interface DailyNotesProject<T> {
  readonly key: string;
  /** Null for the bucket of threads whose project is not listed. */
  readonly displayName: string | null;
  readonly threads: ReadonlyArray<T>;
}

export interface DailyNoteRow<T> {
  readonly thread: T;
  readonly activityAt: number;
  readonly status: DailyNoteStatus;
}

export interface DailyNoteDay<T> {
  readonly day: string;
  readonly rows: ReadonlyArray<DailyNoteRow<T>>;
}

const WORKING_STATUSES = new Set(["preparing", "queued", "starting", "running"]);

export function dailyNoteStatus(thread: DailyNoteThread, now: number): DailyNoteStatus {
  const status = thread.runtime?.status ?? thread.latestRun?.status;
  if (
    thread.hasPendingApprovals ||
    thread.hasPendingUserInput ||
    thread.pendingSubagentRequest != null ||
    thread.blockedOnThreadWait === true ||
    status === "waiting"
  ) {
    return "waiting";
  }
  if (status !== undefined && WORKING_STATUSES.has(status)) return "working";
  if (thread.settledOverride === "settled") return "done";
  if (effectiveSnoozed(thread, { now: new Date(now).toISOString() })) return "snoozed";
  if (status === "failed") return "failed";
  return "open";
}

/** `YYYY-MM-DD` of the local calendar day, so keys sort chronologically as strings. */
export function localDayKey(at: number): string {
  const date = new Date(at);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

/** Noon of the key's local day, which no DST shift moves to another date. */
export function localDayDate(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

export function dailyNoteActivityAt(thread: DailyNoteThread): number | null {
  const at = Date.parse(
    thread.latestUserAuthoredMessageAt ??
      thread.latestUserMessageAt ??
      thread.latestRun?.requestedAt ??
      thread.createdAt ??
      thread.updatedAt,
  );
  return Number.isFinite(at) ? at : null;
}

/** Rows the sidebar lists: not archived, deleted, or shown inside a parent thread. */
function isListedThread(thread: DailyNoteThread, delegatedUnderParent: ReadonlySet<string>) {
  return (
    thread.archivedAt === null &&
    thread.deletedAt === null &&
    !isShownUnderParent(
      { environmentId: thread.environmentId, threadId: thread.id },
      thread.lineage,
      delegatedUnderParent,
    )
  );
}

/** Projects in picker order, plus a "No project" bucket when threads fall outside them. */
export function buildDailyNotesProjects<T extends DailyNoteThread>(
  groups: ReadonlyArray<DailyNotesProjectGroup>,
  threads: ReadonlyArray<T>,
  delegatedUnderParent: ReadonlySet<string>,
): ReadonlyArray<DailyNotesProject<T>> {
  const groupByMember = new Map<string, DailyNotesProjectGroup>();
  for (const group of groups) {
    for (const ref of group.memberProjectRefs) {
      groupByMember.set(`${ref.environmentId}:${ref.projectId}`, group);
    }
  }
  const threadsByKey = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const thread of threads) {
    if (!isListedThread(thread, delegatedUnderParent)) continue;
    const group = groupByMember.get(`${thread.environmentId}:${thread.projectId}`);
    if (group === undefined) {
      unassigned.push(thread);
      continue;
    }
    const list = threadsByKey.get(group.projectKey);
    if (list === undefined) threadsByKey.set(group.projectKey, [thread]);
    else list.push(thread);
  }
  const projects: DailyNotesProject<T>[] = pickableProjectGroups(groups).map((group) => ({
    key: group.projectKey,
    displayName: group.displayName,
    threads: threadsByKey.get(group.projectKey) ?? [],
  }));
  if (unassigned.length > 0 || projects.length === 0) {
    projects.push({ key: DAILY_NOTES_NO_PROJECT_KEY, displayName: null, threads: unassigned });
  }
  return projects;
}

export function selectDailyNotesProject<T>(
  projects: ReadonlyArray<DailyNotesProject<T>>,
  key: string | undefined,
): DailyNotesProject<T> | undefined {
  return (
    projects.find((project) => project.key === key) ??
    projects.find((project) => project.threads.length > 0) ??
    projects[0]
  );
}

/** Days newest first, today always included; rows newest first within each day. */
export function groupDailyNotes<T extends DailyNoteThread>(
  threads: ReadonlyArray<T>,
  now: number,
  openOnly: boolean,
): ReadonlyArray<DailyNoteDay<T>> {
  const days = new Map<string, DailyNoteRow<T>[]>([[localDayKey(now), []]]);
  for (const thread of threads) {
    const activityAt = dailyNoteActivityAt(thread);
    if (activityAt === null) continue;
    const status = dailyNoteStatus(thread, now);
    if (openOnly && status === "done") continue;
    const day = localDayKey(activityAt);
    const rows = days.get(day);
    const row = { thread, activityAt, status };
    if (rows === undefined) days.set(day, [row]);
    else rows.push(row);
  }
  return [...days]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([day, rows]) => ({
      day,
      rows: rows.toSorted((a, b) => b.activityAt - a.activityAt),
    }));
}

/** The project the sidebar entry opens: the scoped project, else the shown thread's. */
export function dailyNotesEntryProjectKey(input: {
  readonly scopedProjectKey: string | undefined;
  readonly groups: ReadonlyArray<DailyNotesProjectGroup>;
  readonly thread: Pick<DailyNoteThread, "environmentId" | "projectId"> | null;
}): string | undefined {
  if (input.scopedProjectKey !== undefined) return input.scopedProjectKey;
  const { thread } = input;
  if (thread === null) return undefined;
  return input.groups.find((group) =>
    group.memberProjectRefs.some(
      (ref) => ref.environmentId === thread.environmentId && ref.projectId === thread.projectId,
    ),
  )?.projectKey;
}

export interface DailyNotesSearch {
  readonly project?: string | undefined;
}

// `project` stays an own key even when undefined: the router lays validated search over the
// parent route's raw search, where a missing key would keep its raw value. A bare `42` parses
// as a number.
export function dailyNotesSearchFromUrl(raw: Record<string, unknown>): DailyNotesSearch {
  const value = typeof raw.project === "number" ? String(raw.project) : raw.project;
  return { project: typeof value === "string" && value ? value.slice(0, 1000) : undefined };
}
