"use client";

import type { SignInProvider } from "@resfolio/auth";
import { authClient } from "@resfolio/auth/client";
import { Button, Spinner } from "@resfolio/ui";
import { useState } from "react";

import { signInButtonTestId } from "@/lib/testids";

const AFTER_SIGN_IN = "/profile";

/** Underlying brand for labels/icons — mock providers mirror the real pair. */
function brandOf(provider: SignInProvider): "google" | "github" {
  return provider.id.endsWith("github") ? "github" : "google";
}

const BRAND_LABELS = { google: "Google", github: "GitHub" } as const;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12.01 12.01 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.23 0 12 0A11.99 11.99 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .3a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58l-.01-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3Z" />
    </svg>
  );
}

export function LoginButtons({ providers }: { providers: SignInProvider[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function signInWith(provider: SignInProvider) {
    setPendingId(provider.id);
    try {
      if (provider.kind === "social") {
        await authClient.signIn.social({
          provider: provider.id,
          callbackURL: AFTER_SIGN_IN,
        });
      } else {
        await authClient.signIn.oauth2({
          providerId: provider.id,
          callbackURL: AFTER_SIGN_IN,
        });
      }
    } catch {
      // Network failure before the redirect — release the button.
      setPendingId(null);
    }
  }

  return (
    <>
      {providers.map((provider) => {
        const brand = brandOf(provider);
        const pending = pendingId === provider.id;
        return (
          <Button
            key={provider.id}
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={pendingId !== null}
            onClick={() => void signInWith(provider)}
            data-testid={signInButtonTestId(provider.id)}
          >
            {pending ? (
              <Spinner />
            ) : brand === "google" ? (
              <GoogleMark />
            ) : (
              <GitHubMark />
            )}
            Continue with {BRAND_LABELS[brand]}
          </Button>
        );
      })}
    </>
  );
}
