import { profileViewFixtures } from "@resfolio/fixtures";
import { resolveTheme, type ProfileView } from "@resfolio/template-sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultResumeClassicConfig, resumeClassic } from "./index";

/**
 * The template contract harness (doc 05), the same shape `resume-editorial`
 * has: it renders the real document, so a crash or a lost section shows up here
 * rather than in a PDF somebody has already sent to an employer.
 *
 * It arrived with the project links moving onto the title line, which is exactly
 * the kind of change that cannot be checked by reading — the markup compiles
 * either way and the mistake is a row that wraps or a link that vanished.
 */

const theme = resolveTheme(resumeClassic, {});

function render(view: ProfileView): string {
  return renderToStaticMarkup(
    <resumeClassic.document
      view={view}
      config={defaultResumeClassicConfig}
      theme={theme}
    />,
  );
}

/** The markup with the `<style>` block removed — the sheet names every class,
 * so asserting a class is present against raw output would always pass. */
function body(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function getView(key: string): ProfileView {
  const found = profileViewFixtures.find((fixture) => fixture.key === key);
  if (!found) throw new Error(`missing fixture: ${key}`);
  return found.view;
}

describe("resume-classic — fixtures", () => {
  it("renders a full profile with every section", () => {
    const html = render(getView("ada"));
    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Experience");
    expect(html).toContain("Projects");
    expect(html).toContain("Education");
  });

  it("renders a sparse profile without crashing", () => {
    expect(render(getView("jun"))).toContain("Jun Park");
  });

  it("is deterministic (same inputs → identical markup)", () => {
    expect(render(getView("ada"))).toBe(render(getView("ada")));
  });

  it("never emits a raw <script> (it is a static document)", () => {
    expect(render(getView("ada"))).not.toContain("<script");
  });
});

describe("resume-classic — project links", () => {
  it("labels them rather than printing the address", () => {
    const html = body(render(getView("ada")));

    expect(html).toContain(">Live</a>");
    expect(html).toContain(">GitHub</a>");
    // The URL survives as the href and nowhere else: two lines of
    // `github.com/example-ada/fluxlog` per project was a fifth of the page
    // spent on strings nobody reads and nobody types.
    expect(html).toContain('href="https://fluxlog.example.com"');
    expect(html).toContain('href="https://github.com/example-ada/fluxlog"');
    expect(html).not.toContain(">github.com/example-ada/fluxlog<");
  });

  it("puts them on the title line, not in a row of their own", () => {
    const html = body(render(getView("ada")));

    const head = html.indexOf("rf-entry-head");
    const links = html.indexOf("rf-entry-links");
    const description = html.indexOf("A structured logging library");

    expect(links).toBeGreaterThan(head);
    // Before the description is the whole point — after it, they are the old
    // layout with new labels.
    expect(links).toBeLessThan(description);
  });

  it("renders nothing at all for a project with no links", () => {
    // `jun`'s only project has neither, so an empty separator or a stray dot
    // would show up here.
    const html = body(render(getView("jun")));

    expect(html).toContain("Personal portfolio");
    expect(html).not.toContain("rf-entry-links");
    expect(html).not.toContain("rf-sep");
  });
});
