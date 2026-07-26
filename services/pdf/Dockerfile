# Playwright's official image ships Chromium + every system library it needs,
# pinned to the same version as the `playwright` npm package in package.json.
# Keep the two versions in lockstep on any upgrade.
FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

# Install deps first for layer caching. The browsers already live in the base
# image, so this only fetches the (small) playwright npm package; its
# postinstall finds the pre-installed browser for this version and skips the
# download.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
