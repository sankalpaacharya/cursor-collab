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

from a fresh clone, `./start` bootstraps pnpm, installs dependencies, and runs the backend + client together:

```bash
./start
```

<p align="center">
  <img src="assets/devcli.jpg" alt="The ./start interactive launcher menu" width="49%" />
  <img src="assets/dev.jpg" alt="Backend and client running in the dev process dashboard" width="49%" />
</p>


### Manual Installation

1. install dependencies

```bash
pnpm install
```

2. start Redis (the backend connects to it)

```bash
docker compose up -d redis
```

3. start the backend (one terminal)

```bash
pnpm dev:server   # → :3001
```

4. start the client (another terminal)

```bash
pnpm dev:client   # → :5173
```

## Architecture Decision

<p align="center">
  <img src="docs/diagram.svg" alt="Architecture: clients → Caddy gateway → backend replicas → Redis" width="100%" />
</p>

Let's follow a single cursor move and see what every box in that diagram is actually doing.

**The client.** It's a plain React app. You move your mouse, it sends the position over a websocket. Now here's the thing, a mouse fires hundreds of events a second. If we sent all of them we'd be DDoSing our own server. So the client only sends about 60 a second, and the newest position wins. It also keeps everyone else's cursors in state and draws them on screen.

**Caddy, the gateway.** This is the single front door. It does three jobs: serves the React app, spreads the websocket connections across the backends, and health-checks each backend so a dead one stops getting traffic.

You might ask, don't we need sticky sessions so a client keeps hitting the same backend? Fair. But we use websocket-only connections, and a websocket is a single long-lived connection. It opens once to whatever backend it lands on and stays there. There's nothing to keep together across requests, so plain round-robin is enough. No cookies, no stickiness.

```
reverse_proxy backend1:3001 backend2:3001 {
    health_uri /healthz
}
```

**The backends.** Fastify + Socket.IO. For now we run two, but you can run as many as you want. The important part is they're stateless. They don't keep anything important in their own memory, all the shared state lives in Redis. That's the whole trick that lets us kill, restart, or add a backend whenever we want and nobody notices more than a quick reconnect.

**Redis.** Here's where it gets interesting, because Redis is doing two completely separate jobs.

The first is fan-out. Say you're on backend1 and I'm on backend2. When you move, backend1 has never heard of me. So it shouts your move into Redis, every backend is listening, and backend2 hears it and passes it to me. Without this, people on different backends just wouldn't see each other.

The second is presence. It's a shared list of who's in each room and where their cursor is. When someone new joins, they read this list and instantly see everyone already there, even the people sitting on other backends. The live fan-out only carries new moves, it can't tell a fresh joiner who was already in the room. That's what presence is for.

**So what happens when a backend dies?** Nothing scary. The state is in Redis, not in the backend, so we lose nothing. Clients reconnect to another backend and re-sync. The only loose end is that a crashed backend can't clean up after itself, so its users would hang around as ghost cursors. A background sweep handles that, anything that hasn't checked in for 30 seconds gets removed.

That's the whole system. Two backends or twenty, the picture is the same.

We're on Docker Swarm for now to keep deployment simple, and we can move to k8s later if it ever needs it. And Caddy serves the React app today, but we could push that to a CDN like Cloudflare whenever we want.

## Folder structure

organised feature-wise (vertical slices). reference: [Vertical Codebase](https://tkdodo.eu/blog/the-vertical-codebase)


## Test it

Integration tests run real Socket.IO clients against the server (join, broadcast, disconnect, validation):

```bash
pnpm test
```

The load test simulates a crowd and measures real end-to-end latency, from a mouse move on one client, through the server, to another client's socket:

```bash
# start a server first, then:
URL=http://localhost:8080 USERS=1000 ROOMS=10 pnpm loadtest
```

## Deploying multiple servers

See [DEPLOY.md](DEPLOY.md). It covers the local Docker topology, scaling with Docker Swarm (one machine or several), and what a real deployment needs: shared Redis, a websocket-aware load balancer, and health checks.
