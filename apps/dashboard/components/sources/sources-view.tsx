"use client";

import {
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@resfolio/ui";
import {
  ArrowDownToLine,
  ExternalLink,
  FileText,
  Github,
  Inbox,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Rss,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  checkForUpdatesAction,
  connectPublicSourceAction,
  dismissItemAction,
  importItemAction,
  removeConnectionAction,
} from "@/app/(dashboard)/sources/actions";
import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/motion";
import type { RouteTarget } from "@resfolio/integrations";

import type {
  ConnectionView,
  PendingItemView,
  ReceiptView,
} from "@/lib/sources";
import {
  receiptItemTestId,
  receiptReimportTestId,
  sourceCheckUpdatesTestId,
  sourceConnectButtonTestId,
  sourceConnectInputTestId,
  sourceConnectionTestId,
  sourceRemoveTestId,
  TEST_IDS,
  triageDestinationTestId,
  triageEditTestId,
  triageImportGroupTestId,
  triageImportTestId,
  triageItemTestId,
  triageSkipTestId,
} from "@/lib/testids";

/**
 * The Sources import workspace (docs/architecture/12-integrations-and-sync.md):
 * "Import from…" provider gallery on top, then triage — fetched items grouped
 * by destination, with per-item destination override, edit-before-import and
 * skip — the "needs a home" bucket for unrouted content, import history
 * (receipts), and a demoted connected-sources management row. Nothing
 * reaches the profile without an explicit Import click, and imported content
 * is ordinary profile content from then on; publish stays at /profile.
 */
export function SourcesView({
  connections,
  pending,
  receipts,
}: {
  connections: ConnectionView[];
  pending: PendingItemView[];
  receipts: ReceiptView[];
}) {
  return (
    <Page data-testid={TEST_IDS.sourcesPage}>
      <PageHeader
        title="Sources"
        description="Import your work from the places you publish. Everything lands in your profile draft — you stay the editor."
      />
      <FadeIn>
        <div className="flex flex-col gap-10">
          <ProviderGallery />
          <TriageBoard items={pending} />
          <ImportHistory receipts={receipts} />
          <ConnectedSources connections={connections} />
        </div>
      </FadeIn>
    </Page>
  );
}

/* -------------------------------- gallery -------------------------------- */

function ProviderGallery() {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid={TEST_IDS.sourcesGallery}
    >
      <p className="label-section">Import from…</p>
      {/* No `items-start`: that pinned each card to its own content height, so
          a two-line note (RSS) sat visibly shorter than a three-line one
          (Stack Overflow) and the Import buttons landed at four different
          heights. Grid's default `stretch` makes every card in a row match the
          tallest, and each card pushes its form to the bottom with `mt-auto`,
          which is what actually lines the actions up.

          `auto-rows-fr` is what carries that ACROSS rows. Stretch alone only
          equalizes within a row, so with four connectors in a three-up grid the
          orphan on row two kept its own (taller) height — the one card with
          nothing beside it was the one that didn't match. Equal-height rows fix
          that no matter how the count and the breakpoint divide. */}
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PublicConnectCard
          connectorId="github"
          icon={Github}
          name="GitHub"
          note="Public repositories become project suggestions, with stars, language and topics."
          inputKey="username"
          inputLabel="GitHub username"
          placeholder="your-username"
          inputType="text"
        />
        <PublicConnectCard
          connectorId="rss"
          icon={Rss}
          name="RSS / Atom feed"
          note="Medium, Substack, your blog — articles arrive ready to import into Writing."
          inputKey="feedUrl"
          inputLabel="Feed URL"
          placeholder="https://yourblog.com/feed.xml"
          inputType="url"
        />
        <PublicConnectCard
          connectorId="devto"
          icon={FileText}
          name="Dev.to"
          note="Your published Dev.to articles, with reactions, ready to import into Writing."
          inputKey="username"
          inputLabel="Dev.to username"
          placeholder="your-username"
          inputType="text"
        />
        <PublicConnectCard
          connectorId="stackoverflow"
          icon={Layers}
          name="Stack Overflow"
          note="Top answer tags as a skills suggestion, reputation on your profile — you pick what lands."
          inputKey="userId"
          inputLabel="Stack Overflow user id"
          // The old placeholder spelled out "user id (the number in your
          // profile URL)" and truncated mid-word in the card's narrow input,
          // which taught the user nothing. The number's shape says it faster,
          // and the label carries the meaning for screen readers.
          placeholder="1234567"
          inputType="text"
        />
      </div>
    </section>
  );
}

