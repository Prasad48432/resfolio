"use client";

import { Button } from "@resfolio/ui";

import { TEST_IDS } from "@/lib/testids";

/**
 * What to ask, shown only while the transcript is empty.
 *
 * A chat box with a blinking cursor is the worst possible onboarding for a tool
 * that is *not* a general assistant: it invites "write me a resume", which this
 * product deliberately refuses, and the refusal reads as the feature being
 * broken. Naming four things it genuinely does is cheaper than explaining what
 * it doesn't.
 *
 * They disappear on the first message and never come back — they are a starting
 * point, not a menu, and a permanent row of buttons under a conversation would
 * imply these are the only things it can do.
 */
const SUGGESTIONS = [
  "Make my summary more concise.",
  "Make my experience bullets stronger.",
  "Improve my project descriptions.",
  "Which parts of my profile look weakest?",
] as const;

export function AiSuggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid={TEST_IDS.aiSuggestions}
      // A heading rather than a bare list, so a screen reader user meets these
      // as a labelled group instead of four unexplained buttons.
      aria-labelledby="ai-suggestions-label"
    >
      <p id="ai-suggestions-label" className="label-section">
        Try asking
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
