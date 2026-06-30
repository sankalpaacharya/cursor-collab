import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Creates a Socket.IO client.
 *
 * `VITE_SERVER_URL` selects the backend:
 *   - empty  -> same-origin (works with the Vite dev proxy and with a
 *               load balancer that serves both app and websockets).
 *   - URL    -> connect directly to that origin.
 *
 * Reconnection is left enabled (the default) so that when a backend replica is
 * killed/upgraded, the client transparently reconnects — to another replica via
 * the load balancer — and the app re-joins the room (see useCursors).
 */
export function createSocket(): AppSocket {
  const url = import.meta.env.VITE_SERVER_URL || undefined;
  return io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 8000,
  });
}
