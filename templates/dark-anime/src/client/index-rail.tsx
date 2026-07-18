"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

/**
 * The right-hand INDEX rail — a client island (doc 05), adapted from the
 * reference's `RightNavbar`.
 *
 * It highlights whichever section is in view via `IntersectionObserver`. The
 * links themselves are plain `#hash` anchors rendered on the server, so with no
 * JS the rail still navigates — only the active highlight is lost. That's the
 * bar an island has to clear here.
 *
 * Sections are passed in rather than hardcoded: which ones exist depends on
 * what the profile actually has, and a rail advertising an empty section would
 * be worse than no rail.
 */
export interface RailSection {
  id: string;
  label: string;
}

export function IndexRail({
  sections,
}: {
  sections: readonly RailSection[];
}): ReactElement | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0.1 },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <nav className="rf-rail" aria-label="Sections">
      <p className="rf-label" style={{ marginBottom: "0.25rem" }}>
        Index
      </p>
      {sections.map((section) => (
        <a
          key={section.id}
          className="rf-rail-link"
          href={`#${section.id}`}
          data-active={active === section.id}
        >
          <span className="rf-rail-dash" aria-hidden />
          {section.label}
        </a>
      ))}
    </nav>
  );
}
