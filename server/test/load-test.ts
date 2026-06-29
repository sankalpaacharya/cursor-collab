/**
 * Load / soak test: simulates many concurrent users joining one room and moving
 * their cursors at a fixed rate, then reports connection success, broadcast
 * throughput, and end-to-end latency percentiles.
 *
 * All simulated clients run in this single process, which means a designated
 * "sender" and the "receivers" share one wall clock — so we can measure true
 * end-to-end latency (send -> broadcast -> receive) without changing the wire
 * protocol.
 *
 * Usage:
 *   URL=http://localhost:3001 USERS=100 DURATION_MS=15000 MOVE_HZ=20 \
 *     pnpm loadtest
 */
import { io as ioClient, type Socket } from 'socket.io-client';
import { EVENTS } from '../src/features/cursors/events.ts';
import type { JoinAck } from '../src/features/cursors/types.ts';

const URL = process.env.URL ?? 'http://localhost:3001';
const USERS = Number.parseInt(process.env.USERS ?? '100', 10);
const ROOM = process.env.ROOM ?? 'loadtest';
const DURATION_MS = Number.parseInt(process.env.DURATION_MS ?? '15000', 10);
const MOVE_HZ = Number.parseInt(process.env.MOVE_HZ ?? '20', 10);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const pct = (sorted: number[], p: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

async function run(): Promise<void> {
  console.log(
    `Load test -> ${URL}\n  users=${USERS} room=${ROOM} duration=${DURATION_MS}ms moveHz=${MOVE_HZ}\n`,
  );

  const clients: Array<{ socket: Socket; userId: string }> = [];
  let connected = 0;
  let failed = 0;
  let received = 0;
  const latencies: number[] = [];

  // The sender's most recent emit time, shared across the process.
  let senderLastEmit = 0;
  const SENDER_ID = 'user-0';

  // ---- connect all users ----
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: USERS }, (_, i) => {
      return new Promise<void>((resolve) => {
        const userId = `user-${i}`;
        const socket = ioClient(URL, { transports: ['websocket'], reconnection: false });

        socket.on('connect', () => {
          socket.emit(EVENTS.JOIN, { roomId: ROOM, userId }, (ack: JoinAck) => {
            if (ack?.ok) connected += 1;
            else failed += 1;
            resolve();
          });
        });

        socket.on('connect_error', () => {
          failed += 1;
          resolve();
        });

        // Every client counts broadcasts; receivers of the sender's moves
        // measure latency against the shared emit timestamp.
        socket.on(EVENTS.MOVED, (m: { id: string }) => {
          received += 1;
          if (m.id === SENDER_ID && senderLastEmit) {
            latencies.push(Date.now() - senderLastEmit);
          }
        });

        clients.push({ socket, userId });
      });
    }),
  );
  console.log(`Connected ${connected}/${USERS} (failed ${failed}) in ${Date.now() - t0}ms\n`);

  // ---- drive cursor movement ----
  const intervalMs = Math.max(1, Math.floor(1000 / MOVE_HZ));
  const timers = clients.map(({ socket, userId }) =>
    setInterval(() => {
      if (userId === SENDER_ID) senderLastEmit = Date.now();
      socket.emit(EVENTS.MOVE, { x: Math.random(), y: Math.random() });
    }, intervalMs),
  );

  await sleep(DURATION_MS);
  timers.forEach(clearInterval);
  // Give in-flight broadcasts a moment to land before tearing down.
  await sleep(500);

  // ---- report ----
  const seconds = DURATION_MS / 1000;
  const sorted = latencies.sort((a, b) => a - b);
  console.log('Results');
  console.log('-------');
  console.log(`  connections ok : ${connected}/${USERS}`);
  console.log(`  broadcasts recv: ${received} (${Math.round(received / seconds)}/s)`);
  console.log(`  latency samples: ${sorted.length}`);
  console.log(`  latency p50    : ${pct(sorted, 50)} ms`);
  console.log(`  latency p95    : ${pct(sorted, 95)} ms`);
  console.log(`  latency p99    : ${pct(sorted, 99)} ms`);
  console.log(`  latency max    : ${sorted[sorted.length - 1] ?? 0} ms`);

  clients.forEach(({ socket }) => socket.close());
  await sleep(200);
  process.exit(0);
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
