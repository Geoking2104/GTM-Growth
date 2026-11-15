# ─── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci

COPY tsconfig.json ./
COPY src ./src
COPY site/console/customer-journey-model.* ./site/console/

RUN npm run build

# ─── Production stage ─────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001 -G nodejs

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache libstdc++ && apk add --no-cache --virtual .build-deps python3 make g++ && npm ci --omit=dev && npm cache clean --force && apk del .build-deps

COPY --from=builder /app/dist ./dist
COPY site/console/customer-journey-model.js ./site/console/customer-journey-model.js

# Create directory for secrets (optional volume)
RUN mkdir -p /secrets /data && chown -R mcp:nodejs /secrets /data

USER mcp

ENV NODE_ENV=production
ENV TRANSPORT=http
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# Healthcheck for orchestrators (Fly, Railway, Kubernetes...)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js", "--transport", "http"]
