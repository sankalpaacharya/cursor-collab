import type { JoinPayload, MovePayload } from './types.ts';

/**
 * Lightweight payload validation for untrusted client input. Kept dependency-free
 * and allocation-light because `validateMove` runs on the hot path.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001F\u007F]/g;

export function validateJoin(payload: unknown): Result<JoinPayload> {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid payload' };
  const p = payload as Record<string, unknown>;

  const roomId = String(p.roomId ?? '').trim();
  const userId = String(p.userId ?? '').trim();

  if (!ID_RE.test(roomId)) return { ok: false, error: 'invalid roomId' };
  if (!ID_RE.test(userId)) return { ok: false, error: 'invalid userId' };

  // Name is optional; sanitise length and strip control characters.
  const name =
    typeof p.name === 'string' ? p.name.replace(CONTROL_RE, '').trim().slice(0, 32) : '';

  return { ok: true, value: { roomId, userId, name } };
}

export function validateMove(payload: unknown): Result<MovePayload> {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid payload' };
  const { x, y } = payload as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
    return { ok: false, error: 'x and y must be numbers' };
  }
  // Coordinates are normalised to 0..1 (fraction of the workspace) so that
  // clients with different viewport sizes still agree on cursor location.
  return { ok: true, value: { x: clamp01(x), y: clamp01(y) } };
}
