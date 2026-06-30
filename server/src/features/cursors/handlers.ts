import type { Server } from 'socket.io';
import { config } from '../../shared/config.ts';
import { logger } from '../../shared/logger.ts';
import { colorFor, labelFor } from './identity.ts';
import { EVENTS } from './events.ts';
import { validateJoin, validateMove, validateName } from './validate.ts';
import type {
  ClientToServerEvents,
  CursorUser,
  ServerToClientEvents,
  SocketData,
} from './types.ts';
import type { PresenceStore } from '../presence/store.types.ts';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

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
      if (!user || !socket.data.roomId) return;

      const result = validateMove(payload);
      if (!result.ok) return;

      user.x = result.value.x;
      user.y = result.value.y;
      user.lastSeen = Date.now();

      socket.volatile.to(socket.data.roomId).emit(EVENTS.MOVED, {
        id: user.id,
        x: user.x,
        y: user.y,
      });
    });

    socket.on(EVENTS.RENAME, async (payload, ack) => {
      const user = socket.data.user;
      const roomId = socket.data.roomId;
      if (!user || !roomId) return;

      user.name = validateName(payload) || labelFor(user.id);
      user.lastSeen = Date.now();

      try {
        await store.upsertUser(roomId, user);
        socket.to(roomId).emit(EVENTS.RENAMED, { id: user.id, name: user.name });
        if (typeof ack === 'function') ack({ name: user.name });
        logger.info({ roomId, userId: user.id, name: user.name }, 'user renamed');
      } catch (err) {
        logger.error({ err: (err as Error).message, roomId, userId: user.id }, 'rename failed');
      }
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

  heartbeat.unref?.();
  sweep.unref?.();

  return () => {
    clearInterval(heartbeat);
    clearInterval(sweep);
  };
}
