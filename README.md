<p align="center">
  <img src="assets/logo.png" alt="Cursor Collab logo" width="160" />
</p>

<h1 align="center">Cursor Collab</h1>

<p align="center">
  Real-time shared workspace where everyone sees each other's cursor move live.
</p>

## Stack

| Layer        | Tech |
| ------------ | ---- |
| **Frontend** | ![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| **Backend**  | ![Node.js](https://img.shields.io/badge/Node.js%20%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white) ![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white) ![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socket.io&logoColor=white) |
| **Infra**    | ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white) ![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white) |

## Run it

**Prerequisites:** Node ≥ 22 (≥ 23 recommended), pnpm ≥ 8.

### The one-command way

From a fresh clone, just run:

```bash
./start
```

It bootstraps pnpm, installs dependencies, and launches the backend + client
together — pick what you want from the menu (or `./start --docker` for the full
Redis + 2-backend + Caddy topology).

<p align="center">
  <img src="assets/devcli.jpg" alt="The ./start interactive launcher menu" width="49%" />
  <img src="assets/dev.jpg" alt="Backend and client running in the dev process dashboard" width="49%" />
</p>

<p align="center">
  <em>Left: the <code>./start</code> launcher. Right: backend + client live in one dashboard.</em>
</p>

### Manual setup

```bash
pnpm install
```

**Local dev** — no Redis needed (falls back to an in-memory store):

```bash
REDIS_ENABLED=false pnpm dev:server   # backend → :3001
pnpm dev:client                       # client  → :5173
```

Open <http://localhost:5173> in two windows and move your mouse. Use `?room=design`
in the URL to pick a room.

**Full multi-server topology** — Redis + 2 backends + Caddy gateway, via Docker:

```bash
docker compose up --build             # → http://localhost:8080
```
