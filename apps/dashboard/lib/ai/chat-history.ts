import type { ChatSessionSummary } from "@resfolio/ai";

/**
 * Grouping the chat history for display (docs/architecture/13-ai-layer.md,
 * Phase 7). Pure and tested, because it is date arithmetic — the one kind of
 * display logic that is wrong in ways nobody notices until a Sunday.
 *
 * **Buckets, not timestamps.** A list of conversations is scanned, not read: the
 * question is "was this the one from this morning or the one from last week",
 * which a heading answers at a glance and `14/07/2026, 09:41` makes you do
 * arithmetic for. The exact time still exists — it is the row's `title`
 * attribute — for the rare moment somebody wants it.
 *
 * **Calendar days, not elapsed hours.** "Yesterday" means the previous calendar
 * date, so a conversation at 23:50 is yesterday's from 00:10 onward — which is
 * what a person means by it. A 24-hour window would call it "Today" until nearly
 * midnight the following day.
 */

/** The bucket labels, in the order they are shown. */
export const CHAT_GROUP_ORDER = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
] as const;

export type ChatGroupLabel = (typeof CHAT_GROUP_ORDER)[number];

export interface ChatSessionGroup {
  label: ChatGroupLabel;
  sessions: ChatSessionSummary[];
}

/** Whole days between two instants, counted by calendar date in local time —
 * so the answer never depends on the time of day either one happened at. */
function calendarDaysBetween(later: Date, earlier: Date): number {
  const a = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  const b = new Date(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  );
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function bucket(days: number): ChatGroupLabel {
  // A negative gap means a clock skew or a session written by a machine ahead of
  // this one. It is still the newest thing the user has; calling it "Older"
  // would file it at the bottom of the list it should top.
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days <= 7) {
    return "Previous 7 days";
  }
  if (days <= 30) {
    return "Previous 30 days";
  }
  return "Older";
}

/**
 * Group sessions into date buckets, newest first, dropping empty buckets.
 *
 * The input's order is preserved within each group — the repository already
 * sorts by activity, and re-sorting here would be a second opinion about
 * "newest" that could disagree with the query's.
 */
export function groupChatSessions(
  sessions: readonly ChatSessionSummary[],
  now: Date = new Date(),
): ChatSessionGroup[] {
  const byLabel = new Map<ChatGroupLabel, ChatSessionSummary[]>();

  for (const session of sessions) {
    const label = bucket(calendarDaysBetween(now, session.updatedAt));
    const existing = byLabel.get(label);
    if (existing) {
      existing.push(session);
    } else {
      byLabel.set(label, [session]);
    }
  }

  return CHAT_GROUP_ORDER.filter((label) => byLabel.has(label)).map(
    (label) => ({
      label,
      sessions: byLabel.get(label) ?? [],
    }),
  );
}
