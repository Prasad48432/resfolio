import { describe, expect, it } from "vitest";

import { firstErrorPath } from "./form-errors";

/** RHF leaves always carry a `type`; that is what marks the end of the walk. */
const leaf = (message: string) => ({ type: "custom", message });

describe("firstErrorPath", () => {
  it("returns null when there are no errors", () => {
    expect(firstErrorPath({})).toBeNull();
    expect(firstErrorPath(undefined)).toBeNull();
  });

  it("finds a top-level field", () => {
    expect(firstErrorPath({ name: leaf("Required") })).toBe("name");
  });

  it("finds a nested field", () => {
    expect(
      firstErrorPath({ basics: { contacts: { email: leaf("Bad") } } }),
    ).toBe("basics.contacts.email");
  });

  // Array indices join with a dot, not brackets: that is the form RHF's own
  // `register`/`setFocus` accept, and bracket notation would silently miss.
  it("joins array indices with dots", () => {
    const errors = {
      sections: {
        experience: [undefined, undefined, { startDate: leaf("Bad date") }],
      },
    };
    expect(firstErrorPath(errors)).toBe("sections.experience.2.startDate");
  });

  it("returns the first error in declaration order", () => {
    const errors = {
      name: leaf("Required"),
      location: leaf("Too long"),
    };
    expect(firstErrorPath(errors)).toBe("name");
  });

  // `root` is RHF's bookkeeping key for array-level errors — there is no DOM
  // node to focus, so walking into it would return an unfocusable path.
  it("skips RHF's `root` bookkeeping key", () => {
    const errors = {
      sections: {
        experience: {
          root: leaf("Too many"),
          0: { company: leaf("Required") },
        },
      },
    };
    expect(firstErrorPath(errors)).toBe("sections.experience.0.company");
  });
});
