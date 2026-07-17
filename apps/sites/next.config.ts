import type { NextConfig } from "next";

// Importing env validates it at config-load time — a missing RENDER_SECRET
// fails the build, not a request (doc 11).
import { env } from "./lib/env";

// The dashboard is the only origin allowed to frame the draft-preview route
// (doc 08 CSP carve-out); localhost keeps local dev working.
const frameAncestors = ["'self'", "http://localhost:3001", env.DASHBOARD_URL]
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The resume route here is publicly readable (doc 02) but must never be
        // indexed: it is shared by link, and it carries contact details with no
        // `discoverable` toggle to opt in with. This header is the
        // authoritative crawler signal; `robots.ts` disallows the same paths.
        source: "/render/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        // The draft-preview route is private + iframed by the dashboard only:
        // noindex, and a `frame-ancestors` allowlist instead of a blanket DENY.
        source: "/preview/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
