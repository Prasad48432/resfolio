import { auth, getSignInProviders, requireSession } from "@resfolio/auth";
import { Card } from "@resfolio/ui";
import { headers } from "next/headers";
import Image from "next/image";

import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
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
    <Page>
      <PageHeader
        title="Account"
        description="Your identity and sign-in methods."
      />

      <SettingsNav />

      <Card
        asChild
        className="flex items-center gap-4 p-5"
        data-testid={TEST_IDS.settingsAccountCard}
      >
        <section aria-label="Account identity">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border border-border"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-full bg-surface-warm text-sm font-semibold text-brand"
            >
              {user.name.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
          </div>
        </section>
      </Card>

      <section
        className="flex flex-col gap-3"
        aria-label="Linked accounts"
        data-testid={TEST_IDS.settingsLinkedAccounts}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">
            Linked accounts
          </h3>
          <p className="text-[13px] leading-relaxed text-muted">
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
    </Page>
  );
}
