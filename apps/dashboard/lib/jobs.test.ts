import { describe, expect, it } from "vitest";

import { faviconUrl, FAVICON_SIZE } from "./jobs";

/**
 * `faviconUrl` builds a URL from a string that arrived in a chat message a model
 * read — so the scheme check is the test that matters, exactly as it is in
 * `normalizeJobUrl`. That check exists upstream too; a guard that only lives in
 * one place stops existing the moment somebody adds a second caller, and this
 * function is already reachable from the tracker's edit form.
 */
describe("faviconUrl", () => {
  it("takes the host from a deep posting URL", () => {
    expect(faviconUrl("https://boards.greenhouse.io/acme/jobs/12345")).toBe(
      `https://www.google.com/s2/favicons?domain=boards.greenhouse.io&sz=${FAVICON_SIZE}`,
    );
  });

  it("honours a requested size", () => {
    expect(faviconUrl("https://acme.com/jobs/1", 64)).toContain("sz=64");
  });

  it("has nothing to show for a job with no link", () => {
    // The common case: a posting pasted out of an email.
    expect(faviconUrl(null)).toBeNull();
    expect(faviconUrl(undefined)).toBeNull();
    expect(faviconUrl("")).toBeNull();
  });

  it("refuses a scheme that would not be a website", () => {
    expect(faviconUrl("javascript:alert(1)")).toBeNull();
    expect(faviconUrl("data:text/html,hi")).toBeNull();
  });

  it("refuses a hostname that is not one", () => {
    expect(faviconUrl("https://localhost/jobs")).toBeNull();
    expect(faviconUrl("not a url at all")).toBeNull();
  });

  it("encodes the host rather than splicing it in", () => {
    // The value is third-party text; building a URL by concatenation is how a
    // stored string ends up adding query parameters of its own.
    expect(faviconUrl("https://acme.com/x?a=b#c")).toBe(
      `https://www.google.com/s2/favicons?domain=acme.com&sz=${FAVICON_SIZE}`,
    );
  });
});
