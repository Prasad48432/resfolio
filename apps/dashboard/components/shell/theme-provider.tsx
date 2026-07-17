"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * The dashboard's theme provider (light / dark / system, persisted to
 * localStorage under `resfolio-theme`).
 *
 * Mounted in the `(dashboard)` layout, deliberately NOT the root layout. The
 * root layout also wraps `(auth)`, and `/login` is this app's one brand moment
 * — it renders `card-surface` from @resfolio/design, a light-only surface built
 * around inset white highlights and a warm ambient glow. Theming it would mean
 * either a dark `card-surface` (a marketing surface this app is otherwise told
 * not to touch) or a signed-out user toggling a preference for an account we
 * don't know yet. Scoping the provider to the authenticated tree keeps `/login`
 * exactly as designed and puts the toggle where the session is.
 *
 * next-themes injects a blocking inline script that sets the class on <html>
 * before first paint, which is what prevents a flash of light theme on load.
 * That requires `suppressHydrationWarning` on <html> — already set in
 * `app/layout.tsx` for its own reasons; the two coexist.
 */
export function ThemeProvider({
  children,
}: Pick<ComponentProps<typeof NextThemesProvider>, "children">) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="resfolio-theme"
      // Suppressing transitions on switch is the difference between a theme
      // change and every transition-colors element in the tree racing its own
      // curve at once. The switch should be instant; the UI animates after.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
