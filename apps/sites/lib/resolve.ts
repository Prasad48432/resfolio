import type { DocumentRenderSpec } from "@resfolio/document/server";
import type {
  RenderDocumentRef,
  RenderSource,
  RenderTokenPayload,
} from "@resfolio/document/token";
import { getProfileFixture } from "@resfolio/fixtures";
import {
  buildProfileView,
  type Profile,
  type ProfileView,
} from "@resfolio/profile";

/**
 * Resolve → Project (docs/architecture/09-rendering-pipeline.md): load the
 * profile snapshot and the render spec named by the token, then run the pure
 * `buildProfileView` — the exact function the dashboard preview runs
 * client-side, which is what makes preview and PDF identical. The DB-backed
 * sources (`draft`/`version`) and the stored-document lookup are imported
 * dynamically so the fixture + inline path (dev/CI/export script) needs no
 * database or DATABASE_URL.
 */
async function resolveProfile(
  source: RenderSource,
  ref: string,
): Promise<Profile> {
  switch (source) {
    case "fixture":
      return getProfileFixture(ref);
    case "draft": {
      const { getProfile } = await import("@resfolio/profile/server");
      return (await getProfile(ref)).data;
    }
    case "version": {
      const { getPublishedProfile } = await import("@resfolio/profile/server");
      const published = await getPublishedProfile(ref);
      if (!published) {
        throw new Error("No published version exists for this profile.");
      }
      return published;
    }
  }
}

/** The template + config + view to render: inline (carried by the token, no DB)
 * or a stored `documents` row the host looks up. */
export async function resolveRenderSpec(
  document: RenderDocumentRef,
): Promise<DocumentRenderSpec> {
  if (document.kind === "inline") {
    return {
      templateId: document.templateId,
      config: document.config,
      view: document.view ?? {},
    };
  }
  const { getDocumentForRender } = await import("@resfolio/document/server");
  return getDocumentForRender(document.id);
}

export interface ResolvedRender {
  view: ProfileView;
  spec: DocumentRenderSpec;
}

export async function resolveRender(
  payload: RenderTokenPayload,
): Promise<ResolvedRender> {
  const spec = await resolveRenderSpec(payload.document);
  const profile = await resolveProfile(payload.source, payload.ref);
  return { view: buildProfileView(profile, spec.view), spec };
}
