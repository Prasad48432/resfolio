"use client";

import {
  Bubble,
  BubbleContent,
  Marker,
  MarkerContent,
  Message,
  MessageAvatar,
  MessageContent,
  Spinner,
} from "@resfolio/ui";

import ResfolioMark from "@/components/brand/resfolio-mark";
import { MatrixSpinner } from "@/components/status/matrix-loader";
import type { AiUIMessage } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

import { ProfileProposal } from "./profile-proposal";

/**
 * One message, rendered from its **parts** (docs/architecture/13-ai-layer.md).
 *
 * **This component reads `message.parts`, never `message.content`, and that is
 * the single most load-bearing decision in the AI UI.** A `UIMessage` is a list
 * of typed parts — text, tool calls, data parts, structured results. Rendering
 * the concatenated text would work perfectly right now and would have to be torn
 * out the moment a profile proposal needs to arrive as a diff rather than a
 * paragraph. Dispatching on `part.type` means a new result type is a new `case`,
 * not a rewrite of the chat.
 *
 * The message is typed as `AiUIMessage` rather than `UIMessage`, which is what
 * makes `part.output` below a real `ProfileChangeReview` instead of an `unknown`
 * someone has to cast. That type comes from the tool definitions via
 * `import type`, so nothing server-side is bundled here.
 *
 * **An assistant turn is never allowed to render as nothing — in either
 * direction.** Unknown part types fall through to `null`, so a turn carrying only
 * reasoning drew an avatar and empty space, which reads as the feature having
 * crashed. `settled` splits that into the two cases, and **both** now render
 * something, because they were equally blank and mean opposite things:
 *
 * - **Not settled** → the model is working. With a reasoning model this is the
 *   *normal* opening of every turn: reasoning parts are deliberately not rendered
 *   (doc 13 — no chain-of-thought exposed), so for the first several seconds a
 *   perfectly healthy turn has an avatar and nothing beside it. The transcript
 *   picks up the indicator exactly where the composer's "submitted" one leaves
 *   off, so the gap that used to open between them is gone.
 * - **Settled** → the turn finished with nothing to show, which is a real
 *   failure and gets a real explanation with a real next step, not a shrug.
 */
