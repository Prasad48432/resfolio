import { createOpenAI } from "@ai-sdk/openai";
import { createGateway, type LanguageModel } from "ai";

import { env } from "@/lib/env";

/**
 * The model seam (docs/architecture/13-ai-layer.md).
 *
 * **This is the only file in the repository that names a model vendor.**
 * Everything downstream — the route handlers, the prompts, and every future
 * workflow — takes a `LanguageModel`, the AI SDK's provider-agnostic interface.
 * Swapping providers is editing this file and nothing else; that is the whole
 * point of putting the SDK in front of the vendor rather than calling the
 * vendor's own client.
 *
 * There are **two ways to reach a model, and the gateway wins when both are
 * configured**:
 *
 * - `AI_GATEWAY_API_KEY` → Vercel's AI Gateway. One credential for many
 *   providers, one place the spend is visible, and switching from
 *   `openai/gpt-5-mini` to some other provider's model becomes an env change
 *   rather than a dependency change. It needs no extra package: `ai` re-exports
 *   `createGateway` from a dependency it already carries.
 * - `OPENAI_API_KEY` → OpenAI directly, the original path, unchanged.
 *
 * The gateway is preferred because an environment carrying both keys has almost
 * certainly been given the gateway on purpose — it is the more specific choice,
 * and the one whose budget someone is watching. Nothing downstream can tell
 * which was used, which is the property that makes preferring one safe.
 *
 * Keys are read from `@resfolio/env` (the only sanctioned reader of
 * `process.env`) and live only here, on the server. The gateway key is passed
 * to `createGateway` **explicitly** rather than being left to the SDK's own
 * `AI_GATEWAY_API_KEY` lookup — same variable, but an implicit read would put a
 * second `process.env` reader inside a dependency, outside the rule doc 11
 * enforces. Importing this module from a client component is a build error, not
 * a leak, because `@/lib/env` exposes these as server-only variables.
 */

/**
 * Sensible defaults: the cheap tier is more than enough for rewriting prose the
 * user already wrote and for structured extraction, which is all the profile
 * and job workflows ask for. `AI_MODEL` promotes either without a code change.
 *
 * Two constants rather than one because **the two paths address models
 * differently** — the gateway wants a provider-qualified slug, the direct
 * provider wants a bare id. One default shared between them would 404 on
 * whichever path it wasn't written for.
 */
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_GATEWAY_MODEL = "openai/gpt-5-mini";

/** Which credential this environment is set up to use, or `null` for none.
 * Every other function in this file derives from it, so the preference order
 * lives in exactly one place. */
function activeProvider(): "gateway" | "openai" | null {
  if (env.AI_GATEWAY_API_KEY) {
    return "gateway";
  }
  return env.OPENAI_API_KEY ? "openai" : null;
}

/**
 * Whether the AI layer can run at all. Two independent reasons it might not,
 * kept separate because they mean different things to a user:
 * - no credential of either kind → *not configured in this environment* (dev,
 *   CI, a preview deploy) → the UI hides and the route 501s;
 * - `AI_ENABLED=false` → *deliberately switched off* (a cost or safety lever)
 *   → the UI hides and the route 503s.
 *
 * Note what this cannot tell you: a key that exists but has no credit behind it
 * is *configured*, so the UI mounts and the failure surfaces mid-stream instead
 * (see the routes' `onError`). Checking spendability would mean a network call
 * on every page render, which is the wrong trade for a wrong-billing-details
 * case.
 */
export function isAiConfigured(): boolean {
  return activeProvider() !== null;
}

/** The kill switch. Unset means enabled, so adding it changes no deployment. */
export function isAiEnabled(): boolean {
  return env.AI_ENABLED !== "false";
}

/** Both gates, for the UI's single "should this exist on screen" question. */
export function isAiAvailable(): boolean {
  return isAiConfigured() && isAiEnabled();
}

/** The model id in use — logged with every completion, so a bill that moves is
 * traceable to the model that moved it. */
export function aiModelId(): string {
  if (env.AI_MODEL) {
    return env.AI_MODEL;
  }
  return activeProvider() === "gateway" ? DEFAULT_GATEWAY_MODEL : DEFAULT_MODEL;
}

