import {
  COMPATIBLE_ROUTE_TARGETS,
  getConnector,
  type CandidateItem,
  type CandidateKind,
  type RouteTarget,
} from "@resfolio/integrations";
import type {
  ConnectionRecord,
  ImportReceiptRecord,
  PendingItemRecord,
} from "@resfolio/integrations/server";

/**
 * Plain serializable DTOs for the Sources import workspace — computed
 * server-side so the client island renders display strings, not domain
 * objects (and no `raw` provider payloads ever cross to the client).
 */

export interface ConnectionView {
  id: string;
  connectorId: string;
  connectorName: string;
  /** What the user connected — a feed URL, a username — or null (oauth2). */
  inputLabel: string | null;
  status: string;
  /** May offer "Check for updates". */
  refreshable: boolean;
  lastCheckedAt: string | null;
}

/** A destination option the user can pick for an item. */
export interface DestinationOption {
  value: RouteTarget;
  label: string;
}

/** One editable field for the inline edit-before-import form. */
export interface EditableField {
  key: string;
  label: string;
  value: string;
  multiline: boolean;
}

export interface PendingItemView {
  id: string;
  kind: string;
  kindLabel: string;
  connectorName: string;
  title: string;
  url: string | null;
  /** One quiet line of context: description/summary/publisher. */
  detail: string;
  tags: string[];
  /** Resolved destination — null = unrouted ("needs a home"). */
  destination: RouteTarget | null;
  destinationLabel: string;
  /** `suggested` destinations are shown, never assumed. */
  confidence: "certain" | "suggested";
  /** What the user's destination override may pick from. */
  destinationOptions: DestinationOption[];
  editableFields: EditableField[];
}

export interface ReceiptView {
  id: string;
  connectorName: string;
  kindLabel: string;
  title: string;
  url: string | null;
  destinationLabel: string;
  /** Newer version upstream — show the badge + re-import button. */
  refreshAvailable: boolean;
  /** A re-import would replace the user's edited copy — warn first. */
  userEdited: boolean;
  lastChangedAt: string;
}

export const DESTINATION_LABELS: Record<RouteTarget, string> = {
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  writing: "Writing",
  certifications: "Certifications",
  awards: "Awards",
  languages: "Languages",
  custom: "Custom section",
  links: "Profile links",
};

const KIND_LABELS: Record<CandidateKind, string> = {
  project: "Project",
  contribution: "Contribution",
  article: "Article",
  talk: "Talk",
  experience: "Experience",
  education: "Education",
  skillGroup: "Skill group",
  certification: "Certification",
  profileLink: "Profile link",
  unclassified: "Unclassified",
};

export function toConnectionView(record: ConnectionRecord): ConnectionView {
  const input = record.input as Record<string, unknown> | null;
  const inputLabel =
    input && typeof input === "object"
      ? (Object.values(input).find((value) => typeof value === "string") as
          | string
          | undefined) ?? null
      : null;
  return {
    id: record.id,
    connectorId: record.connectorId,
    connectorName: record.connectorName,
    inputLabel,
    status: record.status,
    refreshable: record.refreshable,
    lastCheckedAt: record.lastSyncedAt?.toISOString() ?? null,
  };
}

function detailFor(candidate: CandidateItem): string {
  switch (candidate.kind) {
    case "project":
    case "contribution":
      return candidate.payload.description;
    case "article":
      return [candidate.payload.publisher, candidate.payload.summary]
        .filter(Boolean)
        .join(" — ");
    case "talk":
      return candidate.payload.summary;
    case "experience":
      return [candidate.payload.company, candidate.payload.role]
        .filter(Boolean)
        .join(" — ");
    case "education":
      return [candidate.payload.institution, candidate.payload.degree]
        .filter(Boolean)
        .join(" — ");
    case "skillGroup":
      return candidate.payload.skills.join(", ");
    case "certification":
      return candidate.payload.issuer;
    case "profileLink":
      return candidate.payload.url;
    case "unclassified":
      return candidate.payload.text;
  }
}

