import type { NextConfig } from "next";

// Importing env validates it at config-load time — a missing RENDER_SECRET
// fails the build, not a request (doc 11). Imported for the side effect only;
// no value is read here since the preview route's CSP carve-out was removed.
import "./lib/env";

const nextConfig: NextConfig = {
  // Pino uses worker-thread transports; keep it out of the server bundle
  // (same reason as apps/dashboard).
  serverExternalPackages: ["pino", "pino-pretty"],
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
    ];
  },
};

export default nextConfig;
