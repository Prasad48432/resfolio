import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@resfolio/database";
import { viewDefinitionSchema, type ViewDefinition } from "@resfolio/profile";

import {
  DocumentDataError,
  DocumentNotFoundError,
  DuplicateTemplateError,
} from "../errors";
import {
  documentConfigSchema,
  documentVisibilitySchema,
  updateDocumentSchema,
  type DocumentConfig,
  type DocumentKind,
  type DocumentRecord,
  type DocumentVisibility,
  type NewDocumentInput,
  type UpdateDocumentInput,
} from "../schema";

/**
 * Document persistence (docs/architecture/07-storage.md). The only code that
 * touches the `documents` table. Every mutating/reading function takes the auth
 * context (`userId`) explicitly and scopes every query to the profile that user
 * owns — ownership is enforced here, never assumed from the caller
 * (docs/architecture/06-api-architecture.md, 10-auth-and-security.md). The lone
 * exception is `getDocumentForRender`, called by the render host where the
 * signed short-TTL token is the capability, not a session.
 */

function toRecord(row: typeof schema.document.$inferSelect): DocumentRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    kind: row.kind as DocumentKind,
    name: row.name,
    templateId: row.templateId,
    templateMajor: row.templateMajor,
    config: documentConfigSchema.parse(row.config),
    view: viewDefinitionSchema.parse(row.view),
    visibility: documentVisibilitySchema.parse(row.visibility),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The id of the profile a user owns (unique `user_id`), or throw. Documents
 * are scoped through this so a user can only ever see or mutate their own. */
async function requireProfileId(userId: string): Promise<string> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true },
  });
  if (!row) {
    throw new DocumentDataError("No profile exists for this user.");
  }
  return row.id;
}

export async function createDocument(
  userId: string,
  input: NewDocumentInput,
): Promise<DocumentRecord> {
  const profileId = await requireProfileId(userId);

  // One document per template: a template already renders the entire profile,
  // so a second document on the same template would be a duplicate view of the
  // same content, not a new document. Enforced here (server-authoritative) so
  // the rule holds regardless of which caller reaches it.
  const existing = await db.query.document.findFirst({
    where: and(
      eq(schema.document.profileId, profileId),
      eq(schema.document.templateId, input.templateId),
    ),
    columns: { id: true },
  });
  if (existing) {
    throw new DuplicateTemplateError(input.templateId);
  }

  const inserted = await db
    .insert(schema.document)
    .values({
      profileId,
      kind: input.kind ?? "resume",
      name: input.name,
      templateId: input.templateId,
      templateMajor: input.templateMajor,
      config: documentConfigSchema.parse(input.config),
      view: viewDefinitionSchema.parse(input.view ?? {}),
      visibility: documentVisibilitySchema.parse(input.visibility ?? "public"),
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new DocumentDataError("Failed to create document.");
  }
  return toRecord(row);
}

/** A user's documents, most-recently-updated first. */
export async function listDocuments(userId: string): Promise<DocumentRecord[]> {
  const profileId = await requireProfileId(userId);
  const rows = await db.query.document.findMany({
    where: eq(schema.document.profileId, profileId),
    orderBy: desc(schema.document.updatedAt),
  });
  return rows.map(toRecord);
}

export async function getDocument(
  userId: string,
  id: string,
): Promise<DocumentRecord> {
  const profileId = await requireProfileId(userId);
  const row = await db.query.document.findFirst({
    where: and(
      eq(schema.document.id, id),
      eq(schema.document.profileId, profileId),
    ),
  });
  if (!row) {
    throw new DocumentNotFoundError();
  }
  return toRecord(row);
}

export async function updateDocument(
  userId: string,
  id: string,
  patch: UpdateDocumentInput,
): Promise<DocumentRecord> {
  const profileId = await requireProfileId(userId);
  const validated = updateDocumentSchema.parse(patch);

  const updated = await db
    .update(schema.document)
    .set(validated)
    .where(
      and(eq(schema.document.id, id), eq(schema.document.profileId, profileId)),
    )
    .returning();

  const row = updated[0];
  if (!row) {
    throw new DocumentNotFoundError();
  }
  return toRecord(row);
}

export async function deleteDocument(
  userId: string,
  id: string,
): Promise<void> {
  const profileId = await requireProfileId(userId);
  const deleted = await db
    .delete(schema.document)
    .where(
      and(eq(schema.document.id, id), eq(schema.document.profileId, profileId)),
    )
    .returning({ id: schema.document.id });
  if (deleted.length === 0) {
    throw new DocumentNotFoundError();
  }
}

export interface DocumentRenderSpec {
  templateId: string;
  config: DocumentConfig;
  view: ViewDefinition;
  /** `private` → the host renders "this resume is private" and no profile data
   * is ever loaded. The check belongs to the caller, but the answer belongs to
   * the row, so it travels with the spec and cannot be forgotten. */
  visibility: DocumentVisibility;
  /** The owning user, so the host can resolve *whose* published profile version
   * to project. Not a secret — it never leaves the server (doc 02: the public
   * page renders the published snapshot, never the draft). */
  ownerUserId: string;
}

/**
 * The render inputs for a document, resolved by id for the render host.
 *
 * Deliberately **not** user-scoped, and no longer token-guarded: a resume's
 * permanent URL is public by design (doc 02), so the row's own `visibility` is
 * the access decision and this returns it rather than assuming a caller
 * checked. A private document still resolves here — the host needs the row to
 * know it must say "private" instead of 404, and a 404 would leak the
 * difference between "no such resume" and "not yours".
 */
export async function getDocumentForRender(
  id: string,
): Promise<DocumentRenderSpec> {
  const row = await db.query.document.findFirst({
    where: eq(schema.document.id, id),
    with: { profile: { columns: { userId: true } } },
  });
  if (!row) {
    throw new DocumentNotFoundError();
  }
  return {
    templateId: row.templateId,
    config: documentConfigSchema.parse(row.config),
    view: viewDefinitionSchema.parse(row.view),
    visibility: documentVisibilitySchema.parse(row.visibility),
    ownerUserId: row.profile.userId,
  };
}
