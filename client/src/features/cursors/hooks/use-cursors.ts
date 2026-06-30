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

export function useCursors(roomId: string, name: string): UseCursorsResult {
  const [peers, setPeers] = useState<Map<string, CursorUser>>(() => new Map());
  const [self, setSelf] = useState<CursorUser | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const socketRef = useRef<AppSocket | null>(null);
  const pending = useRef({ x: 0.5, y: 0.5, dirty: false, raf: 0 });
  const incomingMoves = useRef(new Map<string, { x: number; y: number }>());
  const movesRaf = useRef(0);

  const nameRef = useRef(name);
  nameRef.current = name;
  const renameInitialized = useRef(false);

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

    const flushMoves = (): void => {
      movesRaf.current = 0;
      if (incomingMoves.current.size === 0) return;
      const batch = incomingMoves.current;
      incomingMoves.current = new Map();
      setPeers((prev) => {
        const next = new Map(prev);
        let changed = false;
        batch.forEach((pos, id) => {
          const existing = next.get(id);
          if (existing) {
            next.set(id, { ...existing, x: pos.x, y: pos.y });
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };

    socket.on(EVENTS.MOVED, ({ id, x, y }) => {
      incomingMoves.current.set(id, { x, y });
      if (!movesRaf.current) movesRaf.current = requestAnimationFrame(flushMoves);
    });

    socket.on(EVENTS.LEFT, ({ id }) => {
      setPeers((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });

    socket.on(EVENTS.RENAMED, ({ id, name: newName }) => {
      setPeers((prev) => {
        const existing = prev.get(id);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(id, { ...existing, name: newName });
        return next;
      });
    });

    return () => {
      cancelAnimationFrame(pending.current.raf);
      cancelAnimationFrame(movesRaf.current);
      socket.emit(EVENTS.LEAVE);
      socket.close();
    };
  }, [roomId]);

  useEffect(() => {
    if (!renameInitialized.current) {
      renameInitialized.current = true;
      return;
    }
    const socket = socketRef.current;
    if (!socket) return;
    const timer = setTimeout(() => {
      if (!socket.connected) return;
      socket.emit(EVENTS.RENAME, { name }, (res: { name: string }) => {
        setSelf((prev) => (prev ? { ...prev, name: res.name } : prev));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

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
