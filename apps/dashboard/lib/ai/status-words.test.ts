import { describe, expect, it } from "vitest";

import {
  STATUS_WORDS,
  WORK_KINDS,
  statusAnnouncement,
  statusWordAt,
  type WorkKind,
} from "./status-words";

describe("statusWordAt", () => {
  it("starts on the truest word", () => {
    expect(statusWordAt("thinking", 0)).toBe("Thinking");
    expect(statusWordAt("reading", 0)).toBe("Reading your profile");
  });

  it("advances one word per tick and wraps", () => {
    const bank = STATUS_WORDS.matching;
    const seen = bank.map((_, index) => statusWordAt("matching", index));
    expect(seen).toEqual([...bank]);
    // The wrap is the whole reason a tick can be an ever-increasing counter
    // rather than something the component has to keep in range.
    expect(statusWordAt("matching", bank.length)).toBe(bank[0]);
    expect(statusWordAt("matching", bank.length * 7 + 2)).toBe(bank[2]);
  });

  it("never renders a blank line for a nonsense tick", () => {
    // A status label has no failure mode worth an empty string.
    for (const tick of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(statusWordAt("letter", tick)).toBe(STATUS_WORDS.letter[0]);
    }
  });

  it("stays inside its own bank for every kind", () => {
    // The honesty rule: rotating never crosses into another phase's vocabulary.
    for (const kind of WORK_KINDS) {
      for (let tick = 0; tick < 20; tick += 1) {
        expect(STATUS_WORDS[kind]).toContain(statusWordAt(kind, tick));
      }
    }
  });
});

describe("the banks", () => {
  it("covers every kind with at least two words", () => {
    // One word is a static label wearing a rotation's clothes.
    for (const kind of WORK_KINDS) {
      expect(STATUS_WORDS[kind].length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every word short", () => {
    // These sit beside a spinner in an 18rem artefact panel; a word that wraps
    // moves the layout every few seconds.
    for (const kind of WORK_KINDS) {
      for (const word of STATUS_WORDS[kind]) {
        expect(word.split(" ").length).toBeLessThanOrEqual(3);
        expect(word.length).toBeLessThanOrEqual(24);
      }
    }
  });

  it("carries no punctuation — the ellipsis belongs to the renderer", () => {
    for (const kind of WORK_KINDS) {
      for (const word of STATUS_WORDS[kind]) {
        expect(word).not.toMatch(/[….]/);
      }
    }
  });

  it("repeats nothing inside a bank", () => {
    for (const kind of WORK_KINDS) {
      expect(new Set(STATUS_WORDS[kind]).size).toBe(STATUS_WORDS[kind].length);
    }
  });

  it("announces the first word of the bank", () => {
    for (const kind of WORK_KINDS) {
      expect(statusAnnouncement(kind)).toBe(STATUS_WORDS[kind][0]);
    }
  });

  it("has a bank for every declared kind and no more", () => {
    // A kind added to the union without a bank is a runtime `undefined` in a
    // status line, which renders as nothing at all.
    const kinds = Object.keys(STATUS_WORDS) as WorkKind[];
    expect(new Set(kinds)).toEqual(new Set(WORK_KINDS));
  });
});
