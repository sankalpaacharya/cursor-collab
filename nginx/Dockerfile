# ---- Gateway image: builds the React client and serves it behind nginx,
#      which also load-balances Socket.IO traffic to the backend replicas. ----
# Build context is the repo ROOT (see docker-compose.yml) so we can reach client/.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY client/package.json ./
RUN pnpm install

COPY client/ ./
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
