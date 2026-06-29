import type { Server } from 'socket.io';
import { config } from '../../shared/config.ts';
import { logger } from '../../shared/logger.ts';
import { colorFor, labelFor } from './identity.ts';
import { EVENTS } from './events.ts';
import { validateJoin, validateMove } from './validate.ts';
import type {
  ClientToServerEvents,
  CursorUser,
  ServerToClientEvents,
  SocketData,
} from './types.ts';
import type { PresenceStore } from '../presence/store.types.ts';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Registers all cursor-related socket handlers and the background presence
 * maintenance loops (heartbeat + stale sweep).
 *
 * Design notes
 * ------------
 * - The authoritative, up-to-the-millisecond cursor for a connected socket lives
 *   in `socket.data.user` (in memory). Live MOVE events are broadcast straight
 *   through the Redis adapter without touching the presence store, so the hot
 *   path does zero Redis writes.
 * - The presence store is written only on JOIN, on each heartbeat, and cleared on
 *   LEAVE/disconnect. It exists to give a *newly joining* peer an immediate
 *   snapshot of everyone already in the room (including those connected to other
 *   replicas) and to enable crash recovery via the sweep.
 *
 * @returns a cleanup function that stops the background loops.
 */
export function registerCursorHandlers(io: TypedServer, store: PresenceStore): () => void {
  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');

    socket.on(EVENTS.JOIN, async (payload, ack) => {
      const result = validateJoin(payload);
      if (!result.ok) {
        if (typeof ack === 'function') ack({ ok: false, error: result.error });
        return;
      }
      const { roomId, userId, name } = result.value;

      const user: CursorUser = {
        id: userId,
        name: name || labelFor(userId),
        color: colorFor(userId),
        x: 0.5,
        y: 0.5,
        serverId: config.serverId,
        lastSeen: Date.now(),
      };

      socket.data.user = user;
      socket.data.roomId = roomId;
      await socket.join(roomId);

      try {
        await store.upsertUser(roomId, user);
        const peers = (await store.getRoom(roomId)).filter((u) => u.id !== userId);

        // Tell everyone else in the room (across all replicas) that we arrived.
        socket.to(roomId).emit(EVENTS.JOINED, { user });

        if (typeof ack === 'function') ack({ ok: true, self: user, peers });
        logger.info({ roomId, userId, serverId: config.serverId }, 'user joined');
      } catch (err) {
        logger.error({ err: (err as Error).message, roomId, userId }, 'join failed');
        if (typeof ack === 'function') ack({ ok: false, error: 'join failed' });
      }
    });

    socket.on(EVENTS.MOVE, (payload) => {
      const user = socket.data.user;
      if (!user || !socket.data.roomId) return; // ignore moves before a successful join

      const result = validateMove(payload);
      if (!result.ok) return;

      user.x = result.value.x;
      user.y = result.value.y;
      user.lastSeen = Date.now();

      // `volatile` => if a receiving client's buffer is backed up, drop this
      // packet rather than queueing it. For cursors, the freshest position wins
      // and stale positions are worthless, so dropping is exactly right.
      socket.volatile.to(socket.data.roomId).emit(EVENTS.MOVED, {
        id: user.id,
        x: user.x,
        y: user.y,
      });
    });

    const leave = async (reason: string): Promise<void> => {
      const user = socket.data.user;
      const roomId = socket.data.roomId;
      if (!user || !roomId) return;
      socket.data.user = null;

      try {
        await store.removeUser(roomId, user.id);
        socket.to(roomId).emit(EVENTS.LEFT, { id: user.id });
        logger.info({ roomId, userId: user.id, reason }, 'user left');
      } catch (err) {
        logger.error({ err: (err as Error).message, roomId, userId: user.id }, 'leave failed');
      }
    };

    socket.on(EVENTS.LEAVE, () => void leave('explicit'));
    socket.on('disconnect', (reason) => void leave(reason));
  });

  return startPresenceLoops(io, store);
}

/**
 * Background loops, run by every replica:
 *
 *  - Heartbeat: refresh `lastSeen` (and the latest position) in the presence
 *    store for every socket this replica owns. This keeps idle-but-connected
 *    cursors alive and persists a recent position for late-joining peers.
 *
 *  - Sweep: remove presence entries whose `lastSeen` is older than the TTL — the
 *    signature of a replica that crashed without cleaning up — and broadcast a
 *    LEFT so every client removes the ghost cursor. `removeUser` is idempotent,
 *    so concurrent sweeps across replicas don't double-emit.
 */
function startPresenceLoops(io: TypedServer, store: PresenceStore): () => void {
  const heartbeat = setInterval(async () => {
    const now = Date.now();
    const sockets = await io.local.fetchSockets();
    for (const socket of sockets) {
      const user = socket.data.user;
      const roomId = socket.data.roomId;
      if (!user || !roomId) continue;
      user.lastSeen = now;
      try {
        await store.upsertUser(roomId, user);
      } catch (err) {
        logger.warn({ err: (err as Error).message, userId: user.id }, 'heartbeat upsert failed');
      }
    }
  }, config.heartbeatIntervalMs);

  const sweep = setInterval(async () => {
    try {
      const removed = await store.sweepStale(config.presenceTtlMs, Date.now());
      for (const { roomId, userId } of removed) {
        io.to(roomId).emit(EVENTS.LEFT, { id: userId });
        logger.warn({ roomId, userId }, 'swept stale presence (likely replica crash)');
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'sweep failed');
    }
  }, config.sweepIntervalMs);

  // Don't let these timers keep the process alive on shutdown.
  heartbeat.unref?.();
  sweep.unref?.();

  return () => {
    clearInterval(heartbeat);
    clearInterval(sweep);
  };
}
