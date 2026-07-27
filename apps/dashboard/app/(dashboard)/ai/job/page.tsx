import { redirect } from "next/navigation";

/**
 * `/ai/job` — retired in Phase 7 (docs/architecture/13-ai-layer.md).
 *
 * **A redirect rather than a deletion, because this URL is in people's history
 * and in the command palette's muscle memory.** The route used to be the whole
 * job workflow: paste a posting into a textarea, read a match, tailor a résumé,
 * write a letter — three stacked panels on a page you had to leave the
 * conversation to reach. All of it now happens in the conversation itself, so
 * there is a real destination to send this to rather than a "this has moved"
 * page to apologise on.
 *
 * `permanentRedirect` is deliberately **not** used: a 308 is cached by the
 * browser forever, and this path is one we may well want back for a job list once
 * the Application Tracker exists. A 307 costs one request and keeps the option.
 */
export default function RetiredJobMatchPage(): never {
  redirect("/ai");
}
