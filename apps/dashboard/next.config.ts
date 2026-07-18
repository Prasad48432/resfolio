import type { NextConfig } from "next";

// Importing the env module validates it at build/config-load time — a
// missing var fails the build, not a request (doc 11).
import { env } from "./lib/env";

const isDev = env.NODE_ENV === "development";

/**
 * The R2 delivery origin, derived from the same variable that builds every
 * asset URL (`@resfolio/storage`'s `assetUrl`). Hard-coding the bucket
 * hostname here works right up until a deployment points at a different
 * bucket — and the failure is silent: `next/image` refuses the unconfigured
 * host and every uploaded image disappears, with nothing in the UI to say why.
 *
 * Absent (no uploads configured), both lists simply omit it.
 */
const r2Origin = env.R2_PUBLIC_BASE_URL
  ? new URL(env.R2_PUBLIC_BASE_URL)
  : null;

/**
 * Baseline CSP (docs/architecture/10-auth-and-security.md). Next.js App
 * Router requires 'unsafe-inline' scripts without a nonce pipeline —
 * nonce-based CSP is a hardening follow-up, tracked in doc 10. Dev additions
 * ('unsafe-eval', ws:) cover HMR/react-refresh only.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Avatars come from the login providers; uploads from the R2 bucket.
  //
  // The bucket origin is needed even though `next/image` proxies through
  // same-origin `/_next/image`: an `unoptimized` image, a raw <img> in a
  // preview, or a CSS background would each hit the bucket directly, and the
  // CSP is the one place that failure produces a console error rather than a
  // blank box (doc 10 — update the CSP when adding an external origin).
  [
    "img-src 'self' blob: data:",
    "https://lh3.googleusercontent.com",
    "https://avatars.githubusercontent.com",
    r2Origin?.origin,
  ]
    .filter(Boolean)
    .join(" "),
  "font-src 'self'",
  `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Pino uses worker-thread transports; keep it out of the server bundle.
  serverExternalPackages: ["pino", "pino-pretty"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      ...(r2Origin
        ? [{ protocol: "https" as const, hostname: r2Origin.hostname }]
        : []),
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
