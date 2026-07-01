<p align="center">
  <img src="assets/logo.png" alt="Cursor Collab logo" width="160" />
</p>

<h1 align="center">Cursor Collab</h1>

<p align="center">
  Real-time shared workspace where everyone sees each other's cursor move live.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node-%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img alt="Socket.IO" src="https://img.shields.io/badge/Socket.IO-over_WebSocket-010101?style=flat-square&logo=socket.io&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-adapter%20%2B%20presence-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose%20%2B%20Swarm-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-passing-2f9e44?style=flat-square" />
</p>

## Set Up

From a fresh clone, `./start` bootstraps pnpm, installs dependencies, and runs the backend + client together:

```bash
./start
```

<p align="center">
  <img src="assets/devcli.jpg" alt="The ./start interactive launcher menu" width="49%" />
  <img src="assets/dev.jpg" alt="Backend and client running in the dev process dashboard" width="49%" />
</p>

### Manual

```bash
pnpm install
docker compose up -d redis    # the backend connects to it
pnpm dev:server               # → :3001
pnpm dev:client               # → :5173  (open in two windows)
```

## How it works

<p align="center">
  <img src="docs/architecture.svg" alt="Caddy serves the React app; the WebSocket goes straight to the backend where Swarm load-balances across replicas; Redis handles fan-out and presence" width="100%" />
</p>

The browser loads the React app from **Caddy**, then opens a **WebSocket straight to the backend**, where **Docker Swarm load-balances** it across N stateless **Fastify + Socket.IO** replicas.

**Redis does two jobs:**

- **Adapter (fan-out).** A backend can only reach its *own* clients. So it publishes cursor moves to Redis; the other backends are subscribed and deliver to theirs. This is what lets people on different backends see each other.
- **Presence.** A shared list of who's in each room, so a late joiner instantly sees everyone already there. It also backs crash recovery.

Backends are **stateless** (all shared state is in Redis), so any can be killed or restarted freely; a TTL sweep clears cursors left by a crashed one. The client throttles moves to ~60/sec so a fast mouse never floods the server.

Editable diagram source: [`docs/architecture-split.excalidraw`](docs/architecture-split.excalidraw) (open in [Excalidraw](https://excalidraw.com)).

## Deploy

- **One machine** (dev/demo): `docker compose up --build` → http://localhost:8080
- **Many machines** (production, incl. AWS): Docker Swarm across N nodes, `docker stack deploy`.

Full runbook (ECR, EC2, swarm, scaling, teardown) in [DEPLOY.md](DEPLOY.md).

## Test

```bash
pnpm test                                         # integration (real socket clients)
URL=http://localhost:3001 USERS=100 pnpm loadtest # 100+ concurrent users, latency percentiles
pnpm test:e2e                                     # end-to-end in real browsers
```

## Structure

Organised feature-wise (vertical slices). Reference: [Vertical Codebase](https://tkdodo.eu/blog/the-vertical-codebase).
