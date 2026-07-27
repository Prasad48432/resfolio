import type { Metadata, Viewport } from "next";
import {
  Instrument_Serif,
  JetBrains_Mono,
  Lora,
  Manrope,
} from "next/font/google";

import { Toaster } from "@/components/status/toaster";

import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// The serif that backs the `resume-editorial` template's live preview — the
// same family apps/sites loads, so preview and PDF are set identically. Its
// italic is loaded because the template uses serif italics for subtitles.
const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Resfolio",
  description: "Resfolio dashboard.",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * **`interactiveWidget: "resizes-content"` is what makes the AI composer usable on
 * a phone.**
 *
 * By default a mobile keyboard resizes only the *visual* viewport: the layout
 * viewport stays full height, so a viewport-height app shell keeps its size and
 * the bottom of it — which is exactly where a chat composer lives — ends up
 * underneath the keyboard, with no scroll available to reach it because the shell
 * is not what scrolls. `resizes-content` shrinks the layout viewport instead, so
 * the shell recomputes and the composer stays above the keyboard.
 *
 * It is set at the root rather than per route because a viewport meta cannot be
 * scoped, and because nothing else in the app is harmed by it: no other surface is
 * anchored to the bottom of the viewport.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables must land on <html>, not <body>. @resfolio/design
    // declares `--font-display: var(--font-instrument-serif), …` on `:root`,
    // and a custom property is substituted where it is *declared*. Declared on
    // :root while --font-instrument-serif only existed on <body>, --font-display
    // resolved to nothing and was inherited as nothing — so `font-display`,
    // `font-sans` and `font-mono` all silently fell back to system fonts.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${manrope.variable} ${jetbrainsMono.variable} ${lora.variable}`}
    >
      <body suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
