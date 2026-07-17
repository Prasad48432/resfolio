import { DocumentNotFoundError, type DocumentConfig } from "@resfolio/document";
import { getProfileFixture } from "@resfolio/fixtures";
import {
  buildProfileView,
  type ProfileView,
  type ViewDefinition,
} from "@resfolio/profile";

/**
 * Resolve → Project for the resume surface
 * (docs/architecture/09-rendering-pipeline.md): load the profile snapshot and
 * the document's render spec, then run the pure `buildProfileView` — the exact
 * function the dashboard preview runs client-side, which is what makes preview,
 * page, and PDF identical.
 *
 * There is no token here any more (doc 02). A resume has a permanent URL and
 * the row's own `visibility` is the access decision, so this returns a **typed
 * result** rather than a value-or-throw: `private` and `unpublished` are
 * ordinary outcomes the caller must render, not errors. Making them variants
 * means a caller cannot forget them — the compiler asks.
 *
 * The DB-backed path is imported dynamically so the fixture path (dev/CI/the
 * ats-check script) needs no database or `DATABASE_URL`.
 */

/** Which snapshot of the owner's profile to project. */
export type ResumeSnapshot =
  /** The immutable published version — what the public URL always shows. */
  | "published"
  /** The owner's working draft — what the editor preview shows, and therefore
   * what the owner's own PDF export must show to match it. Never reachable
   * without the server-to-server export secret. */
  | "draft";

/** Everything Render needs, plus the cache identity of the snapshot. */
export interface RenderInputs {
  view: ProfileView;
  templateId: string;
  config: DocumentConfig;
  /** The ViewDefinition, carried through for the render key. */
  viewDefinition: ViewDefinition;
  /** Snapshot identity for `renderKey` — changes whenever the content does. */
  revision: string;
}

export type ResumeRenderResult =
  | { status: "ok"; inputs: RenderInputs }
  /** No such document id. */
  | { status: "not-found" }
  /** The document exists but its owner marked it private. */
  | { status: "private" }
  /** Public, but the owner has never published a profile version — there is
   * nothing to show, and showing the draft would defeat the point. */
  | { status: "unpublished" };

export async function resolveResumeRender(
  documentId: string,
  snapshot: ResumeSnapshot,
): Promise<ResumeRenderResult> {
  const { getDocumentForRender } = await import("@resfolio/document/server");

  let spec;
  try {
    spec = await getDocumentForRender(documentId);
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return { status: "not-found" };
    }
    throw error;
  }

  // Visibility gates the *public* surface only, and is checked before any
  // profile data is loaded — a private resume must not cause a read of its
  // owner's profile at all. The `draft` path is the owner's own view of their
  // own document, reached only through the server-to-server export secret, so
  // "private" is not a refusal there: being able to export a private resume is
  // the entire point of marking one private.
  if (snapshot === "published" && spec.visibility === "private") {
    return { status: "private" };
  }

  const { getProfile, getProfileVersionById } =
    await import("@resfolio/profile/server");
  const draft = await getProfile(spec.ownerUserId);

  let profile;
  let revision: string;
  if (snapshot === "draft") {
    profile = draft.data;
    // draftRev bumps on every autosave — that is exactly the property the
    // render key needs, and the reason the old `ref`-based key was wrong.
    revision = `draft:${draft.draftRev}`;
  } else {
    if (!draft.publishedVersionId) {
      return { status: "unpublished" };
    }
    const published = await getProfileVersionById(draft.publishedVersionId);
    if (!published) {
      return { status: "unpublished" };
    }
    profile = published;
    // A version row is immutable, so its id is a permanent content identity.
    revision = `version:${draft.publishedVersionId}`;
  }

  return {
    status: "ok",
    inputs: {
      view: buildProfileView(profile, spec.view),
      templateId: spec.templateId,
      config: spec.config,
      viewDefinition: spec.view,
      revision,
    },
  };
}

/**
 * The fixture path: dev, CI, and the ats-check script, which must run with no
 * database and no user. Fixture profiles ship with the repo and are immutable,
 * so the fixture key is a complete content identity.
 */
export function resolveFixtureRender(
  fixtureKey: string,
  templateId: string,
  config: DocumentConfig,
): RenderInputs {
  const profile = getProfileFixture(fixtureKey);
  return {
    view: buildProfileView(profile, {}),
    templateId,
    config,
    viewDefinition: {},
    revision: `fixture:${fixtureKey}`,
  };
}