export function AiMessage({
  message,
  settled = true,
}: {
  message: AiUIMessage;
  /** This turn is complete — the stream has ended, one way or another. While
   * false, an empty message is simply a message that has not started yet. */
  settled?: boolean;
}) {
  const isUser = message.role === "user";

  // Reasoning parts are deliberately not rendered (doc 13: no chain-of-thought
  // exposed or invented), but they still mean the turn produced *something* — so
  // they must not be mistaken for an empty turn while the model is working.
  const rendered = message.parts.filter(
    (part) => part.type === "text" || part.type.startsWith("tool-"),
  ).length;

  const empty = rendered === 0;

  return (
    <Message
      align={isUser ? "end" : "start"}
      // `items-start`, because the default in the registry's `Message` pairs with
      // an avatar pinned to the bottom of the bubble. See the avatar below.
      className="items-start gap-2.5"
      data-testid={TEST_IDS.aiMessage(message.role)}
    >
      {isUser ? null : <AssistantAvatar />}
      <MessageContent className="min-w-0 pt-0.5">
        {message.parts.map((part, index) => {
          switch (part.type) {
            case "text":
              return (
                // The assistant reads as prose on the page, the user as a sent
                // message — so only one of them gets a bubble. A transcript
                // where both sides are bubbles is a chat app; this is a tool
                // that happens to answer in sentences.
                //
                // **`muted`, not `default`.** The registry's default variant is
                // `bg-primary`, and the bridge maps `primary` to *ink* — so a
                // sent message rendered as the highest-contrast fill the theme
                // owns: black-on-cream in light, and a white slab in dark, which
                // is what made the transcript look like it belonged to a
                // different product. `surface-warm` plus a hairline is the app's
                // own panel language (doc 08: quieter), and it follows the
                // palette rather than inverting it. The border is set here
                // because `BubbleContent` ships `border-transparent`; in light
                // the fill alone is only 2% off the page.
                <Bubble
                  key={index}
                  variant={isUser ? "muted" : "ghost"}
                  align={isUser ? "end" : "start"}
                  className={
                    isUser
                      ? "max-w-[85%] *:data-[slot=bubble-content]:border-border sm:max-w-[75%]"
                      : undefined
                  }
                >
                  <BubbleContent className="leading-relaxed whitespace-pre-wrap">
                    {part.text}
                  </BubbleContent>
                </Bubble>
              );

            // The proposal, in the four states the SDK actually reports. None
            // of them is a timer: while the input streams the model is
            // genuinely writing the changes, and saying so is a real progress
            // indicator rather than the theatre doc 13 rules out.
            case "tool-proposeProfileChanges":
              switch (part.state) {
                case "input-streaming":
                case "input-available":
                  return (
                    <Marker
                      key={index}
                      data-testid={TEST_IDS.aiProposalPreparing}
                    >
                      <Spinner size="sm" />
                      <MarkerContent>
                        Checking these against your profile…
                      </MarkerContent>
                    </Marker>
                  );
                case "output-available":
                  return <ProfileProposal key={index} review={part.output} />;
                case "output-error":
                  return (
                    <Marker
                      key={index}
                      className="text-destructive"
                      data-testid={TEST_IDS.aiProposalFailed}
                    >
                      <MarkerContent>
                        Those suggestions couldn&apos;t be checked against your
                        profile, so none of them are shown.
                      </MarkerContent>
                    </Marker>
                  );
                default:
                  return null;
              }

            default:
              return null;
          }
        })}

        {empty && !isUser ? (
          settled ? (
            <Marker data-testid={TEST_IDS.aiEmptyTurn}>
              <MarkerContent>
                This one stopped before it produced an answer — usually because
                there was too much to work through at once. Asking for fewer
                things in one go generally gets it.
              </MarkerContent>
            </Marker>
          ) : (
            // Still arriving. The model is reasoning, and reasoning is not
            // rendered — so without this the healthy path is indistinguishable
            // from the broken one for as long as the thinking takes.
            <Marker data-testid={TEST_IDS.aiWorking}>
              <MatrixSpinner />
              <MarkerContent>Working through it…</MarkerContent>
            </Marker>
          )
        ) : null}
      </MessageContent>
    </Message>
  );
}

/**
 * The assistant's mark.
 *
 * Two fixes, both visible in a screenshot and neither cosmetic:
 *
 * - **It sits at the top of the message**, not the bottom. The registry's
 *   `MessageAvatar` is `self-end`, which is right for a chat app where turns are
 *   a line or two — the avatar tucks against the bubble it belongs to. Here a
 *   turn is routinely twelve paragraphs, and a bottom-pinned avatar ends up
 *   floating beside the *end* of an answer with nothing to anchor it to, hundreds
 *   of pixels from the message it identifies. `self-start` plus the parent's
 *   `items-start` puts it beside the first line, which is where the eye starts.
 * - **The mark is presented as an app icon, not dropped into a circle.** The
 *   Resfolio mark is a filled square glyph; centring a filled square inside a
 *   round warm-grey plate left visible corners of one shape inside another, which
 *   is exactly what looked unfinished. It now fills a squircle of its own with
 *   the plate removed, a hairline to seat it against the page, and `overflow-
 *   hidden` doing the clipping — so the glyph is the avatar rather than cargo
 *   inside one.
 */
function AssistantAvatar() {
  return (
    <MessageAvatar className="size-7 self-start overflow-hidden rounded-lg bg-transparent ring-1 ring-border/70">
      <ResfolioMark size={28} className="size-full" />
    </MessageAvatar>
  );
}
