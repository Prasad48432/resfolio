import { describe, expect, it } from "vitest";

import { resolveChatIdentity } from "./chat-identity";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
/** A client-minted id for a chat that has never saved: real, and in no URL. */
const MINTED = "33333333-3333-4333-8333-333333333333";

describe("resolveChatIdentity", () => {
  it("does nothing when the URL has not changed", () => {
    // The regression. A route re-render of an unsaved chat — the URL was null
    // before and is null now — must not touch the conversation on screen. This
    // used to remount it and lose the answer being streamed.
    expect(
      resolveChatIdentity({ url: null, lastUrl: null, current: MINTED }),
    ).toEqual({ kind: "none" });

    // And the same for a saved one.
    expect(resolveChatIdentity({ url: A, lastUrl: A, current: A })).toEqual({
      kind: "none",
    });
  });

  it("records the URL catching up with an unsaved chat, without resetting it", () => {
    // The first save writes `?c=<id>` with `replaceState`. One unbroken
    // conversation, so this is not a navigation — and treating it as one would
    // remount the transcript at the moment it is certainly being read.
    expect(
      resolveChatIdentity({ url: MINTED, lastUrl: null, current: MINTED }),
    ).toEqual({ kind: "adopted" });
  });

  it("opens another saved conversation from the rail", () => {
    expect(resolveChatIdentity({ url: B, lastUrl: A, current: A })).toEqual({
      kind: "open",
      sessionId: B,
    });
  });

  it("starts a new chat when the URL drops its id", () => {
    expect(resolveChatIdentity({ url: null, lastUrl: A, current: A })).toEqual({
      kind: "new",
    });
  });

  it("treats a rail click onto an unsaved chat's own id as adoption, not an open", () => {
    // Reachable when a chat saves itself and the row is then clicked: the id in
    // the URL is the id on screen, whatever route it arrived by.
    expect(
      resolveChatIdentity({ url: MINTED, lastUrl: A, current: MINTED }),
    ).toEqual({ kind: "adopted" });
  });

  it("never reports a change from the ids alone", () => {
    // The whole point: `url !== current` is the *normal* state of an unsaved
    // chat, and is not evidence that anything was navigated to.
    for (const url of [null, A, B]) {
      expect(
        resolveChatIdentity({ url, lastUrl: url, current: MINTED }),
      ).toEqual({ kind: "none" });
    }
  });
});
