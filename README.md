# Live Cursors — Real-time Shared Workspace

A backend (and demo client) for a collaborative workspace where every participant
sees everyone else's cursor move in real time — the spatial-awareness primitive
behind tools like Figma, Miro and Google Docs.

The focus is **cursor tracking and broadcast**, designed to be correct under
**horizontal scaling**: multiple backend replicas that can be killed, restarted
or upgraded at any time without users noticing more than a brief reconnect.

```
                          ┌──────────────┐
   browser ──────────────▶│   gateway    │  nginx: serves client +
   (React + Vite)         │  (nginx LB)  │  load-balances WebSockets
                          └──────┬───────┘
                      ┌──────────┴──────────┐
                      ▼                     ▼
              ┌──────────────┐      ┌──────────────┐
              │  backend 1   │      │  backend 2   │   Express + Socket.IO
              │ (Socket.IO)  │      │ (Socket.IO)  │   (stateless replicas)
              └──────┬───────┘      └──────┬───────┘
                     └──────────┬──────────┘
                                ▼
                          ┌──────────┐   • Socket.IO adapter (cross-replica fan-out)
                          │  Redis   │   • Presence store (shared session state)
                          └──────────┘
```

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start (local dev)](#quick-start-local-dev)
- [Multi-server deployment (Docker Compose)](#multi-server-deployment-docker-compose)
- [How horizontal scaling works](#how-horizontal-scaling-works)
- [Configuration](#configuration)
- [Wire protocol](#wire-protocol)
- [Testing](#testing)
- [Performance](#performance)
- [Design decisions](#design-decisions--faq)

---

## Features

- **Real-time cursor tracking** — normalised `(x, y)` coordinates broadcast to
  every other participant in the same room, each tagged with a stable user
  identity (deterministic colour + label).
- **Session management** — join / move / leave, plus transparent handling of
  disconnects, reconnects and replica crashes.
- **WebSocket communication** — Socket.IO with a WebSocket-first transport and
  automatic reconnection.
- **Horizontal scaling** — stateless replicas coordinated through Redis; add more
  replicas behind the load balancer to handle more users.
- **Crash resilience** — presence lives in Redis with a heartbeat/TTL sweep, so a
  killed replica's "ghost" cursors disappear automatically.

## Tech stack

| Layer        | Choice                                                    |
| ------------ | --------------------------------------------------------- |
| Language     | TypeScript (run directly via Node's native type stripping)|
| Backend      | Express + Socket.IO                                       |
| Realtime/scale | `@socket.io/redis-adapter` + Redis                     |
| Frontend     | React + Vite                                              |
| Gateway      | Nginx (static hosting + WebSocket load balancing)        |
| Tooling      | pnpm workspaces, Docker Compose                          |

> **Why no build step?** Node ≥ 23 executes `.ts` files directly by stripping
> types at load time. We keep TypeScript for authoring + `tsc` for type-checking,
> but ship and run the source as-is. The client is bundled by Vite as usual.

## Project structure

The codebase is organised **vertically — by feature, not by technical layer**
([why](https://tkdodo.eu/blog/the-vertical-codebase)). Files are kebab-cased.

```
.
├── server/                       # Express + Socket.IO backend (TypeScript)
│   └── src/
│       ├── features/
│       │   ├── cursors/          # the realtime cursor protocol
│       │   │   ├── events.ts         event-name constants
│       │   │   ├── types.ts          domain + wire-protocol types
│       │   │   ├── validate.ts       untrusted-input validation
│       │   │   ├── identity.ts       deterministic colour/label
│       │   │   └── handlers.ts       join/move/leave + heartbeat/sweep loops
│       │   ├── presence/         # session state (who is where)
│       │   │   ├── store.types.ts    PresenceStore interface
│       │   │   ├── memory-store.ts    in-memory impl (single replica/tests)
│       │   │   ├── redis-store.ts     redis impl (multi-replica)
│       │   │   └── index.ts           backend factory
│       │   └── health/           # /healthz + /stats
│       ├── shared/               # config, logger, redis client
│       ├── app.ts                # Express app
│       ├── socket.ts             # Socket.IO server + Redis adapter
│       └── index.ts              # composition root + graceful shutdown
│   └── test/                     # integration tests + load test
│
├── client/                       # React + Vite demo client (TypeScript)
│   └── src/
│       ├── features/cursors/     # the whole cursor feature
│       │   ├── components/        cursor / workspace / user-list
│       │   ├── use-cursors.ts     the realtime session hook
│       │   ├── socket.ts · events.ts · identity.ts · types.ts
│       │   └── index.ts           feature barrel (public surface)
│       ├── app.tsx · main.tsx · styles.css
│
├── nginx/                        # gateway: builds client + LB config
├── docker-compose.yml            # redis + 2 backends + gateway
└── package.json                  # pnpm workspace root
```

## Quick start (local dev)

**Prerequisites:** Node ≥ 22 (≥ 23 recommended), pnpm ≥ 8. Redis is optional for
local dev — see below.

```bash
pnpm install
```

### Option A — single process, no Redis (fastest)

The server falls back to an in-memory presence store when Redis is disabled.
Perfect for developing the feature on one machine.

```bash
# terminal 1 — backend on :3001
REDIS_ENABLED=false pnpm dev:server

# terminal 2 — client on :5173 (proxies /socket.io to the backend)
pnpm dev:client
```

Open <http://localhost:5173> in **two browser windows** and move your mouse —
each sees the other's cursor. Add `?room=design` to the URL to use a named room.

### Option B — with Redis (mirrors production)

```bash
docker run -d --name cursors-redis -p 6379:6379 redis:7-alpine

pnpm dev:server        # uses redis://localhost:6379 by default
pnpm dev:client
```

## Multi-server deployment (Docker Compose)

This brings up the **full multi-replica topology** on your machine: Redis, two
backend replicas, and an nginx gateway that serves the client and load-balances
WebSocket traffic across the replicas.

```bash
docker compose up --build
# open http://localhost:8080
```

Things to try:

- Open several tabs at <http://localhost:8080> → all cursors are visible, even
  though tabs are spread across `backend1` and `backend2`.
- **Simulate a deploy / crash:** `docker compose stop backend1`. Clients pinned to
  it reconnect (via nginx) to `backend2` within ~1s and keep working; their ghost
  cursors are swept from everyone else's screen within `PRESENCE_TTL_MS`.
- **Scale further:** add `backend3`/`backend4` services (copy the block, change
  `SERVER_ID`) and list them in `nginx/nginx.conf`'s `upstream`.

### Deploying to real infrastructure

The replicas are **stateless** — all shared state is in Redis — so any standard
horizontal-scaling setup works (Kubernetes Deployment + Service, an ASG behind an
ALB, Nomad, etc.). Requirements:

1. **A shared Redis** reachable by every replica (`REDIS_URL`). Use a managed
   Redis (ElastiCache / MemoryStore / Upstash) in production.
2. **A load balancer** that supports WebSockets. Either:
   - enable **sticky sessions** (nginx `ip_hash`, or ALB stickiness), **or**
   - force the client to **WebSocket-only** (`transports: ['websocket']`) so the
     polling handshake that needs stickiness never happens.
3. **`SIGTERM` for graceful shutdown** (the server drains connections on it). Give
   pods/instances a termination grace period ≥ a few seconds. On rolling deploys,
   clients auto-reconnect to a healthy replica.
4. Point your orchestrator's liveness/readiness checks at **`/healthz`**.

## How horizontal scaling works

Two distinct jobs, deliberately separated:

1. **Cross-replica fan-out — the Socket.IO Redis adapter.** When a user on
   `backend1` moves, the `MOVED` event must reach peers connected to `backend2`.
   The adapter publishes room broadcasts over Redis pub/sub so every replica
   delivers them to its own clients. This is what makes `socket.broadcast.to(room)`
   work across the whole fleet.

2. **Shared session snapshot — the presence store (Redis hashes).** A user who
   joins `backend2` needs the *current* list and positions of peers who joined via
   `backend1`. That snapshot is read from Redis on join. Presence is also the basis
   for crash recovery (below).

**Hot-path efficiency:** live `cursor:move` events are broadcast through the
adapter and do **not** write to Redis. The presence store is updated only on
join, on a periodic heartbeat (default every 10s), and on leave — so a room of
100 users moving continuously generates ~10 Redis writes/sec for presence, not
thousands. New joiners get positions accurate to within the heartbeat, then live
updates correct them instantly.

**Crash recovery:** every replica heartbeats `lastSeen` for its own sockets and
runs a sweep that removes presence entries older than `PRESENCE_TTL_MS` (the
signature of a replica that died without cleanup), broadcasting `cursor:left` so
ghost cursors vanish everywhere. Removal is idempotent, so concurrent sweeps
across replicas are safe.

## Configuration

Backend env vars (see [`server/.env.example`](server/.env.example)):

| Variable                | Default                  | Description                                            |
| ----------------------- | ------------------------ | ------------------------------------------------------ |
| `PORT`                  | `3001`                   | HTTP/WebSocket listen port                             |
| `HOST`                  | `0.0.0.0`                | Bind address                                           |
| `CORS_ORIGIN`           | `*`                      | Allowed origin(s), comma-separated, or `*`             |
| `REDIS_ENABLED`         | `true`                   | `false` → in-memory single-replica mode                |
| `REDIS_URL`             | `redis://localhost:6379` | Redis connection (adapter + presence)                  |
| `SERVER_ID`             | auto                     | Stable replica id (shown in logs / `/stats`)           |
| `HEARTBEAT_INTERVAL_MS` | `10000`                  | How often a replica refreshes its presence entries     |
| `PRESENCE_TTL_MS`       | `30000`                  | Age after which a presence entry is swept as stale     |
| `SWEEP_INTERVAL_MS`     | `15000`                  | How often the stale-presence sweep runs                |
| `LOG_LEVEL`             | `info`                   | pino log level                                         |

Client env vars (see [`client/.env.example`](client/.env.example)):

| Variable          | Default | Description                                                        |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `VITE_SERVER_URL` | empty   | Backend origin. Empty = same-origin / dev proxy (recommended).    |

## Wire protocol

Coordinates are **normalised to `0..1`** (a fraction of the workspace), so clients
with different window sizes agree on relative cursor position.

**Client → Server**

| Event          | Payload                          | Notes                                  |
| -------------- | -------------------------------- | -------------------------------------- |
| `cursor:join`  | `{ roomId, userId, name? }`      | Acked with `{ ok, self, peers }`       |
| `cursor:move`  | `{ x, y }`                       | High-frequency; clamped server-side    |
| `cursor:leave` | —                                | Also implied by disconnect             |

**Server → Client**

| Event           | Payload                  | When                                  |
| --------------- | ------------------------ | ------------------------------------- |
| `cursor:joined` | `{ user }`               | Someone joined the room               |
| `cursor:moved`  | `{ id, x, y }`           | A peer moved (sent `volatile`)        |
| `cursor:left`   | `{ id }`                 | A peer left or was swept              |

## Testing

### Integration tests

Real Socket.IO clients against the real handlers (in-memory store, no Redis):

```bash
pnpm test
```

Covers identity assignment, peer snapshots, join/leave broadcasts, move
relaying (and that senders don't echo to themselves), coordinate clamping, and
input validation.

### Load test (100+ concurrent users)

Simulates many users joining one room and moving cursors, then reports connection
success, broadcast throughput and end-to-end latency percentiles.

```bash
# start a backend first (any mode), then in another terminal:
USERS=100 DURATION_MS=15000 MOVE_HZ=20 pnpm loadtest

# against the dockerised gateway:
URL=http://localhost:8080 USERS=200 pnpm loadtest
```

Example output:

```
Connected 100/100 (failed 0) in 412ms

Results
-------
  connections ok : 100/100
  broadcasts recv: 285k (19000/s)
  latency p50    : 2 ms
  latency p95    : 6 ms
  latency p99    : 11 ms
```

### Type-checking

```bash
pnpm typecheck      # both packages
```

## Performance

- **`volatile` broadcasts** for `cursor:move`: if a client's socket buffer is
  backed up, the packet is dropped rather than queued — for cursors the freshest
  position is the only one that matters.
- **Client-side coalescing**: the browser sends at most one position per animation
  frame (~60/s) regardless of how fast the mouse moves.
- **Room-scoped broadcasts**: updates only go to peers in the same room.
- **Presence off the hot path**: see [scaling](#how-horizontal-scaling-works).

## Design decisions / FAQ

**Why Socket.IO over raw `ws`?** It gives reconnection, acks, rooms, transport
fallback and a battle-tested Redis adapter out of the box — exactly the session
and multi-server concerns the brief calls for.

**Why normalised coordinates?** Participants have different viewport sizes;
fractions keep cursors at the same *relative* spot for everyone, and avoid leaking
absolute screen geometry.

**Why a stable `userId` in `localStorage`?** Identity (and therefore colour/label)
must survive reloads and reconnects. The server derives colour/label
deterministically from the id, so the same person looks the same on every screen
and across replicas — even one that never saw their original join.

**Why both an adapter *and* a presence store?** The adapter moves *live events*
between replicas; the store provides the *current snapshot* a late joiner needs
and the data the crash-recovery sweep operates on. Neither replaces the other.
