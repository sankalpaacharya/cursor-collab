# Deploying

One load balancer, a pool of stateless backends, one shared Redis.

```
browser  ->  caddy (gateway)  ->  backend x N  ->  redis
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

- caddy serves the SPA and proxies `/socket.io` to the `backend` service; **Swarm** load-balances across the replicas and health-checks them
- replicas spread across machines, no config change to scale
- rule of thumb: replicas ≈ vCPUs
- more machines: `docker swarm join` on each, push images to a registry, use managed redis

---

## AWS (EC2 + Swarm)

What lives where. Docker Swarm is **not** an AWS service, it runs inside the EC2 machines. AWS only sees the instances; `docker node ls` is where you see the cluster.

- **EC2** = the machines that run the swarm (the nodes)
- **ECR** = AWS's private image registry; nodes pull your images from here
- **Security group** = the firewall; open SSH (`22`), the app port (`8080`), and the swarm ports between nodes (`2377` tcp, `7946` tcp+udp, `4789` udp)

```bash
ACCT=<account-id>; REGION=ap-south-1; ECR=$ACCT.dkr.ecr.$REGION.amazonaws.com
```

**1. Build + push images to ECR**

```bash
aws ecr create-repository --repository-name cursor-backend
aws ecr create-repository --repository-name cursor-gateway
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR
docker build -t $ECR/cursor-backend:latest ./server     && docker push $ECR/cursor-backend:latest
docker build -t $ECR/cursor-gateway:latest -f caddy/Dockerfile . && docker push $ECR/cursor-gateway:latest
```

**2. Key pair + security group** (the SSH key and firewall), then **launch 3 EC2s** with Docker installed via user-data (`dnf install -y docker; systemctl enable --now docker`).

**3. Form the swarm** (over SSH)

```bash
# on the manager (use its PRIVATE ip)
docker swarm init --advertise-addr <manager-private-ip>
# on each worker, with the token from the manager
docker swarm join --token <worker-token> <manager-private-ip>:2377
```

**4. Deploy.** Copy `docker-stack.yml` + `caddy/Caddyfile.swarm` to the manager, point the `image:` lines at your ECR URLs, then:

```bash
aws ecr get-login-password | ssh manager "docker login --username AWS --password-stdin $ECR"
ssh manager "docker stack deploy -c docker-stack.yml --with-registry-auth cursors"
```

`--with-registry-auth` forwards the manager's ECR login to the workers so every node can pull the private images.

**5. Verify**

```bash
ssh manager "docker node ls"      # 3 nodes, 1 leader
ssh manager "docker service ls"   # backend 3/3, gateway 1/1, redis 1/1
curl http://<any-node-public-ip>:8080/healthz
```

The gateway uses `mode: ingress`, so the app is reachable on **any** node's public IP (Swarm's routing mesh forwards it to the gateway).

**Production upgrades** (the steps above keep it lean: redis in the swarm, plain HTTP):

- Replace the bundled redis with **ElastiCache**, set `REDIS_URL`.
- Put an **ALB** in front for TLS (ACM cert) + one domain (Route 53). ALB speaks WebSockets natively.
- Give the EC2s an **IAM role** for ECR pull instead of `--with-registry-auth`.

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
