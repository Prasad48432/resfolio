import { requireSession } from "@resfolio/auth";
import { BlogPostNotFoundError } from "@resfolio/blog";
import { getPost } from "@resfolio/blog/server";
import { assetUrl } from "@resfolio/storage";
import { isStorageConfigured, publicBaseUrl } from "@resfolio/storage/server";
import { notFound } from "next/navigation";

import { PostEditor } from "@/components/blog/post-editor";
import { maxImagesPerPost } from "@/lib/blog-config";

/**
 * The post editor route.
 *
 * Loads the post server-side (ownership is enforced inside `getPost`, which is
 * user-scoped — this page never assumes the id in the URL belongs to the
 * session) and hands it to the client island.
 *
 * The cover **key** is resolved to a URL here rather than in the browser: the
 * public base URL is server configuration, and resolving it once on the server
 * keeps the delivery origin out of the client bundle.
 */
export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  let post;
  try {
    post = await getPost(session.user.id, id);
  } catch (error) {
    if (error instanceof BlogPostNotFoundError) {
      // A post that isn't yours is indistinguishable from one that doesn't
      // exist — a distinct error would confirm the id belongs to someone.
      notFound();
    }
    throw error;
  }

  const coverUrl =
    post.coverAssetKey && isStorageConfigured()
      ? assetUrl(post.coverAssetKey, publicBaseUrl())
      : null;

  return (
    <PostEditor
      post={post}
      coverUrl={coverUrl}
      maxImages={maxImagesPerPost()}
    />
  );
}
