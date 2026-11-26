import { threadKey } from "@t3tools/client-runtime/state/entities";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDailyNotesProjects,
  dailyNoteActivityAt,
  dailyNotesEntryProjectKey,
  dailyNoteStatus,
  dailyNotesSearchFromUrl,
  DAILY_NOTES_NO_PROJECT_KEY,
  groupDailyNotes,
  localDayDate,
  localDayKey,
  selectDailyNotesProject,
  type DailyNoteThread,
  type DailyNotesProjectGroup,
} from "./dailyNotes.logic";

const ENV = EnvironmentId.make("env-1");
const PROJECT_A = ProjectId.make("project-a");
const PROJECT_B = ProjectId.make("project-b");

// Local wall-clock times, so day grouping holds in any time zone.
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).toISOString();
const NOW = new Date(2026, 10, 26, 15, 30).getTime();
const NONE: ReadonlySet<string> = new Set();

function thread(id: string, overrides: Partial<DailyNoteThread> = {}): DailyNoteThread {
  const threadId = ThreadId.make(id);
  return {
    environmentId: ENV,
    id: threadId,
    projectId: PROJECT_A,
    title: id,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
    archivedAt: null,
    deletedAt: null,
    runtime: null,
    latestRun: null,
    blockedOnThreadWait: false,
    settledOverride: null,
    snoozedUntil: null,
    snoozedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    latestUserAuthoredMessageAt: null,
    latestUserMessageAt: null,
    createdAt: at(11, 26, 9),
    updatedAt: at(11, 26, 9),
    ...overrides,
  };
}

function runtime(status: NonNullable<DailyNoteThread["runtime"]>["status"]) {
  return {
    status,
    activeRunId: null,
    providerInstanceId: "codex" as never,
    providerName: null,
    lastError: null,
    updatedAt: at(11, 26, 9),
  } satisfies DailyNoteThread["runtime"];
}

function group(key: string, projectIds: ProjectId[], extra: Partial<DailyNotesProjectGroup> = {}) {
  return {
    projectKey: key,
    displayName: key.toUpperCase(),
    memberProjectRefs: projectIds.map((projectId) => ({ environmentId: ENV, projectId })),
    archived: false,
    pinned: false,
    ...extra,
  } satisfies DailyNotesProjectGroup;
}

describe("dailyNoteStatus", () => {
  it("puts a pending request ahead of a running turn", () => {
    expect(dailyNoteStatus(thread("t", { runtime: runtime("running") }), NOW)).toBe("working");
    expect(
      dailyNoteStatus(thread("t", { runtime: runtime("running"), hasPendingApprovals: true }), NOW),
    ).toBe("waiting");
    expect(dailyNoteStatus(thread("t", { blockedOnThreadWait: true }), NOW)).toBe("waiting");
    expect(dailyNoteStatus(thread("t", { runtime: runtime("waiting") }), NOW)).toBe("waiting");
  });

  it("reads done, snoozed, failed and open from an idle thread", () => {
    expect(dailyNoteStatus(thread("t", { settledOverride: "settled" }), NOW)).toBe("done");
    expect(
      dailyNoteStatus(thread("t", { snoozedUntil: at(11, 27, 9), snoozedAt: at(11, 26, 9) }), NOW),
    ).toBe("snoozed");
    expect(dailyNoteStatus(thread("t", { snoozedUntil: at(11, 26, 10) }), NOW)).toBe("open");
    expect(dailyNoteStatus(thread("t", { runtime: runtime("failed") }), NOW)).toBe("failed");
    expect(dailyNoteStatus(thread("t"), NOW)).toBe("open");
  });
});

describe("day keys", () => {
  it("uses the local calendar day and round-trips it", () => {
    expect(localDayKey(new Date(2026, 0, 5, 0, 1).getTime())).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
    expect(localDayKey(localDayDate("2026-03-08").getTime())).toBe("2026-03-08");
  });
});

describe("dailyNoteActivityAt", () => {
  it("prefers the latest authored message, then falls back to creation", () => {
    expect(
      dailyNoteActivityAt(
        thread("t", {
          latestUserAuthoredMessageAt: at(11, 25, 8),
          latestUserMessageAt: at(11, 25, 9),
        }),
      ),
    ).toBe(Date.parse(at(11, 25, 8)));
    expect(dailyNoteActivityAt(thread("t", { latestUserMessageAt: at(11, 25, 9) }))).toBe(
      Date.parse(at(11, 25, 9)),
    );
    expect(dailyNoteActivityAt(thread("t"))).toBe(Date.parse(at(11, 26, 9)));
    expect(dailyNoteActivityAt(thread("t", { createdAt: "nope", updatedAt: "nope" }))).toBeNull();
  });
});

