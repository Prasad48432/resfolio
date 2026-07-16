import type { DevtoArticle } from "./devto";

/** Recorded shape of `GET https://dev.to/api/articles?username=…` (doc 11
 * fixture discipline) — the fields this connector reads plus typical noise. */
export const devtoArticles: DevtoArticle[] = [
  {
    id: 180042,
    title: "Postgres Row-Level Security in Practice",
    description: "What RLS actually buys you, and where it bites.",
    url: "https://dev.to/ada/postgres-rls-in-practice-4k2n",
    published_at: "2026-05-11T08:30:00Z",
    tag_list: ["postgres", "security", "backend"],
    positive_reactions_count: 214,
    comments_count: 18,
  },
  {
    id: 177310,
    title: "A Quieter CI Pipeline",
    description: "",
    url: "https://dev.to/ada/a-quieter-ci-pipeline-77aa",
    published_at: "2026-03-02T17:05:00Z",
    tag_list: "ci, devops",
    positive_reactions_count: 89,
  },
  // Draft-ish row the API can emit: no published_at, still listed.
  {
    id: 190001,
    title: "  ",
    description: null,
    url: "https://dev.to/ada/untitled-1",
    published_at: null,
  },
];
