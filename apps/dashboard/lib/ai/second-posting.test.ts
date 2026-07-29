import { describe, expect, it } from "vitest";

import {
  isSamePosting,
  looksLikeNewPosting,
  postingsInTranscript,
  readsAsPosting,
  type PostingInChat,
} from "./second-posting";

/**
 * **The half that matters here is the false positives**, the same standard
 * `cover-letter.ts` holds itself to. This nudge sits between a user and the send
 * button; one that fires on ordinary messages is a product interrupting someone
 * who did nothing wrong, and one that fires often enough gets clicked through
 * without being read — at which point the real one is invisible too.
 */

const POSTING = "We're hiring a Senior Engineer. ".repeat(20);

const existing: PostingInChat[] = [
  {
    jobId: "job-1",
    title: "Senior Engineer at Acme",
    jobUrl: "https://acme.com/jobs/1",
    jobDescription: POSTING,
  },
];

describe("readsAsPosting", () => {
  it("accepts something long enough to be a posting", () => {
    expect(readsAsPosting(POSTING)).toBe(true);
  });

  it("accepts a bare link, which the length test would miss", () => {
    expect(readsAsPosting("https://peerlist.io/company/jobs/abc")).toBe(true);
    expect(readsAsPosting("www.acme.com/careers/42")).toBe(true);
  });

  it("refuses an ordinary instruction", () => {
    expect(readsAsPosting("enhance my summary")).toBe(false);
    expect(readsAsPosting("rewrite the Ezra project")).toBe(false);
    expect(readsAsPosting("recalculate the match")).toBe(false);
  });

  it("refuses a word that merely looks host-shaped", () => {
    // `normalizeJobUrl` promotes a bare host, so "Node.js" would parse as a URL
    // if this did not require something already link-shaped first.
    expect(readsAsPosting("Node.js")).toBe(false);
    expect(readsAsPosting("add Next.js")).toBe(false);
  });

  it("refuses a sentence that happens to contain a link", () => {
    expect(
      readsAsPosting("can you check https://acme.com/jobs/1 for me please"),
    ).toBe(false);
  });
});

describe("looksLikeNewPosting", () => {
  it("never questions the first posting in a conversation", () => {
    expect(looksLikeNewPosting(POSTING, [])).toBeNull();
  });

  it("flags a genuinely different posting, and names the one in the way", () => {
    const other = "Join Globex as a Platform Engineer. ".repeat(20);
    expect(looksLikeNewPosting(other, existing)?.title).toBe(
      "Senior Engineer at Acme",
    );
  });

  it("flags a link to a different job", () => {
    expect(looksLikeNewPosting("https://globex.com/careers/9", existing)).not
      .toBeNull();
  });

  it("says nothing about a re-paste of the same posting", () => {
    // People paste a posting, then paste it again with the benefits trimmed.
    expect(looksLikeNewPosting(POSTING, existing)).toBeNull();
    expect(
      looksLikeNewPosting(`${POSTING}\n\nBenefits: dental, 25 days`, existing),
    ).toBeNull();
  });

  it("says nothing about the same job's link", () => {
    expect(looksLikeNewPosting("https://acme.com/jobs/1", existing)).toBeNull();
  });

  it("says nothing about the description that follows a link", () => {
    // The very common two-message sequence: the URL, then the posting. Flagging
    // the second half would warn about the job the user is still supplying.
    const withLink = `https://acme.com/jobs/1\n\n${"Responsibilities include shipping. ".repeat(15)}`;
    expect(looksLikeNewPosting(withLink, existing)).toBeNull();
  });

  it("says nothing about ordinary conversation", () => {
    for (const message of [
      "enhance my summary",
      "what am I missing for this role?",
      "recalculate the match",
      "make the Braingroundwork bullet shorter",
    ]) {
      expect(looksLikeNewPosting(message, existing)).toBeNull();
    }
  });
});

/**
 * `isSamePosting` is the line between "recalculate the match" and a second job,
 * and it is drawn in one place because the browser decides whether to warn and
 * the server decides whether to spend a model call. Two implementations would
 * eventually disagree — and then the product either refuses work the user asked
 * for or bills for work it said it would not do.
 */
describe("isSamePosting", () => {
  it("recognises the same posting through whitespace and case", () => {
    expect(isSamePosting(POSTING, `\n\n  ${POSTING.toUpperCase()}  `)).toBe(
      true,
    );
  });

  it("recognises it through an edited tail", () => {
    // What "recalculate" actually looks like: the original paste is still the
    // most recent long message, possibly trimmed since.
    expect(isSamePosting(POSTING, `${POSTING}\n\nBenefits: dental`)).toBe(true);
  });

  it("separates two different postings", () => {
    expect(isSamePosting(POSTING, "Join Globex as a Platform Engineer. ".repeat(20))).toBe(
      false,
    );
  });
});

describe("postingsInTranscript", () => {
  const message = (output: Record<string, unknown>) => ({
    parts: [{ type: "tool-analyzeJobMatch", state: "output-available", output }],
  });

  it("reads a completed match off the transcript", () => {
    const found = postingsInTranscript([
      message({
        jobId: "abc",
        role: "Engineer",
        company: "Acme",
        jobUrl: "https://acme.com/1",
        jobDescription: POSTING,
      }),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe("Engineer at Acme");
  });

  it("ignores a refusal, which carries no job", () => {
    // Both `no-posting` and `already-analysed` come back through the same tool
    // part. Counting one as an analysed job would lock a chat that never
    // analysed anything.
    const found = postingsInTranscript([
      message({ unavailable: true, reason: "no-posting" }),
      message({ unavailable: true, reason: "already-analysed" }),
    ]);

    expect(found).toHaveLength(0);
  });

  it("ignores a tool call that has not returned yet", () => {
    expect(
      postingsInTranscript([
        { parts: [{ type: "tool-analyzeJobMatch", state: "input-streaming" }] },
      ]),
    ).toHaveLength(0);
  });

  it("has nothing to say about an ordinary conversation", () => {
    expect(
      postingsInTranscript([{ parts: [{ type: "text", text: "hello" }] }]),
    ).toHaveLength(0);
  });
});
