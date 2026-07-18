import { requireSession } from "@resfolio/auth";
import { formatReadingTime } from "@resfolio/blog";
import { listPosts } from "@resfolio/blog/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { PenLine } from "lucide-react";
import Link from "next/link";

import { NewPostButton } from "@/components/blog/new-post-button";
import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/motion";
import { TEST_IDS, blogPostItemTestId } from "@/lib/testids";

/**
 * Blog — the post list.
 *
 * A Server Component: the list is data with links and nothing else, so the
 * only client boundary here is the "New post" button, which calls a Server
 * Action and navigates to the new post.
 */
export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const session = await requireSession();
  // Posts hang off the profile, and a first-time visitor has no profile row —
  // writing before filling in a profile is an ordinary order of events.
  await getOrCreateProfile(session.user.id, {
    name: session.user.name,
    email: session.user.email,
  });
  const posts = await listPosts(session.user.id);

  return (
    <Page>
      <PageHeader
        title="Blog"
        description="Write here and publish to your portfolio. Published posts join your profile's Writing section."
        actions={<NewPostButton />}
      />

      <FadeIn>
        {posts.length === 0 ? (
          <EmptyState
            data-testid={TEST_IDS.blogEmpty}
            icon={PenLine}
            title="Nothing written yet"
            description="Start a post and it saves as you type. Drafts stay private until you publish."
            action={<NewPostButton />}
          />
        ) : (
          <ul className="grid gap-2 min-w-0" data-testid={TEST_IDS.blogList}>
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/blog/${post.id}`}
                  data-testid={blogPostItemTestId(post.id)}
                  className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border px-4 py-3.5 transition-colors duration-150 hover:border-muted hover:bg-accent/40 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-sm md:text-base line-clamp-2 wrap-break-word font-medium">
                      {post.title || (
                        <span className="text-muted">Untitled</span>
                      )}
                    </p>
                    <p className="text-xs md:text-sm mt-0.5 line-clamp-1 text-[13px] text-muted">
                      {post.excerpt || "No excerpt yet."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start text-xs text-muted sm:self-center">
                    <span className="">
                      {formatReadingTime(post.readingMinutes)}
                    </span>
                    <StatusPill published={post.status === "published"} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FadeIn>
    </Page>
  );
}

function StatusPill({ published }: { published: boolean }) {
  return (
    <span
      className={
        published
          ? "rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand"
          : "rounded-full bg-accent px-2 py-0.5 font-medium text-muted"
      }
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}
