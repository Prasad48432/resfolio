import type { GithubRepo } from "./github";

/** Recorded-shape GitHub REST repo objects (the fields the connector reads),
 * used by the pure `normalize` tests and the fake-`ctx` `fetch` tests. */

export const normalRepo: GithubRepo = {
  id: 1001,
  name: "fluxlog",
  full_name: "ada/fluxlog",
  description: "Structured logging for Flux.",
  html_url: "https://github.com/ada/fluxlog",
  homepage: "https://fluxlog.dev",
  language: "TypeScript",
  topics: ["logging", "observability", "typescript"],
  stargazers_count: 2312,
  forks_count: 88,
  fork: false,
  archived: false,
  created_at: "2021-03-04T10:00:00Z",
  pushed_at: "2024-06-01T12:00:00Z",
  owner: { avatar_url: "https://avatars.githubusercontent.com/u/42" },
};

/** `homepage` is free text — GitHub happily stores junk; the connector must
 * drop it rather than fail the whole repo. Also no language, no topics, no
 * avatar. */
export const junkHomepageRepo: GithubRepo = {
  id: 1002,
  name: "dotfiles",
  full_name: "ada/dotfiles",
  description: null,
  html_url: "https://github.com/ada/dotfiles",
  homepage: "not a real url",
  language: null,
  stargazers_count: 12,
  forks_count: 1,
  fork: false,
  archived: false,
  created_at: "2019-11-20T08:00:00Z",
  pushed_at: "2023-01-15T09:30:00Z",
  owner: null,
};

export const forkRepo: GithubRepo = {
  ...normalRepo,
  id: 1003,
  name: "some-fork",
  fork: true,
  pushed_at: "2024-05-01T00:00:00Z",
};

export const archivedRepo: GithubRepo = {
  ...normalRepo,
  id: 1004,
  name: "old-thing",
  archived: true,
  pushed_at: "2022-02-02T00:00:00Z",
};