function tagsFor(candidate: CandidateItem): string[] {
  if (candidate.kind === "project" || candidate.kind === "contribution") {
    return candidate.payload.technologies.slice(0, 6);
  }
  if (candidate.kind === "skillGroup") {
    return candidate.payload.skills.slice(0, 6);
  }
  return [];
}

/** The 2–3 payload fields worth editing inline before an import. Keys are
 * payload keys — `importItem` merges them and re-validates with the domain
 * schema, so nothing invalid can reach the draft. */
function editableFieldsFor(candidate: CandidateItem): EditableField[] {
  const text = (key: string, label: string, value: string): EditableField => ({
    key,
    label,
    value,
    multiline: false,
  });
  const area = (key: string, label: string, value: string): EditableField => ({
    key,
    label,
    value,
    multiline: true,
  });
  switch (candidate.kind) {
    case "project":
    case "contribution":
      return [
        text("name", "Name", candidate.payload.name),
        area("description", "Description", candidate.payload.description),
      ];
    case "article":
      return [
        text("title", "Title", candidate.payload.title),
        area("summary", "Summary", candidate.payload.summary),
      ];
    case "talk":
      return [
        text("title", "Title", candidate.payload.title),
        area("summary", "Summary", candidate.payload.summary),
      ];
    case "experience":
      return [
        text("company", "Company", candidate.payload.company),
        text("role", "Role", candidate.payload.role),
        area("summary", "Summary", candidate.payload.summary),
      ];
    case "education":
      return [
        text("institution", "Institution", candidate.payload.institution),
        text("degree", "Degree", candidate.payload.degree),
        area("summary", "Summary", candidate.payload.summary),
      ];
    case "skillGroup":
      return [text("name", "Group name", candidate.payload.name)];
    case "certification":
      return [
        text("name", "Name", candidate.payload.name),
        text("issuer", "Issuer", candidate.payload.issuer),
      ];
    case "profileLink":
      // The label is taste ("GitHub" vs "Code"); the url is a fact the
      // connector derived — editing it would only break the link.
      return [text("label", "Label", candidate.payload.label)];
    case "unclassified":
      return [
        text("title", "Title", candidate.payload.title),
        area("text", "Text", candidate.payload.text),
      ];
  }
}

export function toPendingItemView(record: PendingItemRecord): PendingItemView {
  const destination = record.route.sectionKey;
  return {
    id: record.id,
    kind: record.kind,
    kindLabel: KIND_LABELS[record.kind] ?? record.kind,
    connectorName:
      getConnector(record.connectorId)?.name ?? record.connectorId,
    title: record.candidate.title,
    url: record.candidate.url ?? null,
    detail: detailFor(record.candidate).slice(0, 200),
    tags: tagsFor(record.candidate),
    destination,
    destinationLabel: destination
      ? DESTINATION_LABELS[destination]
      : "Needs a home",
    confidence: record.route.confidence,
    destinationOptions: COMPATIBLE_ROUTE_TARGETS[record.kind].map((value) => ({
      value,
      label: DESTINATION_LABELS[value],
    })),
    editableFields: editableFieldsFor(record.candidate),
  };
}

export function toReceiptView(record: ImportReceiptRecord): ReceiptView {
  const applied = record.appliedSectionKey as RouteTarget | null;
  return {
    id: record.id,
    connectorName:
      getConnector(record.connectorId)?.name ?? record.connectorId,
    kindLabel: KIND_LABELS[record.kind] ?? record.kind,
    title: record.title,
    url: record.url,
    destinationLabel: applied ? DESTINATION_LABELS[applied] : "Profile",
    refreshAvailable: record.state === "refresh_available",
    userEdited: record.userEdited,
    lastChangedAt: record.lastChangedAt.toISOString(),
  };
}
