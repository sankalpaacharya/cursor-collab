# ---- Gateway image: builds the React client and serves it behind Caddy,
#      which also load-balances Socket.IO traffic to the backend replicas. ----
# Build context is the repo ROOT (see docker-compose.yml) so we can reach client/.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY client/package.json ./
RUN pnpm install

COPY client/ ./
RUN pnpm build

FROM caddy:2-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
