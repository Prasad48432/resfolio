"use client";

import type { SignInProvider } from "@resfolio/auth";
import { authClient } from "@resfolio/auth/client";
import { Button } from "@resfolio/ui";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  linkedAccountRowTestId,
  linkProviderTestId,
  TEST_IDS,
  unlinkProviderTestId,
} from "@/lib/testids";

const SETTINGS_URL = "/settings/account";

interface LinkedAccount {
  accountId: string;
  providerId: string;
}

function brandLabel(providerId: string): string {
  return providerId.endsWith("github") ? "GitHub" : "Google";
}

/**
 * Link/unlink UI over Better Auth's account APIs. The last-provider guard
 * is enforced server-side (allowUnlinkingAll stays false, doc 10); the
 * disabled button mirrors it so users aren't offered an action that fails.
 */
export function LinkedAccounts({
  providers,
  accounts,
}: {
  providers: SignInProvider[];
  accounts: LinkedAccount[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(provider: SignInProvider) {
    setError(null);
    setPendingId(provider.id);
    try {
      if (provider.kind === "social") {
        await authClient.linkSocial({
          provider: provider.id,
          callbackURL: SETTINGS_URL,
        });
      } else {
        await authClient.oauth2.link({
          providerId: provider.id,
          callbackURL: SETTINGS_URL,
        });
      }
    } catch {
      setError("Linking didn't complete. Please try again.");
      setPendingId(null);
    }
  }

  async function unlink(provider: SignInProvider, account: LinkedAccount) {
    setError(null);
    setPendingId(provider.id);
    const { error: unlinkError } = await authClient.unlinkAccount({
      providerId: account.providerId,
      accountId: account.accountId,
    });
    if (unlinkError) {
      setError(
        unlinkError.message ?? "Unlinking didn't complete. Please try again.",
      );
    }
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="card-surface divide-y divide-border">
      {providers.map((provider) => {
        const account = accounts.find(
          (candidate) => candidate.providerId === provider.id,
        );
        const linked = Boolean(account);
        const lastRemaining = linked && accounts.length <= 1;
        const pending = pendingId === provider.id;

        return (
          <div
            key={provider.id}
            className="flex items-center justify-between gap-4 px-6 py-4"
            data-testid={linkedAccountRowTestId(provider.id)}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                {brandLabel(provider.id)}
              </span>
              {linked ? (
                <span className="flex items-center gap-1 text-xs text-live">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Connected
                </span>
              ) : (
                <span className="text-xs text-muted">Not connected</span>
              )}
            </div>
            {linked && account ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pendingId !== null || lastRemaining}
                title={
                  lastRemaining
                    ? "You can't unlink your only sign-in method."
                    : undefined
                }
                onClick={() => void unlink(provider, account)}
                data-testid={unlinkProviderTestId(provider.id)}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}
                Unlink
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={pendingId !== null}
                onClick={() => void link(provider)}
                data-testid={linkProviderTestId(provider.id)}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}
                Connect
              </Button>
            )}
          </div>
        );
      })}
      {error ? (
        <p
          className="px-6 py-3 text-xs text-accent"
          role="alert"
          data-testid={TEST_IDS.linkedAccountsError}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
