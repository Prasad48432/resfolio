import type { StackoverflowTag, StackoverflowUser } from "./stackoverflow";

/** Recorded shapes of the Stack Exchange API's `/users/{id}` and
 * `/users/{id}/top-tags` items (doc 11 fixture discipline). The real payload
 * also carries `reputation`, `location`, `profile_image` and `link`; they are
 * absent here because the connector no longer reads them — the user object is
 * an existence probe now, not a content source. */
export const stackoverflowUser: StackoverflowUser = {
  user_id: 22656,
  display_name: "ada-l",
};

export const stackoverflowTopTags: StackoverflowTag[] = [
  { tag_name: "postgresql", answer_score: 812 },
  { tag_name: "typescript", answer_score: 655 },
  { tag_name: "node.js", answer_score: 244 },
  { tag_name: "", answer_score: 1 },
  { tag_name: "postgresql", answer_score: 5 },
];
