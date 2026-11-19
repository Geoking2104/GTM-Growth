FROM node:24-bookworm AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
# Main's source imports the shared console model; the root Dockerfile copies it for typecheck parity.
COPY site/console/customer-journey-model.* ./site/console/
RUN pnpm run build && pnpm prune --prod

FROM mcr.microsoft.com/playwright:v1.64.1-noble

# Pilot image: digest must be pinned after an isolated smoke test and before production use.
WORKDIR /app
# Use the build-stage Node binary to keep the native SQLite module on the same ABI.
# Ubuntu Noble glibc is newer than Bookworm.
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY site/console/customer-journey-model.js ./site/console/customer-journey-model.js
RUN node --version && node -e "require('better-sqlite3')(':memory:').close()"
RUN useradd -m -U -s /usr/sbin/nologin geo
USER geo
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
