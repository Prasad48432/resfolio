import type { NextConfig } from "next";

// Importing the env module validates it at build/config-load time — a
// missing var fails the build, not a request (doc 11).
import { env } from "./lib/env";

const isDev = env.NODE_ENV === "development";

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
  // Avatars come from the login providers; everything else is same-origin.
  "img-src 'self' blob: data: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
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
      {
        protocol: "https",
        hostname: "pub-3cead1040c354464b9c7c42cbf00ecd6.r2.dev",
      },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
