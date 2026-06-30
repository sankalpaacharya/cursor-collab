<p align="center">
  <img src="assets/logo.png" alt="Live Cursors logo" width="180" />
</p>

<h1 align="center">Cursor Collab</h1>

<p align="center">
  Real-time shared workspace where everyone sees each other's cursor move live —
  <br />the spatial-awareness primitive behind tools like Figma and Miro.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js%20%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white" />
  <img alt="Socket.IO" src="https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socket.io&logoColor=white" />
  <img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Caddy" src="https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" />
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#how-scaling-works">How scaling works</a> ·
  <a href="#protocol">Protocol</a> ·
  <a href="#configuration">Configuration</a>
</p>

---

Built to scale **horizontally**: stateless replicas coordinated through Redis, so
servers can be killed, restarted or upgraded without users noticing more than a
brief reconnect.

```
browser ──▶ caddy (gateway) ──┬──▶ backend 1 ─┐
                              └──▶ backend 2 ─┴──▶ redis
   React/Vite   serves client +     Fastify +      adapter (fan-out)
                load-balances ws     Socket.IO      + presence state
```

## Stack

TypeScript · Fastify + Socket.IO · Redis (`@socket.io/redis-adapter`) · React + Vite · Caddy · pnpm workspaces

## Run it

**Prerequisites:** Node ≥ 22 (≥ 23 recommended), pnpm ≥ 8.

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

Kill a replica to watch crash recovery: `docker compose stop backend1` — clients
reconnect to `backend2` in ~1s and stale cursors clear automatically.

## How scaling works

Two jobs, kept separate:

- **Cross-replica fan-out** — the Socket.IO **Redis adapter** relays room broadcasts
  over pub/sub, so a move on `backend1` reaches peers on `backend2`.
- **Shared snapshot** — a **Redis presence store** gives a late joiner the current
  list and positions of everyone already in the room, and backs crash recovery.

Live `cursor:move` events go through the adapter and **never touch Redis on the hot
path**. Presence is written only on join, on a 10s heartbeat, and on leave — so a
100-user room is ~10 Redis writes/sec, not thousands. A TTL sweep reaps cursors
left behind by a crashed replica.

**Deploying for real:** replicas are stateless, so any horizontal setup works
(K8s, ASG behind an ALB, …). You need (1) a shared Redis, (2) a WebSocket-capable
load balancer with **sticky sessions** — or set the client to `transports:
['websocket']` to avoid needing them — and (3) `/healthz` for probes.

## Project structure

Organised [vertically — by feature](https://tkdodo.eu/blog/the-vertical-codebase),
kebab-cased files.

```
server/src/
  features/
    cursors/    events · types · validate · identity · handlers
    presence/   store interface + redis & in-memory backends
    health/     /healthz · /stats
  shared/       config · logger · redis client
  bootstrap/    index.ts (entry) · app.ts (fastify) · socket.ts (socket.io + adapter)

client/src/
  features/cursors/   components · use-cursors hook · socket · types
  app.tsx · main.tsx
```

## Testing

```bash
pnpm test                                   # integration tests (real socket clients)
USERS=100 DURATION_MS=15000 pnpm loadtest   # 100+ concurrent users (start a server first)
pnpm typecheck                              # both packages
```

The load test reports connection success, broadcast throughput and end-to-end
latency percentiles. Sample (120 users, in-memory single node):

```
connections ok : 120/120
broadcasts recv: 67101/s
latency p50/p95/p99 : 30 / 58 / 185 ms
```

## Protocol

Coordinates are normalised to `0..1` (a fraction of the workspace), so different
window sizes still agree on relative position.

| Direction       | Event           | Payload                     |
| --------------- | --------------- | --------------------------- |
| client → server | `cursor:join`   | `{ roomId, userId, name? }` |
|                 | `cursor:move`   | `{ x, y }`                  |
|                 | `cursor:leave`  | —                           |
| server → client | `cursor:joined` | `{ user }`                  |
|                 | `cursor:moved`  | `{ id, x, y }`              |
|                 | `cursor:left`   | `{ id }`                    |

## Configuration

Backend env vars (full list in [`server/.env.example`](server/.env.example)):

| Variable        | Default                  | Description                              |
| --------------- | ------------------------ | ---------------------------------------- |
| `PORT`          | `3001`                   | listen port                              |
| `REDIS_ENABLED` | `true`                   | `false` → in-memory single-replica mode  |
| `REDIS_URL`     | `redis://localhost:6379` | Redis for adapter + presence             |
| `SERVER_ID`     | auto                     | stable replica id (logs / `/stats`)      |
