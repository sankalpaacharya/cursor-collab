# Deploying

This is a horizontally-scaled app: a load balancer in front, a pool of identical
stateless backends, and a Redis they all share.

```
            ┌─────────────┐
 browser ──▶│ load balancer│──┬──▶ backend ┐
            │   (Caddy)    │  ├──▶ backend ┤
            └─────────────┘  └──▶ backend ┘
                  serves              │
                  client + LB         ▼
                                    Redis  (adapter pub/sub + presence)
```

Whatever you deploy on — Compose, Swarm, Kubernetes, plain VMs — you need the same
three things:

1. **One Redis** that every backend points at (`REDIS_URL`). It relays cursor
   moves between replicas and stores who's online.
2. **N backend replicas.** They hold no durable state, so you can add, kill, or
   restart them freely.
3. **A WebSocket-aware load balancer** with **sticky sessions** and a health check
   on `/healthz`.

### Why sticky sessions

Socket.IO's initial handshake can use HTTP long-polling, which is several requests
that must all land on the *same* backend. If they get sprayed across replicas the
handshake fails. Two ways to deal with it:

- Sticky sessions on the LB (what we do — Caddy pins each client with a cookie).
- Or force websocket-only transport on the client, which is a single connection
  and needs no stickiness. We keep polling as a fallback for locked-down networks,
  so we went with stickiness.

---

## Local / single box — Docker Compose

Good for development and demos. Brings up Redis, two backends, and the Caddy
gateway:

```bash
docker compose up --build      # → http://localhost:8080
```

Caddy serves the built client, load-balances `/socket.io` across the two backends
with cookie stickiness, and runs active health checks so a restarting replica is
pulled out of rotation. Port is overridable: `GATEWAY_PORT=9090 docker compose up`.

The replica count here is fixed (two services in the compose file). For real
scaling, use Swarm.

---

## Scaling — Docker Swarm

Swarm ships with Docker, so this is the least-effort way to run N replicas and
spread them across machines. No new tooling.

### On one machine (e.g. a single EC2)

```bash
# build the images once
docker build -t cursor-backend:latest ./server
docker build -t cursor-gateway:latest -f caddy/Dockerfile .

# turn the machine into a one-node swarm
docker swarm init

# deploy the stack (local images, so skip the registry lookup)
docker stack deploy -c docker-stack.yml --resolve-image=never cursors

# scale to whatever, whenever
docker service scale cursors_backend=6
```

Caddy finds the replicas through Swarm's built-in `tasks.backend` DNS and
re-resolves every few seconds, so scaling up or down needs no config change and no
restart — new replicas just start taking traffic.

A sizing note: Node is single-threaded, so one backend uses roughly one CPU core.
On a multi-core box you want **replicas ≈ vCPUs**, otherwise the extra cores sit
idle. That's the whole reason to run several containers on one machine.

> Single-node gotcha: the stack publishes the gateway port with `mode: host`
> instead of Swarm's routing mesh. On a one-node swarm the mesh sometimes won't
> route the published port to the task; `mode: host` binds it directly and avoids
> that. On a real multi-node cluster you can switch it back to `ingress`.

### Across several machines

Same stack, more nodes. On each extra machine:

```bash
docker swarm join --token <worker-token> <manager-ip>:2377
```

Swarm schedules the backend replicas across all of them automatically. Two changes
for multi-node:

- Push the images to a registry the nodes can pull (e.g. ECR) and drop
  `--resolve-image=never`.
- Use a managed Redis (ElastiCache, Upstash, …) instead of the bundled container —
  see below.

---

## Surviving kills, restarts, and upgrades

The spec calls this out specifically, so here's exactly how it's handled.

**On the infrastructure side.** Replicas are stateless — all shared state is in
Redis — so losing one loses nothing. The LB health-checks `/healthz` and stops
routing to a replica that's down or restarting, which makes rolling deploys clean:
bring up new replicas, let them pass health checks, drain the old ones.

**On the client side.** Socket.IO reconnects automatically, and the LB sends it to
a healthy replica. On reconnect the client re-joins its room and replaces its local
peer list with the fresh snapshot from the server, so it re-syncs to current truth
rather than trusting stale state. The `userId` lives in `localStorage`, so a user's
identity (their color and label) survives the reconnect even if they land on a
different replica.

**Ghost cursors.** A replica that crashes can't clean up after itself. Every
replica heartbeats its connected users into Redis every ~10s; a sweep removes any
presence entry that hasn't been seen within the TTL (default 30s) and broadcasts a
leave, so abandoned cursors disappear on their own within that window.

---

## Configuration

Backend (per replica):

| Variable                | Default                    | Notes |
| ----------------------- | -------------------------- | ----- |
| `PORT`                  | `3001`                     | listen port |
| `HOST`                  | `0.0.0.0`                  | listen address |
| `REDIS_ENABLED`         | `true`                     | `false` = single in-memory replica (no scaling) |
| `REDIS_URL`             | `redis://localhost:6379`   | shared Redis |
| `SERVER_ID`             | auto (hostname + random)   | shows up in logs and `/stats` |
| `CORS_ORIGIN`           | `*`                        | comma-separated origins, or `*` |
| `HEARTBEAT_INTERVAL_MS` | `10000`                    | how often presence is refreshed |
| `PRESENCE_TTL_MS`       | `30000`                    | stale-cursor cutoff for the sweep |
| `SWEEP_INTERVAL_MS`     | `15000`                    | how often the sweep runs |
| `LOG_LEVEL`             | `info`                     | pino level |
| `NODE_ENV`              | `development`              | `production` for JSON logs |

Compose / Swarm also read `GATEWAY_PORT` (default `8080`) for the published
gateway port.

There's no automatic in-memory fallback. With `REDIS_ENABLED=true` and Redis
unreachable, a backend exits with a clear error rather than starting in degraded
single-node mode — see the README for why.

---

## Production notes

- **Redis is the one stateful piece.** The bundled `redis` container is a single
  point of failure — fine for a demo, not for production. Use a managed,
  highly-available Redis and point `REDIS_URL` at it.
- **TLS** terminates at the gateway / LB; backends speak plain HTTP behind it.
- **Sticky sessions** look different per LB: Caddy uses `lb_policy cookie` (this
  repo), nginx-ingress uses the `affinity: cookie` annotation, an AWS ALB uses
  target-group stickiness. Any of them work.
- `/healthz` is a cheap liveness check; `/stats` reports a replica's live
  connection count and active rooms if you want to eyeball load distribution.
