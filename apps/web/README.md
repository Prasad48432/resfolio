# apps/web — Resfolio marketing site

The public website at [resfolio.me](https://resfolio.me): landing page,
pricing, and (future) docs/blog/legal pages. It is **not** the product —
the authenticated dashboard lives in `apps/dashboard`.

```bash
pnpm --filter web dev    # http://localhost:3000
```

Read [CLAUDE.md](CLAUDE.md) in this directory before making changes — it
documents the component architecture (Server Components by default, named
client islands), the design system (`@resfolio/design` tokens; see
`design-refs/` for the visual references), typography, motion, and SEO
rules this app follows.
