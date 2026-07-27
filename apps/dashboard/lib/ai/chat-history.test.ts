import type { ChatSessionSummary } from "@resfolio/ai";
import { describe, expect, it } from "vitest";

import { CHAT_GROUP_ORDER, groupChatSessions } from "./chat-history";

/** Local time on purpose: the grouping is by calendar day as the user sees it,
 * so a fixture built in UTC would be testing a different function. */
function at(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute);
}

function session(id: string, updatedAt: Date): ChatSessionSummary {
  return {
    id,
    title: id,
    messageCount: 2,
    createdAt: updatedAt,
    updatedAt,
  };
}

const NOW = at(2026, 7, 27, 10, 30);

describe("groupChatSessions", () => {
  it("returns nothing for an empty history", () => {
    expect(groupChatSessions([], NOW)).toEqual([]);
  });

  it("drops empty buckets rather than rendering headings with nothing under them", () => {
    const groups = groupChatSessions([session("a", at(2026, 7, 27, 9))], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Today");
  });

  it("buckets by calendar day, not by elapsed hours", () => {
    // 23:50 last night is eleven hours ago and is *yesterday*. An elapsed-hours
    // rule would file it under Today, which is not what anybody means by it.
    const groups = groupChatSessions(
      [session("late-last-night", at(2026, 7, 26, 23, 50))],
      NOW,
    );

    expect(groups[0]?.label).toBe("Yesterday");
  });

  it("treats one minute ago and this morning alike", () => {
    const groups = groupChatSessions(
      [
        session("a", at(2026, 7, 27, 10, 29)),
        session("b", at(2026, 7, 27, 0, 5)),
      ],
      NOW,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sessions.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("splits the week, the month and everything older", () => {
    const groups = groupChatSessions(
      [
        session("today", at(2026, 7, 27, 8)),
        session("yesterday", at(2026, 7, 26)),
        session("this-week", at(2026, 7, 22)),
        session("this-month", at(2026, 7, 5)),
        session("ancient", at(2025, 12, 1)),
      ],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Previous 30 days",
      "Older",
    ]);
  });

  it("puts the boundaries on the near side", () => {
    // Exactly 7 days is still "Previous 7 days"; 8 has fallen out of it.
    const groups = groupChatSessions(
      [session("seven", at(2026, 7, 20)), session("eight", at(2026, 7, 19))],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Previous 7 days",
      "Previous 30 days",
    ]);
  });

  it("files a future-dated session under Today rather than Older", () => {
    // Clock skew between the database host and the browser. It is still the
    // newest thing the user has, so it belongs at the top of the list.
    const groups = groupChatSessions([session("skewed", at(2026, 7, 28))], NOW);

    expect(groups[0]?.label).toBe("Today");
  });

  it("preserves the repository's ordering within a group", () => {
    const groups = groupChatSessions(
      [
        session("newest", at(2026, 7, 27, 10)),
        session("middle", at(2026, 7, 27, 9)),
        session("oldest", at(2026, 7, 27, 8)),
      ],
      NOW,
    );

    expect(groups[0]?.sessions.map((entry) => entry.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("emits groups in the declared display order", () => {
    const groups = groupChatSessions(
      [
        session("ancient", at(2025, 1, 1)),
        session("today", at(2026, 7, 27, 9)),
      ],
      NOW,
    );

    const positions = groups.map((group) =>
      CHAT_GROUP_ORDER.indexOf(group.label),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
