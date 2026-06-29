/**
 * Canonical event names shared by the server (and mirrored in the client).
 * Centralising these avoids typo-driven bugs and documents the wire protocol.
 *
 * Declared as a frozen const object (not a TS `enum`) so the source remains
 * fully erasable and runs under Node's native type stripping.
 */
export const EVENTS = {
  // Client -> Server
  JOIN: 'cursor:join', // { roomId, userId, name? }  -> ack({ self, peers })
  MOVE: 'cursor:move', // { x, y }  (normalised 0..1 coordinates)
  LEAVE: 'cursor:leave', // (no payload)

  // Server -> Client
  INIT: 'cursor:init', // { self, peers: [...] }   (also returned via JOIN ack)
  JOINED: 'cursor:joined', // { user }
  MOVED: 'cursor:moved', // { id, x, y }
  LEFT: 'cursor:left', // { id }
} as const;
