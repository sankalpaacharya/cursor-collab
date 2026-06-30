<p align="center">
  <img src="assets/logo.png" alt="Cursor Collab logo" width="160" />
</p>

<h1 align="center">Cursor Collab</h1>

<p align="center">
  Real-time shared workspace where everyone sees each other's cursor move live.
</p>

## Run it

```bash
./start
```

Bootstraps pnpm, installs dependencies, and runs the backend + client. Add
`--docker` for the full Redis + 2-backend + Caddy topology. Then open
<http://localhost:5173> (or `:8080` with Docker) in two windows.

<p align="center">
  <img src="assets/devcli.jpg" alt="The ./start launcher" width="70%" />
</p>

## How it works

Stateless backend replicas behind a Caddy gateway, coordinated through Redis: the
Socket.IO **Redis adapter** fans out live cursor moves across replicas, and a
**Redis presence store** gives late joiners the current room snapshot. Replicas
can be killed or restarted without users noticing more than a brief reconnect.

```
browser ──▶ caddy ──┬──▶ backend 1 ─┐
                    └──▶ backend 2 ─┴──▶ redis
```

**Stack:** TypeScript · Fastify + Socket.IO · Redis · React + Vite · Caddy · pnpm
