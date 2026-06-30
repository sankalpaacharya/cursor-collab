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

2. start docker services

```bash
docker compose up all
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

we are using caddy as the gateway and fastify as the backend framework, with react on the frontend.

caddy spreads users across the backends round-robin. because we use websocket-only connections, each client opens a single long-lived connection to whichever backend it lands on and stays there for the whole session. so we don't need sticky sessions or cookies. caddy just health-checks the backends and stops routing to any that go down.

this is set in the caddy config:
```
reverse_proxy backend1:3001 backend2:3001 {
    health_uri /healthz
}
```

caddy also serves the built react app, so there's a single entry point for both the client and the websockets.

for now we run 2 backend containers, `backend1` and `backend2`, but it can be scaled to as many as we want. once a user hits a backend we store their session in redis so every backend can read it. redis does one more job too: it relays cursor moves between backends over pub/sub, so a move made by someone on `backend1` still reaches users connected to `backend2`. without that, people on different backends couldn't see each other.

we use docker swarm for now to keep deployment simple, but we can move to k8s later if it gets more complex.

rn caddy serves a built SPA react app just for now but we can deploy it in cloudflare CDN later on if we want

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
