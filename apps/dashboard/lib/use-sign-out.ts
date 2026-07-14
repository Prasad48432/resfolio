"use client";

import { authClient } from "@resfolio/auth/client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/** Shared sign-out flow: revoke the session, then land on /login. */
export function useSignOut() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  return { signOut, signingOut };
}
