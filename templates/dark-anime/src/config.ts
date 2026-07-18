import { z } from "zod";

/**
 * Presentation config for `dark-anime` (doc 03) — adapted from
 * github.com/Ashutoshx7/Portfolio-v2- (**the trailing-dash repo**; the one
 * without it is a different, unrelated site).
 *
 * Config is **template-specific content the Profile has no place for**, never
 * a copy of the Profile: everything about *you* comes from the ProfileView,
 * and nothing here duplicates it. The fields below exist because this layout
 * needs a banner, a pull-quote, an intro-call link, a tagline — this
 * template's furniture, not facts about a career, which would pollute the
 * shared profile model (doc 01) if they lived there. A template that wants
 * none of them simply declares none of them.
 *
 * **Visibility toggles are deliberately absent** (2026-07-18). `showAvatar`,
 * `showCommandHint`, `featuredProjectCount` and `showGithubGraph` were asking
 * the user to design the template — questions with an obviously right answer
 * that only added surface to the settings form. A template is opinionated
 * (doc 03), so it decides; anything genuinely absent is driven by the data
 * being absent, not by a switch. Reusable visibility toggles may return as a
 * platform-level concern once more than one template wants the same one — but
 * they will not come back as per-template booleans.
 *
 * Removed keys need no migration: Zod strips unknown keys, so a stored config
 * carrying them still parses and simply drops them on the next save.
 *
 * **Every field carries a default** — `defineTemplate` requires `defaultConfig`
 * to parse clean, so a genuinely required field is unrepresentable here. That's
 * what `requirements.config` in `index.ts` is for: this schema answers "is it
 * valid?", requirements answer "is it finished?".
 */
const urlOrEmpty = z.union([z.literal(""), z.url()]);

export const darkAnimeConfigSchema = z.object({
  /** The wide banner above the avatar — this template's signature. Required
   * (see `requirements.config`). */
  bannerImage: urlOrEmpty.default(""),
  /** Sits under the name, as in the reference. Free text — "20", "he/him",
   * "Berlin". Empty hides it. */
  tagline: z.string().trim().max(60).default(""),
  /** A pull-quote on the home page. Empty hides the section entirely. */
  quote: z.string().trim().max(280).default(""),
  quoteAttribution: z.string().trim().max(80).default(""),
  /** "Book an intro call" — a Cal.com/Calendly URL. Empty hides the button. */
  introCallUrl: urlOrEmpty.default(""),
});

export type DarkAnimeConfig = z.infer<typeof darkAnimeConfigSchema>;

export const defaultDarkAnimeConfig: DarkAnimeConfig =
  darkAnimeConfigSchema.parse({});
