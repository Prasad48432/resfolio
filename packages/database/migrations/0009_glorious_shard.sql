-- Data-only (no schema diff — hand-authored, not drizzle-kit generated).
--
-- The portfolio template set was replaced by `dark-anime` (2026-07-17):
-- `portfolio-minimal`, `portfolio-sidebar` and the short-lived
-- `portfolio-default` are gone from the registry.
--
-- **This migration is the whole point of the change, not a footnote.** A
-- `sites` row pins `template_id` as plain text, and nothing enforces that the
-- template still exists — so deleting a template without repointing its rows
-- takes the live site down: `getPortfolioTemplate` returns undefined and
-- `renderPortfolioPage` 404s, while the dashboard's registry lookup fails and
-- the settings editor reports "Offline". Both happened. Deleting a template is
-- always a data migration.
--
-- `config` is reset alongside `template_id` because config is
-- **template-owned** (doc 03): the old shape (`showAvatar`,
-- `featuredProjectCount`) means nothing to `dark-anime`, and a config that
-- fails the new template's schema renders as a silent 404. `{}` is safe
-- precisely because every `dark-anime` config field carries a default — the
-- same property `defineTemplate` already enforces via `defaultConfig`.
--
-- Sites keep their slug, their pinned profile version, and their published
-- state: the URL is platform-owned and survives a template switch (doc 04).
-- What the owner must do is re-open /portfolio and supply the banner image the
-- new template requires — which is exactly what the setup dialog now asks for.
UPDATE "sites"
SET "template_id" = 'dark-anime',
    "template_major" = 1,
    "config" = '{}'::jsonb,
    -- The live page is now stale in a way publishing must resolve.
    "has_unpublished_changes" = true
WHERE "template_id" IN ('portfolio-minimal', 'portfolio-sidebar', 'portfolio-default');
