import type { GithubRepo } from "./github";

/** Recorded-shape GitHub REST repo objects (the fields the connector reads),
 * used by the pure `normalize` tests and the fake-`ctx` `fetch` tests. */

export const normalRepo: GithubRepo = {
  id: 1001,
  name: "fluxlog",
  description: "Structured logging for Flux.",
  html_url: "https://github.com/ada/fluxlog",
  language: "TypeScript",
  topics: ["logging", "observability", "typescript"],
  stargazers_count: 2312,
  forks_count: 88,
  fork: false,
  archived: false,
  pushed_at: "2024-06-01T12:00:00Z",
};

/** A repo with nothing optional set: no description, no language, no topics. */
export const bareRepo: GithubRepo = {
  id: 1002,
  name: "dotfiles",
  description: null,
  html_url: "https://github.com/ada/dotfiles",
  language: null,
  stargazers_count: 12,
  forks_count: 1,
  fork: false,
  archived: false,
  pushed_at: "2023-01-15T09:30:00Z",
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
