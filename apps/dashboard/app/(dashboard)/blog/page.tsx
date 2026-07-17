import { ComingSoon } from "@/components/coming-soon";

/**
 * Blog — the reserved route for **native** posts (doc 12's "Notion as CMS"
 * future work, inverted: Resfolio hosts the writing itself).
 *
 * Scaffold only, deliberately. Today's Writing section holds *references* to
 * articles published elsewhere — title, publisher, URL, date — imported from
 * RSS and Dev.to. A native post is a different thing: it needs a body, a slug,
 * a draft/published state, and a renderer in every portfolio template. That is
 * a profile schema change (doc 01) and a template contract change (doc 05),
 * not a page. Reserving the URL and the nav slot now means those land as
 * additions rather than as a re-organisation.
 */
export default function BlogPage() {
  return (
    <ComingSoon
      title="Blog"
      phase={8}
      description="Write posts natively in Resfolio and publish them to your portfolio."
      bullets={[
        "Write here, publish to your portfolio — no external blog required",
        "Imported articles stay what they are: links to writing you published elsewhere",
        "Native posts and imported references live side by side in Writing",
      ]}
    />
  );
}
