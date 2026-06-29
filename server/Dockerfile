# ---- Backend image: Fastify + Socket.IO cursor server (TypeScript) ----
# Node >= 23 runs .ts directly via native type stripping, so there is no build
# step — we ship the source and execute it.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

# Install production dependencies first to leverage Docker layer caching.
# (Built standalone — the workspace lockfile lives at the repo root.)
COPY package.json ./
RUN pnpm install --prod

# Copy source + tsconfig.
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001

# Liveness probe used by orchestrators / compose.
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run as the built-in non-root user.
USER node

CMD ["node", "src/bootstrap/index.ts"]