describe("groupDailyNotes", () => {
  const threads = [
    thread("yesterday-late", { latestUserMessageAt: at(11, 25, 22) }),
    thread("older", { latestUserMessageAt: at(11, 20, 10) }),
    thread("yesterday-early", { latestUserMessageAt: at(11, 25, 7) }),
    thread("done", { latestUserMessageAt: at(11, 25, 12), settledOverride: "settled" }),
  ];

  it("lists today first even when empty, then days and rows newest first", () => {
    const days = groupDailyNotes(threads, NOW, false);
    expect(days.map((day) => day.day)).toEqual(["2026-11-26", "2026-11-25", "2026-11-20"]);
    expect(days[0]?.rows).toEqual([]);
    expect(days[1]?.rows.map((row) => row.thread.id)).toEqual([
      "yesterday-late",
      "done",
      "yesterday-early",
    ]);
  });

  it("drops only done threads when showing open ones", () => {
    const days = groupDailyNotes(threads, NOW, true);
    expect(days[1]?.rows.map((row) => row.thread.id)).toEqual([
      "yesterday-late",
      "yesterday-early",
    ]);
  });
});

describe("buildDailyNotesProjects", () => {
  it("buckets listed threads by project group in picker order", () => {
    const projects = buildDailyNotesProjects(
      [group("a", [PROJECT_A]), group("b", [PROJECT_B], { pinned: true })],
      [
        thread("in-a"),
        thread("delegated"),
        thread("in-b", { projectId: PROJECT_B }),
        thread("archived", { archivedAt: at(11, 26, 9) }),
        thread("deleted", { deletedAt: at(11, 26, 9) }),
        thread("subagent", {
          lineage: {
            parentThreadId: ThreadId.make("in-a"),
            relationshipToParent: "subagent",
            rootThreadId: ThreadId.make("in-a"),
          },
        }),
        thread("side-chat", {
          lineage: {
            parentThreadId: null,
            relationshipToParent: null,
            rootThreadId: ThreadId.make("side-chat"),
            sideChat: true,
          },
        }),
      ],
      // A task a linked environment delegated, listed under its parent thread.
      new Set([threadKey({ environmentId: ENV, threadId: ThreadId.make("delegated") })]),
    );
    expect(projects.map((project) => [project.key, project.threads.map((t) => t.id)])).toEqual([
      ["b", ["in-b"]],
      ["a", ["in-a"]],
    ]);
  });

  it("adds a No project bucket only when a thread needs it", () => {
    const orphan = thread("orphan", { projectId: ProjectId.make("gone") });
    const withOrphan = buildDailyNotesProjects([group("a", [PROJECT_A])], [orphan], NONE);
    expect(withOrphan.map((project) => [project.key, project.displayName])).toEqual([
      ["a", "A"],
      [DAILY_NOTES_NO_PROJECT_KEY, null],
    ]);
    expect(buildDailyNotesProjects([], [], NONE).map((project) => project.key)).toEqual([
      DAILY_NOTES_NO_PROJECT_KEY,
    ]);
  });

  it("hides archived projects along with their threads", () => {
    const projects = buildDailyNotesProjects(
      [group("a", [PROJECT_A], { archived: true })],
      [thread("in-archived-project")],
      NONE,
    );
    expect(projects).toEqual([{ key: DAILY_NOTES_NO_PROJECT_KEY, displayName: null, threads: [] }]);
  });
});

describe("selectDailyNotesProject", () => {
  const projects = [
    { key: "empty", displayName: "Empty", threads: [] },
    { key: "busy", displayName: "Busy", threads: [thread("t")] },
  ];

  it("falls back to the first project with threads for an unknown key", () => {
    expect(selectDailyNotesProject(projects, "empty")?.key).toBe("empty");
    expect(selectDailyNotesProject(projects, "missing")?.key).toBe("busy");
    expect(selectDailyNotesProject(projects, undefined)?.key).toBe("busy");
    expect(selectDailyNotesProject([projects[0]!], undefined)?.key).toBe("empty");
  });
});

describe("dailyNotesEntryProjectKey", () => {
  const groups = [group("a", [PROJECT_A]), group("b", [PROJECT_B])];

  it("prefers the scoped project, then the shown thread's project", () => {
    expect(dailyNotesEntryProjectKey({ scopedProjectKey: "a", groups, thread: thread("t") })).toBe(
      "a",
    );
    expect(
      dailyNotesEntryProjectKey({
        scopedProjectKey: undefined,
        groups,
        thread: { environmentId: ENV, projectId: PROJECT_B },
      }),
    ).toBe("b");
    expect(
      dailyNotesEntryProjectKey({ scopedProjectKey: undefined, groups, thread: null }),
    ).toBeUndefined();
  });
});

describe("dailyNotesSearchFromUrl", () => {
  it("keeps a project key, stringifies numbers, and always sets the key", () => {
    expect(dailyNotesSearchFromUrl({ project: "repo:x" })).toEqual({ project: "repo:x" });
    expect(dailyNotesSearchFromUrl({ project: 42 })).toEqual({ project: "42" });
    const empty = dailyNotesSearchFromUrl({ project: "" });
    expect(empty).toEqual({ project: undefined });
    expect(Object.hasOwn(empty, "project")).toBe(true);
    expect(dailyNotesSearchFromUrl({ project: { x: 1 } })).toEqual({ project: undefined });
  });
});
