# Deploying

One load balancer, a pool of stateless backends, one shared Redis.

```
browser  ->  caddy (LB)  ->  backend x N  ->  redis
```

You always need three things:

- one **redis** all backends share (`REDIS_URL`)
- N **backend replicas** (stateless, kill them freely)
- a **load balancer** that speaks WebSockets, with a `/healthz` check

---

## One machine

```bash
docker compose up --build      # -> http://localhost:8080
```

Redis + 2 backends + caddy on one box. Good for dev and small deploys.

---

## Many machines (Swarm)

```bash
# build images
docker build -t cursor-backend:latest ./server
docker build -t cursor-gateway:latest -f caddy/Dockerfile .

# deploy
docker swarm init
docker stack deploy -c docker-stack.yml --resolve-image=never cursors

# scale anytime, no restart
docker service scale cursors_backend=6
```

- replicas spread across machines, no config change to scale
- rule of thumb: replicas ≈ vCPUs
- more machines: `docker swarm join` on each, push images to a registry, use managed redis

---

## AWS (EC2 + Swarm)

1. push images to **ECR**
2. launch 3 **EC2s**, open ports `2377`, `7946`, `4789` between them
3. `docker swarm init` on one, `docker swarm join` on the rest
4. create **ElastiCache** redis, set `REDIS_URL`
5. edit `docker-stack.yml`: ECR images, `mode: host` -> `ingress`
6. `docker stack deploy -c docker-stack.yml cursors`
7. **ALB** in front: `/healthz`, ACM cert for TLS (ALB speaks WebSockets natively)
8. point **Route 53** at the ALB

---

## Checklist

- **redis**: managed and HA (the bundled one is a single point of failure)
- **TLS**: terminate at the load balancer
- **websocket-only**: clients use one WebSocket, so plain round-robin works (no sticky sessions needed)
- **health check**: `/healthz`

Crash safety: backends are stateless, the LB drops unhealthy ones, clients auto-reconnect and re-sync, and a TTL sweep clears stale cursors.

---

## Config

| Variable        | Default                  | Notes |
| --------------- | ------------------------ | ----- |
| `REDIS_URL`     | `redis://localhost:6379` | shared redis |
| `REDIS_ENABLED` | `true`                   | `false` = single in-memory node |
| `CORS_ORIGIN`   | `*`                      | allowed origins |
| `PORT`          | `3001`                   | listen port |
| `GATEWAY_PORT`  | `8080`                   | published gateway port |

Full list: [`server/.env.example`](server/.env.example).
