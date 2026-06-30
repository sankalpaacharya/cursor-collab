<p align="center">
  <img src="assets/logo.png" alt="Cursor Collab logo" width="160" />
</p>

<h1 align="center">Cursor Collab</h1>

<p align="center">
  Real-time shared workspace where everyone sees each other's cursor move live.
</p>

<p align="center">
  <img src="docs/diagram.svg" alt="Architecture: clients → Caddy gateway → backend replicas → Redis" width="100%" />
</p>

## Stack

| Layer        | Tech |
| ------------ | ---- |
| **Frontend** | ![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| **Backend**  | ![Node.js](https://img.shields.io/badge/Node.js%20%E2%89%A522-339933?style=flat-square&logo=node.js&logoColor=white) ![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white) ![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socket.io&logoColor=white) |
| **Infra**    | ![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white) ![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=flat-square&logo=caddy&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white) |

Backend is Fastify + Socket.IO rather than Express — same idea, just a framework I find cleaner for this. Socket.IO gives us rooms, automatic reconnection, and the Redis adapter we need to scale, all out of the box.

## Run it

Prerequisites: Node ≥ 22 (23+ is smoother), and Docker if you want the multi-server setup.

### The quick way

From a fresh clone:

```bash
./start
```

It installs pnpm and dependencies if they're missing, then gives you a menu. For local dev it brings up Redis for you (reuses one already on `:6379`, otherwise starts a throwaway container), runs the backend on `:3001` and the client on `:5173`. Open <http://localhost:5173> in two windows and move your mouse. Add `?room=design` to the URL to join a specific room.

<p align="center">
  <img src="assets/devcli.jpg" alt="The ./start interactive launcher menu" width="49%" />
  <img src="assets/dev.jpg" alt="Backend and client running in the dev process dashboard" width="49%" />
</p>

<p align="center">
  <em>Left: the <code>./start</code> launcher. Right: backend + client live in one dashboard.</em>
</p>

For the full load-balanced topology — Redis, two backends, and a Caddy gateway — use:

```bash
./start --docker        # same as: docker compose up --build  → http://localhost:8080
```

### Running the pieces by hand

```bash
pnpm install
```

The backend wants Redis — that's how replicas share who's online and relay cursor moves to each other. Point it at one and run the two dev servers:

```bash
REDIS_URL=redis://localhost:6379 pnpm dev:server   # :3001
pnpm dev:client                                    # :5173
```

If you just want to click around the UI and don't have Redis handy, run a single in-memory replica instead. This is single-process only — there's no cross-replica sync, so it's for local poking, not deployment:

```bash
REDIS_ENABLED=false pnpm dev:server
```

One thing worth calling out: there's **no silent fallback**. With Redis enabled (the default) and no Redis reachable, the server stops with a clear error instead of quietly running in degraded single-node mode. A silent in-memory fallback in production is a trap — users on different replicas would stop seeing each other and nothing would look broken. Failing loudly is the safer default.

## Test it

Integration tests run real Socket.IO clients against the server (join, broadcast, disconnect, validation):

```bash
pnpm test
```

The load test simulates a crowd and measures real end-to-end latency — mouse move on one client, through the server, to another client's socket:

```bash
# start a server first, then:
URL=http://localhost:8080 USERS=1000 ROOMS=10 pnpm loadtest
```

It reports connection success, broadcast throughput, and p50/p95/p99 latency. 100 users in one room on a laptop lands around p50 21ms / p99 168ms. Knobs (`USERS`, `ROOMS`, `MOVE_HZ`, `DURATION_MS`) are documented at the top of [`server/test/load-test.ts`](server/test/load-test.ts). Point `URL` at `:8080` (the gateway) to exercise multiple replicas, or `:3001` for a single backend.

## How it works

Each client holds one WebSocket. Cursor positions are normalized to `0..1` (a fraction of the workspace) so clients with different window sizes still agree on where a cursor is, then broadcast to everyone else in the same room.

The parts that matter for scale and performance:

- **Replicas don't talk directly.** They sit behind Caddy, and the Socket.IO Redis adapter relays room broadcasts over Redis pub/sub. A move on backend A reaches a client connected to backend B without A and B knowing about each other.
- **Moves never hit Redis on the hot path.** A `cursor:move` goes straight out through the adapter. Redis only stores presence — who's in a room and roughly where — written on join, on a ~10s heartbeat, and on leave. A busy 100-user room is about 10 Redis writes/sec, not thousands. High-frequency movement is also throttled to one emit per animation frame on the client and sent as `volatile` (drop, don't queue, if a client is slow).
- **Replicas are disposable.** Kill or restart one and its clients reconnect to another (Socket.IO handles this) and re-sync the room from Redis. A background sweep clears cursors left behind by a replica that died without cleaning up.

Code is organized by feature: `server/src/features/{cursors,presence,health}` with shared bits in `server/src/shared` and wiring in `server/src/bootstrap`. The client mirrors it under `client/src/features/cursors`.

### Wire protocol

Client → server: `cursor:join { roomId, userId, name? }`, `cursor:move { x, y }`, `cursor:leave`.
Server → client: `cursor:joined { user }`, `cursor:moved { id, x, y }`, `cursor:left { id }`.

## Deploying multiple servers

See [DEPLOY.md](DEPLOY.md). It covers the local Docker topology, scaling with Docker Swarm (one machine or several), and what a real deployment needs — shared Redis, a sticky-session load balancer, and health checks.
