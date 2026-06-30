# Design decisions

The brief is small — broadcast cursor positions — but the interesting constraints
are "100+ concurrent users", "minimal latency", and "multiple replicas that can be
killed at any time". Most of the decisions below come from taking those three
seriously. Each one is written as: the decision, why, and what it costs.

See [architecture.excalidraw](architecture.excalidraw) for the picture.

---

### 1. Socket.IO instead of a raw WebSocket server

Cursor broadcasting is genuinely simple over a raw `ws` socket. I reached for
Socket.IO anyway because three things it gives for free are exactly the hard parts
of this brief: **rooms** (so a move only reaches the right workspace), **automatic
client reconnection**, and a **Redis adapter** that fans broadcasts out across
replicas. Rebuilding those by hand is where the bugs would live.

**Trade-off:** a heavier protocol and a few KB on the client. For a cursor app
that's invisible; the leverage on the multi-server requirement is worth it.

### 2. Cursor moves never touch Redis

This is the decision I'd most want to talk through. The naive version writes every
cursor position to Redis so other replicas can read it. At 100 users moving at
~30/s that's thousands of Redis writes per second, and Redis becomes the
bottleneck the moment you scale.

Instead, two paths are kept separate:

- **Live moves** go out through the Socket.IO Redis *adapter* (pub/sub). They are
  relayed replica-to-replica and never stored.
- **Presence** (who's in a room, last known position) is the only thing written to
  Redis, and only on **join**, on a **~10s heartbeat**, and on **leave**.

So a busy 100-user room is roughly *ten* Redis writes per second, not tens of
thousands. A late joiner still gets an accurate snapshot of everyone (read once
from presence on join), and live updates correct it immediately after.

**Trade-off:** a peer's stored position can be up to one heartbeat stale — which
only matters for the half-second between a new client joining and the first live
move arriving. Invisible in practice.

### 3. Coordinates are normalized to 0..1

The server stores and broadcasts cursor position as a fraction of the workspace,
not pixels. Two people on a 1440p monitor and a laptop still agree on where a
cursor *is* relative to the shared space.

**Trade-off:** the client multiplies by its own viewport size on render. One line,
and it makes the system resolution-independent.

### 4. Throttle on the client, drop on the server

A mouse fires hundreds of `mousemove` events per second — far more than anyone can
see or any network should carry. The client coalesces them to **one emit per
animation frame** (≈60/s, and it auto-pauses on a backgrounded tab). The server
re-broadcasts each move as a Socket.IO **`volatile`** emit: if a receiving client
is slow, drop the packet instead of queuing it.

Both choices lean on the same insight — for cursors, only the *latest* position
matters. A stale one is worthless, so dropping it is correct, not lossy.

**Trade-off:** under congestion a client may skip intermediate positions, so a fast
flick looks slightly less smooth. The alternative (buffering) would trade that for
growing latency, which is worse.

### 5. Crash recovery via heartbeat + sweep

The brief says replicas can die at arbitrary times. A replica that crashes can't
run its disconnect handler, so its users' presence entries would linger in Redis
as ghost cursors. The fix doesn't depend on graceful shutdown: every replica
refreshes its users' `lastSeen` on the heartbeat, and a background sweep removes
any entry older than a TTL (default 30s) and broadcasts a leave for it.

**Trade-off:** a ghost can linger for up to the TTL after a hard crash. Tunable —
shorter TTL means faster cleanup but more heartbeat writes.

### 6. Replicas are stateless; state lives in Redis

No replica holds anything it can't lose. That's what makes the multi-server
requirement tractable: kill, restart, or roll out a replica and nothing important
is gone. Clients on it reconnect (Socket.IO does this) to another replica through
the load balancer and re-join, replacing their local peer list with a fresh
snapshot from Redis — so they re-sync to truth rather than trusting stale state.

**Trade-off:** every client needs a load balancer with **sticky sessions** (or
websocket-only transport) so Socket.IO's polling handshake lands on one replica.
Documented in DEPLOY.md.

### 7. Fail loud instead of falling back to in-memory

The store has two implementations behind one interface — Redis (multi-replica) and
in-memory (single node, used by the tests). The tempting move is to auto-fall-back
to in-memory when Redis is down. I deliberately didn't. In production that would
mean a deploy that *looks* healthy while users on different replicas silently can't
see each other — split-brain that's miserable to diagnose. With Redis enabled and
unreachable, the server exits with a clear message. In-memory is only reachable by
explicitly asking for it (`REDIS_ENABLED=false`).

**Trade-off:** you can't start the backend without Redis "by accident" — which is
the point.

### 8. Stable identity from the userId, persisted client-side

Colour and label are derived deterministically from a `userId` that lives in the
client's `localStorage`. So a user is the same colour on every screen, and keeps
their identity across a reconnect even if they land on a different replica.

**Trade-off:** no accounts, so identity is per-browser. Right scope for this brief;
swapping in real auth later is just changing where `userId` comes from.

---

## What I'd do next with more time

- Move presence writes to a Lua script / pipeline to make the heartbeat a single
  round-trip per replica rather than per-user.
- Add interpolation on the client so cursors glide between updates instead of
  stepping, which would let me drop the emit rate further.
- Redis is the one stateful piece and a single point of failure here — in
  production it'd be a managed, replicated instance.
