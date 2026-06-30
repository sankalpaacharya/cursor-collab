# Deploying

The app is a load balancer in front of a pool of identical stateless backends that share one Redis.

```
browser  ->  caddy (load balancer)  ->  backend
                                        backend   ->  redis
                                        backend
```

Wherever you run it, you need the same three things:

1. **one redis** every backend points at (`REDIS_URL`)
2. **N backend replicas** (they hold no state, so add or kill them freely)
3. **a load balancer** with sticky sessions and a `/healthz` health check

Sticky sessions matter because Socket.IO's handshake must keep hitting the same backend. Caddy does this with a cookie.

---

## One machine (Docker Compose)

For dev, demos, or a small deployment. Brings up redis, two backends, and caddy:

```bash
docker compose up --build      # -> http://localhost:8080
```

That is the whole app on one box. To grow, use a bigger box, or move to Swarm.

---

## Many machines (Docker Swarm)

Swarm runs N replicas and spreads them across machines. It ships with Docker, no extra tooling.

### On one machine

```bash
# build the images
docker build -t cursor-backend:latest ./server
docker build -t cursor-gateway:latest -f caddy/Dockerfile .

# start a one-node swarm and deploy
docker swarm init
docker stack deploy -c docker-stack.yml --resolve-image=never cursors

# scale anytime, no restart needed
docker service scale cursors_backend=6
```

Caddy finds the replicas through Swarm's `tasks.backend` DNS and re-checks every few seconds, so scaling up or down needs no config change.

Rule of thumb: Node uses about one CPU core per backend, so run **replicas ≈ vCPUs**.

### Across several machines

Same stack, more nodes. On each extra machine:

```bash
docker swarm join --token <worker-token> <manager-ip>:2377
```

Swarm schedules the replicas across all of them. Two changes for multi-node:

1. push the images to a registry (e.g. ECR) and drop `--resolve-image=never`
2. use a managed redis (ElastiCache, Upstash) instead of the bundled container

---

## Production checklist

- **Managed redis.** The bundled redis is a single point of failure. Use a managed, highly-available one and point `REDIS_URL` at it.
- **TLS** terminates at the load balancer. Backends speak plain HTTP behind it.
- **Sticky sessions** on your load balancer (Caddy cookie, nginx `affinity: cookie`, or AWS ALB target-group stickiness).
- **Health check** on `/healthz`.

How it survives crashes: backends are stateless, so losing one loses nothing. The load balancer stops routing to an unhealthy replica, clients auto-reconnect to a healthy one and re-sync, and a TTL sweep clears cursors left behind by a dead replica.

---

## Config

Backend env vars (full list in [`server/.env.example`](server/.env.example)):

| Variable        | Default                  | Notes |
| --------------- | ------------------------ | ----- |
| `REDIS_URL`     | `redis://localhost:6379` | shared redis |
| `REDIS_ENABLED` | `true`                   | `false` = single in-memory replica (no scaling) |
| `CORS_ORIGIN`   | `*`                      | comma-separated origins, or `*` |
| `PORT`          | `3001`                   | listen port |

Compose and Swarm also read `GATEWAY_PORT` (default `8080`).
