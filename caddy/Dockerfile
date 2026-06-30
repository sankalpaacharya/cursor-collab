# ---- Gateway image: builds the React client and serves it behind Caddy,
#      which also load-balances Socket.IO traffic to the backend replicas. ----
# Build context is the repo ROOT (see docker-compose.yml) so we can reach client/.

FROM node:24-alpine AS build
WORKDIR /app
# Pin pnpm to the version the project develops against, for reproducible builds.
# (pnpm 11 made "ignored build scripts" a hard error and changed where the
# allow-list lives; pinning avoids that moving target.)
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# esbuild (used by Vite) needs its postinstall to set up the platform binary;
# allow it explicitly via pnpm-workspace.yaml for this standalone build.
COPY client/package.json ./
RUN printf 'onlyBuiltDependencies:\n  - esbuild\n' > pnpm-workspace.yaml \
 && pnpm install

COPY client/ ./
RUN pnpm build

FROM caddy:2-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
