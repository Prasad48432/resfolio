import { describe, expect, it } from "vitest";

import { describeProfileItems, profileItemLabel } from "./describe";
import { addItem } from "./edit";
import { createEmptyProfile } from "./seed";

describe("profileItemLabel", () => {
  it("joins an experience's role and company", () => {
    expect(
      profileItemLabel("experience", {
        role: "Senior Engineer",
        company: "Acme",
      }),
    ).toBe("Senior Engineer · Acme");
  });

  it("skips fields the user hasn't filled in", () => {
    expect(profileItemLabel("experience", { role: "", company: "Acme" })).toBe(
      "Acme",
    );
  });

  it("falls back rather than showing an id", () => {
    expect(profileItemLabel("projects", { name: "" })).toBe("Untitled");
  });
});

describe("describeProfileItems", () => {
  it("flattens every section into id/label refs", () => {
    let profile = addItem(createEmptyProfile(), "experience", {
      id: "exp-1",
      source: "manual",
      company: "Acme",
      role: "Senior Engineer",
      location: "",
      summary: "",
      highlights: [],
    });
    profile = addItem(profile, "certifications", {
      id: "cert-1",
      source: "manual",
      name: "CKA",
      issuer: "CNCF",
    });

    expect(describeProfileItems(profile)).toEqual([
      { id: "exp-1", section: "experience", label: "Senior Engineer · Acme" },
      { id: "cert-1", section: "certifications", label: "CKA" },
    ]);
  });

  it("cites a custom section's entries, never the heading", () => {
    // Citing "Publications" as evidence for a requirement says nothing; the
    // entry under it is the fact, so the heading only prefixes the label.
    const profile = addItem(createEmptyProfile(), "custom", {
      id: "sec-1",
      source: "manual",
      title: "Publications",
      items: [
        {
          id: "pub-1",
          source: "manual",
          title: "On Cache Invalidation",
          subtitle: "",
          summary: "",
          highlights: [],
        },
      ],
    });

    expect(describeProfileItems(profile)).toEqual([
      {
        id: "pub-1",
        section: "custom",
        label: "Publications · On Cache Invalidation",
      },
    ]);
  });
});
