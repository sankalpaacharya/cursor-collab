import { useEffect, useRef, useState, useCallback } from 'react';
import { createSocket, type AppSocket } from '../lib/socket';
import { EVENTS } from '../lib/events';
import { getUserId } from '../lib/identity';
import type { ConnectionStatus, CursorUser, JoinAck } from '../types';

interface UseCursorsResult {
  self: CursorUser | null;
  peers: CursorUser[];
  status: ConnectionStatus;
  sendMove: (x: number, y: number) => void;
}

/**
 * Owns the realtime cursor session for a given room.
 *
 * Responsibilities:
 *   - Maintain the socket connection and (re)join the room on every (re)connect,
 *     so a backend restart/upgrade is recovered automatically.
 *   - Keep a map of peer cursors, updated from JOINED / MOVED / LEFT events.
 *   - Expose a `sendMove` that is throttled to one emit per animation frame, so
 *     even very high-frequency mouse movement produces at most ~60 emits/sec.
 */
export function useCursors(roomId: string, name: string): UseCursorsResult {
  const [peers, setPeers] = useState<Map<string, CursorUser>>(() => new Map());
  const [self, setSelf] = useState<CursorUser | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const socketRef = useRef<AppSocket | null>(null);
  // Latest pending position + a flag so we coalesce moves into one rAF emit.
  const pending = useRef({ x: 0.5, y: 0.5, dirty: false, raf: 0 });

  // Keep the latest name in a ref so reconnect-join uses the current value
  // without needing to re-create the socket when the name changes.
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    const userId = getUserId();

    const doJoin = (): void => {
      socket.emit(EVENTS.JOIN, { roomId, userId, name: nameRef.current }, (ack: JoinAck) => {
        if (!ack?.ok) {
          setStatus('error');
          return;
        }
        setSelf(ack.self ?? null);
        // Replace the peer map wholesale with the authoritative snapshot. This
        // is what makes reconnection seamless: we re-sync to current truth.
        setPeers(new Map((ack.peers ?? []).map((p) => [p.id, p])));
        setStatus('connected');
      });
    };

    socket.on('connect', () => {
      setStatus('connected');
      doJoin();
    });
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));

    socket.on(EVENTS.JOINED, ({ user }) => {
      setPeers((prev) => new Map(prev).set(user.id, user));
    });

    socket.on(EVENTS.MOVED, ({ id, x, y }) => {
      setPeers((prev) => {
        const existing = prev.get(id);
        if (!existing) return prev; // move before we learned of this peer
        const next = new Map(prev);
        next.set(id, { ...existing, x, y });
        return next;
      });
    });

    socket.on(EVENTS.LEFT, ({ id }) => {
      setPeers((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    return () => {
      cancelAnimationFrame(pending.current.raf);
      socket.emit(EVENTS.LEAVE);
      socket.close();
    };
  }, [roomId]);

  const flush = useCallback(() => {
    pending.current.raf = 0;
    if (!pending.current.dirty) return;
    pending.current.dirty = false;
    socketRef.current?.emit(EVENTS.MOVE, { x: pending.current.x, y: pending.current.y });
  }, []);

  const sendMove = useCallback(
    (x: number, y: number) => {
      pending.current.x = x;
      pending.current.y = y;
      pending.current.dirty = true;
      if (!pending.current.raf) {
        pending.current.raf = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  return { self, peers: [...peers.values()], status, sendMove };
}
