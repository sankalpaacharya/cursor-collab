FROM node:24-alpine

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

COPY package.json ./
RUN pnpm install --prod

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "src/bootstrap/index.ts"]
