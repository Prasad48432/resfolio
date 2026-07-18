"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

/**
 * The app's single toast surface (doc 08). Sonner, themed by the design
 * system rather than by its own palette: `--normal-*` are the CSS variables
 * Sonner's default stylesheet reads, so pointing them at Resfolio tokens
 * themes every toast — including the ones we never style by hand — without a
 * `toastOptions.classNames` entry per variant.
 *
 * Mounted in the **root** layout so any route can toast, which puts it
 * *outside* the `(dashboard)` `ThemeProvider`. That is deliberate and safe:
 * `useTheme()` with no provider returns an empty context, so `resolvedTheme`
 * is undefined and we fall back to `light` — exactly right for `/login`,
 * the one light-only screen in this app. Inside the dashboard the provider
 * supplies the real value and toasts follow light/dark/system.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      // Product motion, not marketing: doc 08 budgets overlays at 150–200ms.
      duration={4000}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--color-surface)",
          "--success-text": "var(--color-foreground)",
          "--success-border": "var(--color-border)",
          "--error-bg": "var(--color-surface)",
          "--error-text": "var(--color-foreground)",
          "--error-border": "var(--color-border)",
          fontFamily: "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "shadow-[0_12px_32px_rgba(38,32,25,0.12)]",
          description: "text-muted! -mt-1",
          success: "[&_[data-icon]]:text-brand",
          error: "[&_[data-icon]]:text-destructive",
        },
      }}
    />
  );
}
