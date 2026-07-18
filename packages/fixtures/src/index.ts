/**
 * @resfolio/fixtures — the shared sample-data corpus
 * (docs/architecture/11-engineering-foundation.md). Realistic Profiles and
 * their ProfileViews, existing *exactly once* so unit tests, template
 * contract tests (Phase 4), and e2e journeys all draw from the same data.
 *
 * Depends only on `@resfolio/profile` (validates through the real schema, so
 * a fixture that drifts from the schema fails to load). Ids are stable
 * literals — never `createItemId()` — so snapshots and view outputs are
 * deterministic across runs.
 */
import {
  buildProfileView,
  profileSchema,
  type Profile,
  type ProfileView,
} from "@resfolio/profile";

export interface ProfileFixture {
  key: string;
  label: string;
  profile: Profile;
}

/** A fully-populated senior engineer — exercises every standard section. */
const ada: Profile = profileSchema.parse({
  schemaVersion: 1,
  basics: {
    name: "Ada Okonkwo",
    summary:
      "Engineer with **12 years** building reliable backends and the tools teams use to ship them. I care about clear interfaces and boring, observable systems.",
    location: "Berlin, Germany",
    avatarUrl: "https://example.com/ada.jpg",
    contacts: {
      email: "ada@example.com",
      website: "https://ada.example.com",
    },
    links: [
      {
        id: "lnk-github",
        label: "GitHub",
        url: "https://github.com/example-ada",
      },
      {
        id: "lnk-linkedin",
        label: "LinkedIn",
        url: "https://linkedin.com/in/example-ada",
      },
    ],
  },
  sections: {
    experience: [
      {
        id: "exp-northwind",
        source: "manual",
        company: "Northwind Systems",
        role: "Staff Engineer",
        location: "Berlin",
        url: "https://northwind.example.com",
        startDate: "2021-03",
        summary: "Tech lead for the platform reliability group.",
        highlights: [
          "Cut p99 checkout latency by **43%** by reworking the fan-out path.",
          "Introduced error budgets across 30+ services.",
        ],
      },
      {
        id: "exp-contoso",
        source: "manual",
        company: "Contoso",
        role: "Senior Backend Engineer",
        location: "Remote",
        startDate: "2017-06",
        endDate: "2021-02",
        highlights: ["Owned the billing pipeline through a 10x growth phase."],
      },
    ],
    projects: [
      {
        id: "prj-fluxlog",
        source: "manual",
        name: "fluxlog",
        description:
          "A structured logging library with zero-allocation hot paths. Used in production by several teams.",
        url: "https://fluxlog.example.com",
        repoUrl: "https://github.com/example-ada/fluxlog",
        technologies: ["Rust", "tokio"],
        highlights: [
          "1.4k GitHub stars",
          "Adopted internally at two companies",
        ],
      },
    ],
    skills: [
      {
        id: "skl-languages",
        source: "manual",
        name: "Languages",
        skills: ["Rust", "TypeScript", "Go", "Python"],
      },
      {
        id: "skl-infra",
        source: "manual",
        name: "Infrastructure",
        skills: ["PostgreSQL", "Kafka", "Kubernetes"],
      },
    ],
    education: [
      {
        id: "edu-tuberlin",
        source: "manual",
        institution: "TU Berlin",
        degree: "MSc",
        area: "Computer Science",
        startDate: "2011",
        endDate: "2013",
      },
    ],
    writing: [
      {
        id: "wri-budgets",
        source: "manual",
        title: "Error budgets that teams actually use",
        publisher: "Personal blog",
        url: "https://ada.example.com/error-budgets",
        date: "2023-09",
        summary: "A field guide to making SLOs stick.",
      },
    ],
    certifications: [
      {
        id: "crt-cka",
        source: "manual",
        name: "Certified Kubernetes Administrator",
        issuer: "CNCF",
        date: "2020-05",
      },
    ],
    awards: [
      {
        id: "awd-hackathon",
        source: "manual",
        title: "Internal Hackathon — 1st place",
        awarder: "Northwind Systems",
        date: "2022",
      },
    ],
    languages: [
      { id: "lng-en", source: "manual", name: "English", fluency: "Native" },
      { id: "lng-de", source: "manual", name: "German", fluency: "Fluent" },
    ],
    custom: [
      {
        id: "cst-talks",
        source: "manual",
        title: "Talks",
        items: [
          {
            id: "cst-talks-1",
            source: "manual",
            title: "Observability without the bill shock",
            subtitle: "RustConf",
            date: "2023",
          },
        ],
      },
    ],
  },
});

/** A newcomer with only basics + one project — exercises sparse profiles
 * and empty-section omission in views. */
const jun: Profile = profileSchema.parse({
  schemaVersion: 1,
  basics: {
    name: "Jun Park",
    contacts: { email: "jun@example.com" },
  },
  sections: {
    projects: [
      {
        id: "prj-portfolio",
        source: "manual",
        name: "Personal portfolio",
        description: "My first site, built to learn React.",
        technologies: ["React"],
      },
    ],
  },
});

export const profileFixtures: readonly ProfileFixture[] = [
  { key: "ada", label: "Ada — full senior profile", profile: ada },
  { key: "jun", label: "Jun — sparse newcomer profile", profile: jun },
];

export function getProfileFixture(key: string): Profile {
  const found = profileFixtures.find((fixture) => fixture.key === key);
  if (!found) {
    throw new Error(`Unknown profile fixture: ${key}`);
  }
  return found.profile;
}

/** The identity ProfileView for each fixture (no document selection). */
export const profileViewFixtures: readonly {
  key: string;
  view: ProfileView;
}[] = profileFixtures.map((fixture) => ({
  key: fixture.key,
  view: buildProfileView(fixture.profile),
}));

export { ada as adaProfile, jun as junProfile };
