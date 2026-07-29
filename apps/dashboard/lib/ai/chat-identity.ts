/**
 * Which conversation is on screen, when the URL and the client can disagree.
 *
 * ## The bug this exists to make impossible (2026-07-29)
 *
 * `/ai` used to mint an id for an unsaved chat **on the server, per render**,
 * and key the workspace on it. That made the page non-idempotent: two renders of
 * the same URL produced two different ids, so any re-render of the route
 * remounted the workspace and destroyed `useChat`'s state — the user was dropped
 * into a blank new chat, mid-answer, having lost the turn they were waiting on.
 *
 * Route re-renders are ordinary events, not exotic ones: `router.refresh()`
 * after applying tailoring; every Server Action that calls `revalidatePath`,
 * since Next re-renders the current tree in the action's response whatever path
 * was revalidated (so the chat's own Apply button, which revalidates
 * `/profile`, did it); and Fast Refresh in development.
 *
 * ## Why a key could never have worked
 *
 * Because **the URL is claimed during the conversation, not before it**. A new
 * chat starts at `/ai` with no id anywhere but the client, and its first save
 * writes `?c=<id>` with `history.replaceState`. So the server's answer for one
 * unbroken conversation changes from "nothing" to an id with nothing having been
 * navigated to — and anything keyed on that remounts at the transition.
 *
 * Identity therefore lives in the client, and the URL is a *pointer* to it. This
 * function is the whole of the rule, so that the four cases are named, tested,
 * and not four `if`s inside a render body.
 */

/** What the workspace should do about the URL having changed. */
export type ChatIdentityChange =
  /** Nothing navigated. The commonest case by far, and the one the old code got
   * wrong: a re-render of a chat that has not saved itself yet. */
  | { kind: "none" }
  /** The URL caught up with the conversation already on screen — our own
   * `replaceState` after a first save. Record it; change nothing. */
  | { kind: "adopted" }
  /** A different saved conversation was opened from the rail. Its transcript
   * arrived with the same render. */
  | { kind: "open"; sessionId: string }
  /** "New chat": a navigation from a conversation with a URL to the route that
   * has none. */
  | { kind: "new" };

export function resolveChatIdentity({
  /** The conversation the URL names right now, or null for `/ai`. */
  url,
  /** The URL as the workspace last saw it. */
  lastUrl,
  /** The conversation on screen — always a real id, minted client-side when the
   * URL had none. */
  current,
}: {
  url: string | null;
  lastUrl: string | null;
  current: string;
}): ChatIdentityChange {
  // The URL is unchanged, so nothing was navigated to, so the conversation on
  // screen is still the conversation on screen. `url` and `current` differing
  // here is ordinary rather than a conflict: an unsaved chat has an id in the
  // client and nothing in the URL.
  if (url === lastUrl) return { kind: "none" };

  if (url === null) return { kind: "new" };

  // The URL now names what we are already showing. This is the first save
  // claiming its address, and treating it as a navigation would remount the
  // transcript at the one moment the user is certain to be reading it.
  if (url === current) return { kind: "adopted" };

  return { kind: "open", sessionId: url };
}
