/**
 * Tiny OAuth 2.0 authorization server for e2e tests
 * (docs/architecture/11-engineering-foundation.md, OAuth mocking). Serves
 * both mock providers registered by @resfolio/auth when
 * AUTH_E2E_MOCK_ISSUER is set:
 *
 *   GET  /:provider/authorize  → identity "consent screen" (email/name form)
 *   POST /:provider/authorize  → redirect back with a one-time code
 *   POST /:provider/token      → code → bearer token
 *   GET  /:provider/userinfo   → OIDC-shaped claims for the token
 *
 * Identities are chosen per sign-in by the Playwright test filling the
 * form, so linking scenarios (same verified email across providers) are
 * driven from the test, exactly like a human picking the same Google and
 * GitHub account.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = 4780;
const PROVIDERS = new Set(["mock-google", "mock-github"]);

interface Identity {
  email: string;
  name: string;
  provider: string;
}

const codes = new Map<string, Identity>();
const tokens = new Map<string, Identity>();

function html(body: string): string {
  return `<!doctype html><html><head><title>Mock OAuth</title></head><body>${body}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const [, provider, endpoint] = url.pathname.split("/");

  if (!provider || !PROVIDERS.has(provider)) {
    res.writeHead(404).end("unknown provider");
    return;
  }

  if (endpoint === "authorize" && req.method === "GET") {
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const state = url.searchParams.get("state") ?? "";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      html(`
        <h1>${escapeHtml(provider)} sign in</h1>
        <form method="POST" action="/${escapeHtml(provider)}/authorize">
          <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
          <input type="hidden" name="state" value="${escapeHtml(state)}" />
          <label>Email <input id="mock-email" name="email" value="user@example.com" /></label>
          <label>Name <input id="mock-name" name="name" value="Test User" /></label>
          <button id="mock-continue" type="submit">Continue</button>
        </form>
      `),
    );
    return;
  }

  if (endpoint === "authorize" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const form = new URLSearchParams(body);
      const code = randomUUID();
      codes.set(code, {
        email: form.get("email") ?? "user@example.com",
        name: form.get("name") ?? "Test User",
        provider,
      });
      const redirect = new URL(form.get("redirect_uri") ?? "");
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", form.get("state") ?? "");
      res.writeHead(302, { location: redirect.toString() }).end();
    });
    return;
  }

  if (endpoint === "token" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      const form = new URLSearchParams(body);
      const identity = codes.get(form.get("code") ?? "");
      if (!identity) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant" }));
        return;
      }
      codes.delete(form.get("code") ?? "");
      const accessToken = `at_${randomUUID()}`;
      tokens.set(accessToken, identity);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 3600,
          scope: "openid email profile",
        }),
      );
    });
    return;
  }

  if (endpoint === "userinfo" && req.method === "GET") {
    const bearer = (req.headers.authorization ?? "").replace("Bearer ", "");
    const identity = tokens.get(bearer);
    if (!identity) {
      res.writeHead(401).end();
      return;
    }
    // Stable subject per provider+email so re-login maps to one account.
    const sub = createHash("sha256")
      .update(`${identity.provider}:${identity.email}`)
      .digest("hex")
      .slice(0, 24);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        sub,
        email: identity.email,
        email_verified: true,
        name: identity.name,
        picture: null,
      }),
    );
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => {
  console.log(`mock oauth server listening on http://localhost:${PORT}`);
});