/**
 * The chat model. Throws when unconfigured rather than returning null: every
 * caller has already checked availability (the routes refuse before they get
 * here), so a null return would only push an impossible branch outward.
 */
export function getChatModel(): LanguageModel {
  const provider = activeProvider();

  // Constructed per call rather than at module scope so importing this module
  // never requires a key to be present — the availability checks above have to
  // be safe to call in an environment that has no AI configured at all.
  if (provider === "gateway") {
    return createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(aiModelId());
  }

  if (provider === "openai") {
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(aiModelId());
  }

  throw new Error(
    "getChatModel() called with no AI credential — check isAiConfigured() first.",
  );
}

/**
 * Provider settings for a call whose output is a **structure the user is waiting
 * to look at**, rather than prose that streams as it is written.
 *
 * **This exists because reasoning is invisible latency, and structured output has
 * nowhere to hide it.** Measured against the real gateway with a realistic
 * profile and a full posting, the job analysis spent **1,600 reasoning tokens and
 * emitted nothing at all for 22.6 seconds** before the first character of JSON
 * appeared — then finished the whole object 7 seconds later. That is the shape of
 * the bug reported as "analysing forever": not a hang, but a blank panel for
 * twenty-odd seconds followed by everything at once, with no partial result to
 * watch in between. On a longer profile the silent stretch grows past
 * `maxDuration`, the function is killed mid-stream, and the panel stays blank
 * permanently — which is the same screen, so the two were never told apart.
 *
 * `reasoningEffort: "low"` cut that to 832 reasoning tokens and 16.2 seconds to
 * first chunk on the same input, with the object still validating and still
 * finding the same requirements. This is classification and extraction against a
 * document that is already in the context — the work is reading, not deduction —
 * so the deep-thinking budget was buying latency rather than accuracy.
 *
 * **Deliberately not applied to the chat**, which is the opposite case: a chat
 * turn reasons about which of a dozen profile items an instruction refers to, and
 * its output streams, so thinking time is spent behind visible text rather than
 * in front of a blank panel.
 *
 * Keyed under `openai` for both credential paths — the gateway forwards provider
 * options to the upstream provider under its own name, so the key follows the
 * model (`openai/gpt-5-mini`), not the route taken to reach it. A provider that
 * does not recognise the option ignores it, so this degrades to today's behaviour
 * rather than failing.
 */
export function structuredProviderOptions(): Record<
  string,
  Record<string, string>
> {
  return { openai: { reasoningEffort: "low" } };
}

/**
 * Provider settings for the **chat**, which until now sent none at all.
 *
 * The note above says reasoning was "deliberately not applied to the chat", and
 * the reasoning behind that was sound — a chat turn works out which of a dozen
 * profile items an instruction refers to, and its output streams, so thinking
 * time hides behind visible text. What it missed is that **the thinking happens
 * before the first character, not behind it**: the default model is a reasoning
 * model, `AiMessage` deliberately renders no reasoning parts, and the SDK opens
 * the assistant message the moment the stream starts. So the entire reasoning
 * budget is spent against an empty bubble. That is the several-second stare this
 * app already had to grow a `data-progress` crumb and an `aiWorking` indicator to
 * explain — two pieces of UI apologising for latency that was configuration.
 *
 * `low` rather than `minimal`: the chat still has to resolve "tighten the second
 * bullet on the Acme role" to an item id and call a tool with it, and `minimal`
 * is the setting that makes a model answer in prose where it should have called
 * the tool — which here means the diff never appears and the turn looks broken.
 * `low` keeps the tool-selection step and drops the deliberation this workload
 * does not have.
 *
 * `textVerbosity: "low"` is the other half, and it is a *product* setting rather
 * than a speed one. Every prompt in `system-prompt.ts` already asks for at most a
 * sentence or two beside a diff the user can read for themselves; verbosity is
 * the same instruction in the one place the model cannot talk itself out of. It
 * is also the cheapest possible latency win, because tokens not written are
 * seconds not waited.
 */
export function chatProviderOptions(): Record<string, Record<string, string>> {
  return { openai: { reasoningEffort: "low", textVerbosity: "low" } };
}
