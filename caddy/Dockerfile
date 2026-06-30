FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

COPY client/package.json ./
RUN printf 'onlyBuiltDependencies:\n  - esbuild\n' > pnpm-workspace.yaml \
 && pnpm install

COPY client/ ./
RUN pnpm build

FROM caddy:2-alpine
COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
