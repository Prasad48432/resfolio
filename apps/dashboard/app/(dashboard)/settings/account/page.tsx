import { auth, getSignInProviders, requireSession } from "@resfolio/auth";
import { headers } from "next/headers";
import Image from "next/image";

import { TEST_IDS } from "@/lib/testids";

import { LinkedAccounts } from "./linked-accounts";

export default async function AccountSettingsPage() {
  // Defense in depth: pages guard themselves too, not just the layout.
  const { user } = await requireSession();
  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });
  const providers = getSignInProviders();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="label-eyebrow">Settings</p>
        <h2 className="font-display text-3xl text-foreground">Account</h2>
      </div>

      <section
        className="card-surface flex items-center gap-4 p-6"
        aria-label="Account identity"
        data-testid={TEST_IDS.settingsAccountCard}
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-full border border-border"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-12 items-center justify-center rounded-full bg-surface-warm text-lg font-semibold text-accent"
          >
            {user.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {user.name}
          </p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </section>

      <section
        className="flex flex-col gap-4"
        aria-label="Linked accounts"
        data-testid={TEST_IDS.settingsLinkedAccounts}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Linked accounts
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Sign in with either provider — both land in this account. You
            can&rsquo;t unlink your last one.
          </p>
        </div>
        <LinkedAccounts
          providers={providers}
          accounts={accounts.map((account) => ({
            accountId: account.accountId,
            providerId: account.providerId,
          }))}
        />
      </section>
    </div>
  );
}
