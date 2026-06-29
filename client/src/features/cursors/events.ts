// Wire protocol event names — kept in sync with server/src/socket/events.ts.
export const EVENTS = {
  JOIN: 'cursor:join',
  MOVE: 'cursor:move',
  LEAVE: 'cursor:leave',
  INIT: 'cursor:init',
  JOINED: 'cursor:joined',
  MOVED: 'cursor:moved',
  LEFT: 'cursor:left',
} as const;
