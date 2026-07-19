import { Card } from "@resfolio/ui";
import { ArrowUpRight, PenLine } from "lucide-react";
import Link from "next/link";

import { TEST_IDS } from "@/lib/testids";

/**
 * The Writing entries that come from natively authored blog posts.
 *
 * These are **not** in the profile draft and are deliberately not editable
 * here. A post lives in its own table and is projected into the Writing
 * section at read time (`withNativePosts` in `@resfolio/blog`), so there is
 * exactly one copy of every fact and no way for the two to drift — publishing,
 * retitling, or deleting a post moves this list with no sync step.
 *
 * They are shown anyway, and that is the point of this component: the section
 * a user's posts appear in would otherwise look empty, and an automatic
 * behaviour nobody can see reads as a bug. Rows are inert with a link to the
 * one place they *can* be edited.
 */
export interface ProjectedPost {
  id: string;
  title: string;
  excerpt: string;
  /** `YYYY-MM-DD`, already formatted for display by the server. */
  publishedOn: string;
  readingMinutes: number;
  tagCount: number;
}

export function ProjectedPosts({ posts }: { posts: readonly ProjectedPost[] }) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid={TEST_IDS.profileProjectedPosts}>
      <p className="text-xs text-muted">
        {posts.length === 1 ? "1 published post" : `${posts.length} published posts`}{" "}
        from your blog appear here automatically.
      </p>

      {posts.map((post) => (
        <Card key={post.id} className="flex items-start gap-3 p-3">
          <span
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-warm text-muted"
            aria-hidden
          >
            <PenLine className="size-3.5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {post.title}
              </span>
              <span className="shrink-0 rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted">
                From blog
              </span>
            </div>
            {post.excerpt ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                {post.excerpt}
              </p>
            ) : null}
            <p className="mt-1 font-mono text-[11px] text-muted">
              {post.publishedOn} · {post.readingMinutes} min read
              {post.tagCount > 0 ? ` · ${post.tagCount} tags` : ""}
            </p>
          </div>

          <Link
            href={`/blog/${post.id}`}
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-accent hover:text-foreground"
          >
            Edit
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </Card>
      ))}
    </div>
  );
}
