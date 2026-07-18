import { z } from "zod";

/**
 * Presentation config for `dark-anime` (doc 03) — adapted from
 * github.com/Ashutoshx7/Portfolio-v2- (**the trailing-dash repo**; the one
 * without it is a different, unrelated site).
 *
 * Config is **knobs and template-specific content**, never a copy of the
 * Profile: everything about *you* comes from the ProfileView, and nothing here
 * duplicates it. The fields below exist because this layout needs content the
 * Profile has no place for — a banner, a pull-quote, an intro-call link, a
 * tagline. They are this template's furniture, not facts about a career, and
 * would pollute the shared profile model (doc 01) if they lived there. A
 * template that wants none of them simply declares none of them.
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
  /** Render the GitHub contribution graph. The username comes from the
   * profile's GitHub link, so there's no second copy to fall out of sync. */
  showGithubGraph: z.boolean().default(true),
  /** How many projects the home page features before "View all". */
  featuredProjectCount: z.number().int().min(1).max(12).default(6),
  showAvatar: z.boolean().default(true),
  /** The ⌘K badge in the nav. The shortcut works either way. */
  showCommandHint: z.boolean().default(true),
});

export type DarkAnimeConfig = z.infer<typeof darkAnimeConfigSchema>;

export const defaultDarkAnimeConfig: DarkAnimeConfig =
  darkAnimeConfigSchema.parse({});
