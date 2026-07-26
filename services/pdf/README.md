# Resfolio PDF microservice

A tiny **URL → PDF** renderer (Node + Playwright/Chromium) that runs on
[Fly.io](https://fly.io), off the Vercel platform. `apps/sites` offloads resume
PDF export to it so Chromium never has to run inside a Vercel serverless
function — which is what makes export work on **Vercel Hobby** (1 GB function
limit).

It is **standalone**: not part of the pnpm workspace, no `@resfolio/*` deps, its
own `node_modules`. It holds no application secrets and touches no database — it
only prints a page it is told to load.

## How it fits

```
dashboard  /api/resumes/[id]/pdf   (verifies session + ownership)
   └─► sites  /api/export/resume/[id]   (RENDER_SECRET bearer)
          └─► THIS SERVICE  POST /render   (PDF_SERVICE_SECRET bearer)
                 └─► loads sites /render/resume/[id]/draft  (replays RENDER_SECRET)
                        └─► returns application/pdf
```

`lib/pdf.ts` in `apps/sites` picks the `remote` engine (this service) whenever
`PDF_SERVICE_URL` + `PDF_SERVICE_SECRET` are set; otherwise it falls back to
in-function `serverless` Chromium (Vercel Pro) or `local` (dev).

## API

- `GET /health` → `200 {"ok":true}` (Fly health check).
- `POST /render` — `Authorization: Bearer <PDF_SERVICE_SECRET>`, body
  `{ "url": "https://…", "headers": { "authorization": "Bearer <RENDER_SECRET>" } }`
  → `200 application/pdf`, or `401` / `400` / `502`.

## Deploy (Fly.io)

Install [flyctl](https://fly.io/docs/flyctl/install/), then from this directory:

```bash
fly launch --no-deploy          # first time; accept/adjust fly.toml (app name, region)
fly secrets set PDF_SERVICE_SECRET=<a long random string, ≥16 chars>
fly deploy
fly status                      # note the app URL, e.g. https://resfolio-pdf.fly.dev
```

Generate the secret with e.g. `openssl rand -base64 32`.

## Wire it to apps/sites

Set these on the **sites** Vercel project (the secret must match the one above):

```
PDF_SERVICE_URL=https://resfolio-pdf.fly.dev
PDF_SERVICE_SECRET=<same value you set on Fly>
```

Redeploy `apps/sites`. The Download-PDF button now renders through Fly. Nothing
in the dashboard changes — it still needs `RENDER_SECRET` + `SITES_URL`.

## Verify

```bash
curl https://resfolio-pdf.fly.dev/health          # {"ok":true}
# 401 without the bearer (expected):
curl -X POST https://resfolio-pdf.fly.dev/render   # {"ok":false,"error":"unauthorized"}
```

Then click **Download PDF** in the dashboard for a real end-to-end check.

## Upgrading Playwright

Bump **both** the `FROM mcr.microsoft.com/playwright:vX.Y.Z-noble` tag in the
`Dockerfile` and the `playwright` version in `package.json` to the same version,
then `fly deploy`.

## Notes

- **Cost**: `auto_stop_machines` scales to zero when idle, so an occasional PDF
  costs almost nothing; the first request after idle pays a ~2–5s cold start.
- **Memory**: 1 GB renders one page comfortably. If you see exit code 137 (OOM)
  under concurrent exports, raise `memory` in `fly.toml` to `2048mb`.
- **Security**: the service refuses any request without the bearer, so it can't
  be used as an open URL fetcher. It still renders whatever URL an authorized
  caller sends — that caller is `apps/sites`, which only ever sends its own
  draft render route.
