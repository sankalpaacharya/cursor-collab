import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/bootstrap/app.ts';
import { createSocketServer, type SocketServer } from '../src/bootstrap/socket.ts';
import { MemoryPresenceStore } from '../src/features/presence/memory-store.ts';
import { EVENTS } from '../src/features/cursors/events.ts';
import type { JoinAck, JoinPayload } from '../src/features/cursors/types.ts';

// These tests exercise the real handlers against the in-memory presence store,
// so they need no Redis. Run with: pnpm test
process.env.REDIS_ENABLED = 'false';

let app: FastifyInstance;
let socketServer: SocketServer;
let url: string;

const connect = (): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const join = (socket: Socket, payload: JoinPayload): Promise<JoinAck> =>
  new Promise((resolve) => socket.emit(EVENTS.JOIN, payload, resolve));

const once = <T = unknown>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

before(async () => {
  const store = new MemoryPresenceStore();
  await store.connect();
  app = await createApp(async () => ({}));
  socketServer = await createSocketServer(app.server, store, false);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  url = `http://localhost:${port}`;
});

after(async () => {
  await socketServer.close();
  await app.close();
});

test('join returns self identity and an empty peer list for the first user', async () => {
  const a = await connect();
  const ack = await join(a, { roomId: 'room1', userId: 'alice' });
  assert.equal(ack.ok, true);
  assert.equal(ack.self?.id, 'alice');
  assert.ok(ack.self?.color, 'a colour is assigned');
  assert.ok(ack.self?.name, 'a label is assigned');
  assert.deepEqual(ack.peers, []);
  a.close();
});

test('a second joiner sees the first as a peer, and the first is notified', async () => {
  const a = await connect();
  await join(a, { roomId: 'room2', userId: 'alice' });

  const joinedPromise = once<{ user: { id: string } }>(a, EVENTS.JOINED);
  const b = await connect();
  const ackB = await join(b, { roomId: 'room2', userId: 'bob' });

  assert.equal(ackB.peers?.length, 1);
  assert.equal(ackB.peers?.[0].id, 'alice');

  const joined = await joinedPromise;
  assert.equal(joined.user.id, 'bob');

  a.close();
  b.close();
});

test('cursor moves are broadcast to peers but not the sender', async () => {
  const a = await connect();
  const b = await connect();
  await join(a, { roomId: 'room3', userId: 'alice' });
  await join(b, { roomId: 'room3', userId: 'bob' });

  let aGotOwnMove = false;
  a.on(EVENTS.MOVED, (m: { id: string }) => {
    if (m.id === 'alice') aGotOwnMove = true;
  });

  const movedPromise = once<{ id: string; x: number; y: number }>(b, EVENTS.MOVED);
  a.emit(EVENTS.MOVE, { x: 0.25, y: 0.75 });

  const moved = await movedPromise;
  assert.equal(moved.id, 'alice');
  assert.equal(moved.x, 0.25);
  assert.equal(moved.y, 0.75);
  assert.equal(aGotOwnMove, false, 'sender does not receive its own move');

  a.close();
  b.close();
});

test('out-of-range coordinates are clamped to 0..1', async () => {
  const a = await connect();
  const b = await connect();
  await join(a, { roomId: 'room4', userId: 'alice' });
  await join(b, { roomId: 'room4', userId: 'bob' });

  const movedPromise = once<{ x: number; y: number }>(b, EVENTS.MOVED);
  a.emit(EVENTS.MOVE, { x: 5, y: -3 });
  const moved = await movedPromise;
  assert.equal(moved.x, 1);
  assert.equal(moved.y, 0);

  a.close();
  b.close();
});

test('disconnect broadcasts a leave to remaining peers', async () => {
  const a = await connect();
  const b = await connect();
  await join(a, { roomId: 'room5', userId: 'alice' });
  await join(b, { roomId: 'room5', userId: 'bob' });

  const leftPromise = once<{ id: string }>(b, EVENTS.LEFT);
  a.close();
  const left = await leftPromise;
  assert.equal(left.id, 'alice');

  b.close();
});

test('invalid join is rejected with an error ack', async () => {
  const a = await connect();
  const ack = await join(a, { roomId: 'bad room!!', userId: 'alice' });
  assert.equal(ack.ok, false);
  assert.match(ack.error ?? '', /roomId/);
  a.close();
});
