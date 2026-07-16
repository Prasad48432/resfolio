import { describe, expect, it } from "vitest";

import { resolvePortfolioRoute } from "./routing";

describe("resolvePortfolioRoute", () => {
  it("maps the empty path to home", () => {
    expect(resolvePortfolioRoute(undefined)).toEqual({
      page: "home",
      params: {},
    });
    expect(resolvePortfolioRoute([])).toEqual({ page: "home", params: {} });
  });

  it("maps index routes", () => {
    expect(resolvePortfolioRoute(["projects"])).toEqual({
      page: "projects",
      params: {},
    });
    expect(resolvePortfolioRoute(["about"])).toEqual({
      page: "about",
      params: {},
    });
    expect(resolvePortfolioRoute(["resume"])).toEqual({
      page: "resume",
      params: {},
    });
    expect(resolvePortfolioRoute(["blog"])).toEqual({
      page: "blog",
      params: {},
    });
  });

  it("maps detail routes to a slug param", () => {
    expect(resolvePortfolioRoute(["projects", "prj-fluxlog"])).toEqual({
      page: "projectDetail",
      params: { slug: "prj-fluxlog" },
    });
    expect(resolvePortfolioRoute(["blog", "hello-world"])).toEqual({
      page: "blogPost",
      params: { slug: "hello-world" },
    });
  });

  it("404s unknown, over-deep, and non-detail sub-paths", () => {
    expect(resolvePortfolioRoute(["nope"])).toBeNull();
    expect(resolvePortfolioRoute(["about", "extra"])).toBeNull();
    expect(resolvePortfolioRoute(["resume", "x"])).toBeNull();
    expect(resolvePortfolioRoute(["projects", "a", "b"])).toBeNull();
  });
});