function PublicConnectCard({
  connectorId,
  icon: Icon,
  name,
  note,
  inputKey,
  inputLabel,
  placeholder,
  inputType,
}: {
  connectorId: "github" | "rss" | "devto" | "stackoverflow";
  icon: typeof Rss;
  name: string;
  note: string;
  inputKey: string;
  inputLabel: string;
  placeholder: string;
  inputType: "url" | "text";
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const trimmed = value.trim();
    if (!trimmed || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await connectPublicSourceAction({
        connectorId,
        input: { [inputKey]: trimmed },
      });
      if (result.ok) {
        setValue("");
        if (result.data.runStatus === "failed") {
          setError(
            result.data.runError ??
              "Connected, but the import failed — try Check for updates.",
          );
        }
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const inputId = `sources-connect-${connectorId}`;
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{note}</p>
      <form
        // `mt-auto` collects the slack a shorter note leaves behind, so the
        // input row sits on the same baseline across the whole grid.
        className="mt-auto flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}
      >
        <Label htmlFor={inputId} className="sr-only">
          {inputLabel}
        </Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            type={inputType}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
            disabled={pending}
            data-testid={sourceConnectInputTestId(connectorId)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || value.trim().length === 0}
            data-testid={sourceConnectButtonTestId(connectorId)}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Import
          </Button>
        </div>
        {error ? (
          <span className="text-xs text-brand" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    </Card>
  );
}

/* -------------------------------- triage --------------------------------- */

const NEEDS_A_HOME = "Needs a home";

function TriageBoard({ items }: { items: PendingItemView[] }) {
  const groups = useMemo(() => {
    const byLabel = new Map<string, PendingItemView[]>();
    for (const item of items) {
      const key =
        item.destination === null ? NEEDS_A_HOME : item.destinationLabel;
      byLabel.set(key, [...(byLabel.get(key) ?? []), item]);
    }
    // Routed groups first, the unrouted bucket always last.
    return [...byLabel.entries()].sort(([a], [b]) => {
      if (a === NEEDS_A_HOME) return 1;
      if (b === NEEDS_A_HOME) return -1;
      return a.localeCompare(b);
    });
  }, [items]);

  return (
    <section
      className="flex flex-col gap-3"
      data-testid={TEST_IDS.sourcesTriage}
    >
      <p className="label-section">
        To review{items.length > 0 ? ` · ${items.length}` : ""}
      </p>
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing to review"
          description="Import from a source above — fetched items appear here, grouped by where they'll land in your profile."
          data-testid={TEST_IDS.sourcesTriageEmpty}
        />
      ) : (
        groups.map(([label, groupItems]) => (
          <TriageGroup key={label} label={label} items={groupItems} />
        ))
      )}
    </section>
  );
}

function TriageGroup({
  label,
  items,
}: {
  label: string;
  items: PendingItemView[];
}) {
  const router = useRouter();
  const [importingAll, setImportingAll] = useState(false);
  const unrouted = label === NEEDS_A_HOME;

  async function importAll() {
    setImportingAll(true);
    try {
      for (const item of items) {
        const result = await importItemAction({ itemId: item.id });
        if (!result.ok) {
          break;
        }
      }
      router.refresh();
    } finally {
      setImportingAll(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-muted">
          {items.length} → {label}
        </span>
        {!unrouted ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={importingAll}
            onClick={() => void importAll()}
            data-testid={triageImportGroupTestId(label)}
          >
            {importingAll ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ArrowDownToLine aria-hidden />
            )}
            Import all
          </Button>
        ) : (
          <span className="text-xs text-muted">
            Pick a destination for each item — nothing is dropped.
          </span>
        )}
      </div>
      {items.map((item) => (
        <TriageRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function TriageRow({ item }: { item: PendingItemView }) {
  const router = useRouter();
  const [pending, setPending] = useState<"import" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [destination, setDestination] = useState<RouteTarget | null>(
    item.destination,
  );

  const edits = useMemo(() => {
    const changed: Record<string, string> = {};
    for (const field of item.editableFields) {
      const value = fields[field.key];
      if (value !== undefined && value !== field.value) {
        changed[field.key] = value;
      }
    }
    return Object.keys(changed).length > 0 ? changed : undefined;
  }, [fields, item.editableFields]);

  async function doImport() {
    if (destination === null) {
      setError("Choose a destination first.");
      return;
    }
    setPending("import");
    setError(null);
    try {
      const result = await importItemAction({
        itemId: item.id,
        // Send the override only when it differs from the staged route.
        routeTo: destination !== item.destination ? destination : undefined,
        edits,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setPending(null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(null);
    }
  }

  async function skip() {
    setPending("skip");
    setError(null);
    try {
      const result = await dismissItemAction({ itemId: item.id });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setPending(null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(null);
    }
  }

  const showDestinationPicker =
    item.destination === null || item.destinationOptions.length > 1;

  return (
    <Card
      className="flex flex-col gap-2.5 p-4"
      data-testid={triageItemTestId(item.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted">
              {item.kindLabel} · {item.connectorName}
            </span>
            {item.confidence === "suggested" && item.destination !== null ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                Suggested → {item.destinationLabel}
              </span>
            ) : null}
          </div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{item.title}</span>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted transition-colors duration-(--duration-fast) ease-out hover:text-brand"
                aria-label={`Open ${item.title}`}
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </span>
          {item.detail ? (
            <p className="line-clamp-2 text-[13px] leading-relaxed text-muted">
              {item.detail}
            </p>
          ) : null}
          {item.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border bg-surface-warm px-1.5 py-0.5 text-[11px] text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showDestinationPicker ? (
            <Select
              value={destination ?? undefined}
              onValueChange={(value) => {
                setDestination(value as RouteTarget);
                setError(null);
              }}
            >
              <SelectTrigger
                className="h-9 w-44"
                aria-label="Destination"
                data-testid={triageDestinationTestId(item.id)}
              >
                <SelectValue placeholder="Destination…" />
              </SelectTrigger>
              <SelectContent>
                {item.destinationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => setEditing((value) => !value)}
            aria-label={`Edit ${item.title} before importing`}
            aria-pressed={editing}
            data-testid={triageEditTestId(item.id)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending !== null || destination === null}
            onClick={() => void doImport()}
            data-testid={triageImportTestId(item.id)}
          >
            {pending === "import" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ArrowDownToLine aria-hidden />
            )}
            Import
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => void skip()}
            aria-label="Skip"
            data-testid={triageSkipTestId(item.id)}
          >
            <X aria-hidden />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          {item.editableFields.map((field) => {
            const id = `edit-${item.id}-${field.key}`;
            const value = fields[field.key] ?? field.value;
            return (
              <div key={field.key} className="flex flex-col gap-1">
                <Label htmlFor={id} className="text-xs text-muted">
                  {field.label}
                </Label>
                {field.multiline ? (
                  <Textarea
                    id={id}
                    rows={3}
                    value={value}
                    onChange={(event) =>
                      setFields((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={id}
                    value={value}
                    onChange={(event) =>
                      setFields((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
          <span className="text-[11px] text-muted">
            Edits apply to your copy when you import — the source is never
            written to.
          </span>
        </div>
      ) : null}
      {error ? (
        <span className="text-xs text-brand" role="alert">
          {error}
        </span>
      ) : null}
    </Card>
  );
}

/* -------------------------------- history -------------------------------- */

function ImportHistory({ receipts }: { receipts: ReceiptView[] }) {
  const updates = receipts.filter((receipt) => receipt.refreshAvailable).length;
  return (
    <section
      className="flex flex-col gap-3"
      data-testid={TEST_IDS.sourcesHistory}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="label-section">
          Imported{receipts.length > 0 ? ` · ${receipts.length}` : ""}
        </p>
        {updates > 0 ? (
          <span className="text-xs text-muted">
            {updates === 1
              ? "1 item has a newer version"
              : `${updates} items have newer versions`}
          </span>
        ) : null}
      </div>
      {receipts.length === 0 ? (
        <p className="text-[13px] text-muted">
          Nothing imported yet. Imported items become ordinary profile content —
          edit them at{" "}
          <Link href="/profile" className="underline underline-offset-2">
            /profile
          </Link>
          , publish when ready.
        </p>
      ) : (
        receipts.map((receipt) => (
          <ReceiptRow key={receipt.id} receipt={receipt} />
        ))
      )}
    </section>
  );
}

function ReceiptRow({ receipt }: { receipt: ReceiptView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reimport() {
    // A re-import over a user-edited copy replaces the user's words — it
    // needs the explicit second click on the warning (doc 12).
    if (receipt.userEdited && !confirming) {
      setConfirming(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await importItemAction({ itemId: receipt.id });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setPending(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card
      className="flex flex-col gap-1.5 px-4 py-3"
      data-testid={receiptItemTestId(receipt.id)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{receipt.title}</span>
            {receipt.url ? (
              <a
                href={receipt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted transition-colors duration-(--duration-fast) ease-out hover:text-brand"
                aria-label={`Open ${receipt.title}`}
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </span>
          <span className="text-xs text-muted">
            → {receipt.destinationLabel} · {receipt.connectorName} ·{" "}
            {new Date(receipt.lastChangedAt).toLocaleDateString()} ·{" "}
            <Link
              href="/profile"
              className="underline underline-offset-2 hover:text-brand"
            >
              View in profile
            </Link>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {receipt.refreshAvailable ? (
            <>
              <span className="rounded-full border border-brand/40 px-2 py-0.5 text-[11px] text-brand">
                Newer version available
              </span>
              <Button
                type="button"
                size="sm"
                variant={confirming ? "primary" : "ghost"}
                disabled={pending}
                onClick={() => void reimport()}
                data-testid={receiptReimportTestId(receipt.id)}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                {confirming ? "Replace my copy" : "Re-import"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {confirming ? (
        <span className="text-xs text-brand" role="alert">
          You&apos;ve edited this item since importing it — re-importing will
          replace your edited copy.
        </span>
      ) : null}
      {error ? (
        <span className="text-xs text-brand" role="alert">
          {error}
        </span>
      ) : null}
    </Card>
  );
}

/* ---------------------------- connected sources --------------------------- */

const STATUS_LABELS: Record<string, string> = {
  active: "Connected",
  needs_reauth: "Needs re-authorization",
  degraded: "Having trouble",
  disabled: "Disabled",
};

function ConnectedSources({ connections }: { connections: ConnectionView[] }) {
  if (connections.length === 0) {
    return null;
  }
  return (
    <section
      className="flex flex-col gap-3"
      data-testid={TEST_IDS.sourcesConnections}
    >
      <p className="label-section">Connected sources</p>
      <div className="flex flex-col gap-2">
        {connections.map((connection) => (
          <ConnectionRow key={connection.id} connection={connection} />
        ))}
      </div>
    </section>
  );
}

function ConnectionRow({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function checkForUpdates() {
    setChecking(true);
    setNote(null);
    try {
      const result = await checkForUpdatesAction({
        connectionId: connection.id,
      });
      if (result.ok) {
        const { counts, runStatus, runError } = result.data;
        setNote(
          runStatus === "failed"
            ? (runError ?? "Check failed.")
            : `${counts.new} new to review, ${counts.refreshAvailable} newer ${
                counts.refreshAvailable === 1 ? "version" : "versions"
              } available.`,
        );
        router.refresh();
      } else {
        setNote(result.error);
      }
    } catch {
      setNote("Check failed. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      const result = await removeConnectionAction({
        connectionId: connection.id,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setNote(result.error);
        setRemoving(false);
      }
    } catch {
      setNote("Couldn't remove this source.");
      setRemoving(false);
    }
  }

  return (
    <Card
      className="flex flex-col gap-1.5 px-4 py-3"
      data-testid={sourceConnectionTestId(connection.id)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {connection.connectorName}
          </span>
          {connection.inputLabel ? (
            <span className="truncate font-mono text-xs text-muted">
              {connection.inputLabel}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {connection.refreshable ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={checking || removing}
              onClick={() => void checkForUpdates()}
              data-testid={sourceCheckUpdatesTestId(connection.id)}
            >
              {checking ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Check for updates
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={checking || removing}
            onClick={() => void remove()}
            aria-label={`Remove ${connection.connectorName}`}
            data-testid={sourceRemoveTestId(connection.id)}
          >
            {removing ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{STATUS_LABELS[connection.status] ?? connection.status}</span>
        {connection.lastCheckedAt ? (
          <span>
            Last checked {new Date(connection.lastCheckedAt).toLocaleString()}
          </span>
        ) : null}
        <span>
          Removing a source never removes what you imported — that&apos;s your
          content now.
        </span>
      </div>
      {note ? (
        <span className="text-xs text-muted" role="status">
          {note}
        </span>
      ) : null}
    </Card>
  );
}
