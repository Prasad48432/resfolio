import type { NextConfig } from "next";

// Importing the env module validates it at build/config-load time.
import { env } from "./lib/env";

const isDev = env.NODE_ENV === "development";

/**
 * R2 public delivery origin.
 *
 * Temporarily hardcoded to eliminate R2_PUBLIC_BASE_URL / build-time
 * environment loading as the cause of Next.js image failures.
 */
const R2_PUBLIC_ORIGIN =
  "https://pub-3cead1040c354464b9c7c42cbf00ecd6.r2.dev";

/**
 * Baseline CSP.
 *
 * Next.js App Router requires 'unsafe-inline' scripts without a nonce
 * pipeline. Dev additions ('unsafe-eval', ws:) are required for
 * HMR/react-refresh.
 */
const csp = [
  "default-src 'self'",

  `script-src 'self' 'unsafe-inline'${
    isDev ? " 'unsafe-eval'" : ""
  }`,

  "style-src 'self' 'unsafe-inline'",

  [
    "img-src 'self' blob: data:",
    "https://lh3.googleusercontent.com",
    "https://avatars.githubusercontent.com",
    R2_PUBLIC_ORIGIN,
    // Company marks on the job tracker's cards, via Google's favicon service
    // (`faviconUrl` in `lib/jobs.ts`). **CSP only, no `remotePatterns` entry**:
    // these are plain `<img>` tags rather than `next/image`, because routing a
    // 16px icon through the optimizer buys nothing. Note the trade this makes —
    // the domain of every company the user is applying to is sent to Google.
    // Every call site has a local fallback, so removing it is deleting one
    // function.
    "https://www.google.com",
  ].join(" "),

  "font-src 'self'",

  `connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io${
    isDev ? " ws:" : ""
  }`,

  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",

  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
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
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },

      // Cloudflare R2 public bucket
      {
        protocol: "https",
        hostname: "pub-3cead1040c354464b9c7c42cbf00ecd6.r2.dev",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
