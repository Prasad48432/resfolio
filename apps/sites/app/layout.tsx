import { Instrument_Serif, Manrope } from "next/font/google";

import "./globals.css";

/**
 * Fonts are self-hosted by `next/font` (WOFF2 embedded at build,
 * `display: "block"` so print/PDF never falls back to a system face
 * mid-render — the exact same font files back preview, print, and PDF, which
 * is where resume pixel-parity comes from, doc 02). The same slots serve
 * portfolio pages, which reference them via their `--rf-font-*` tokens:
 * - `--font-manrope` → templates' `--rf-font-body`
 * - `--font-instrument-serif` → portfolio templates' `--rf-font-display`
 */
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "block",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-instrument-serif",
  display: "block",
});

// No app-wide robots directive: public portfolio pages (`/p/*`) are indexable
// (per their own `generateMetadata` + the site's `discoverable` toggle, doc
// 04). The private render surfaces (`/render/*`) set their own noindex — both
// in metadata and via the `X-Robots-Tag` header in `next.config.ts`.

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
