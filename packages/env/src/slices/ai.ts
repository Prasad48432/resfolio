import { z } from "zod";

/**
 * The AI layer's runtime configuration (docs/architecture/13-ai-layer.md).
 *
 * **Every variable is optional, and that is the product decision, not
 * laziness.** Resfolio without an AI key is Resfolio — the profile editor,
 * resumes, portfolio and imports all work — so the platform has to boot
 * without one. The dashboard hides the AI surface when `OPENAI_API_KEY` is
 * absent and the route refuses (501), the same optional-and-hides shape
 * `render.dashboard` (PDF export) and `r2` (uploads) already use.
 *
 * **Two ways to reach a model, and the app prefers the gateway.**
 * `AI_GATEWAY_API_KEY` routes through Vercel's AI Gateway — one credential for
 * many providers, with spend visible in one place — and `OPENAI_API_KEY` talks
 * to OpenAI directly. Either alone is a working configuration; neither is a
 * migration away from the other, because both resolve to the AI SDK's
 * `LanguageModel` and nothing downstream can tell which was used.
 *
 * Both are read in exactly one file — `lib/ai/provider.ts` — and only on the
 * server. Neither is a `NEXT_PUBLIC_*` variable, neither reaches a client
 * bundle, and neither appears in a response: the browser talks to
 * `/api/ai/chat`, which is the only thing holding them.
 *
 * `AI_GATEWAY_API_KEY` is the gateway SDK's own default variable name, and it
 * is spelled that way here deliberately — but it is still passed to
 * `createGateway` **explicitly**, never picked up from the ambient environment,
 * because this package is the only sanctioned reader of `process.env` (doc 11)
 * and an implicit read would put a second one inside a dependency.
 *
 * `AI_ENABLED=false` is the **kill switch**, an exact mirror of
 * `PDF_EXPORT_ENABLED`. AI endpoints spend money per request, so there has to
 * be a way to stop them that does not require a code change: it hides the UI
 * *and* makes the route hard-refuse (503), because a hidden button is not a
 * guard. Unset (or any other value) keeps the feature on, so adding this slice
 * changes nothing for an existing deployment.
 *
 * `AI_MODEL` overrides the code default. It exists so model choice is an ops
 * decision — promoting to a stronger model for a costly workflow, or pinning a
 * version — rather than a redeploy of changed source. **Its format follows
 * whichever credential is in use**: a bare id for the direct provider
 * (`gpt-5-mini`) and a provider-qualified slug for the gateway
 * (`openai/gpt-5-mini`, `anthropic/claude-sonnet-5`). That is the gateway's own
 * addressing scheme rather than a Resfolio convention, and it is what makes
 * "try a different provider" an env change.
 *
 * Rate limiting deliberately has no vars here: it reuses the existing
 * `ratelimit` slice (`UPSTASH_REDIS_REST_URL` / `_TOKEN`), because a second
 * Redis for the same Redis would be two things to keep in sync.
 */
export const ai = {
  server: {
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).optional(),
    AI_ENABLED: z.enum(["true", "false"]).optional(),
  },
} as const;
